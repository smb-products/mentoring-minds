/**
 * S20: every call to Claude counts toward AI_DAILY_LIMIT before it's made, failed ones too.
 * Claude is stubbed as in the other AI tests; sign-in goes through as(), never a mocked auth().
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { as, db, fails, freshDemo, ok, upcomingSession } from './helpers';
import { AI_DAILY_LIMIT, EFFORT, MODEL } from '@/lib/ai/prompts';

const claude = vi.hoisted(() => ({ reply: '' as string, stop: 'end_turn' as string, error: null as Error | null, calls: 0 }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async () => {
        claude.calls++;
        if (claude.error) throw claude.error;
        return { stop_reason: claude.stop, content: [{ type: 'text', text: claude.reply }] };
      },
    };
  },
}));

import * as ai from '@/server/ai';
import * as books from '@/server/books';

freshDemo();

const NOTE = JSON.stringify({ note: 'We worked on fractions.', homework: null, skills: [], redo: [], unsure: [] });
const PAGE = JSON.stringify({ test: 'T4', items: [{ number: 1, answer: 'B', format: 'MC', benchmarkCode: null, confident: true }] });
const RECAP = 'We practiced fractions on a number line today.';
const image = { mediaType: 'image/jpeg' as const, base64: 'A'.repeat(400) };
const today = () => db.aiDraft.count({ where: { createdAt: { gte: new Date(Date.now() - 86400000) } } });
const fillTo = async (n: number) => {
  const left = n - (await today());
  if (left > 0) await db.aiDraft.createMany({ data: Array.from({ length: left }, () => ({ kind: 'SESSION_NOTE' as const, model: MODEL, effort: EFFORT, refId: 's20_fill', input: {}, output: {} })) });
};

beforeEach(async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  Object.assign(claude, { reply: NOTE, stop: 'end_turn', error: null, calls: 0 });
  await db.aiDraft.deleteMany();
});

describe('S20: every call counts toward AI_DAILY_LIMIT', () => {
  it('a refused, cut-off, garbled, empty or errored call each counts as one', async () => {
    as('u_admin');
    const draft = () => ai.draftSessionNote({ sessionId: 'ses_15', transcript: RECAP });
    const cases: [Partial<typeof claude>, RegExp][] = [
      [{ stop: 'refusal' }, /couldn’t do this one/],
      [{ stop: 'max_tokens' }, /too long/],
      [{ reply: 'not json {' }, /garbled/],
      [{ error: new Error('ECONNRESET') }, /isn’t available/],
    ];
    for (const [i, [stub, msg]] of cases.entries()) {
      Object.assign(claude, { reply: NOTE, stop: 'end_turn', error: null }, stub);
      fails(await draft(), 'AI_FAILED', msg);
      expect(claude.calls).toBe(i + 1);
      expect(await today()).toBe(i + 1);
    }
    // Failed calls leave nothing Vienne could use.
    expect(await db.aiDraft.count({ where: { status: 'FAILED' } })).toBe(cases.length);
    expect(await db.aiDraft.count({ where: { status: 'DRAFT' } })).toBe(0);
    // Reading a photo counts the same way.
    claude.stop = 'refusal';
    fails(await ai.readAnswerKeyPage({ bookId: 'book_g5', test: 'T4', fromNumber: 1, image }), 'AI_FAILED');
    expect(await today()).toBe(cases.length + 1);
  });

  it('no API key means no call, and nothing is counted', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    as('u_admin');
    fails(await ai.draftSessionNote({ sessionId: 'ses_15', transcript: RECAP }), 'AI_FAILED', /isn’t available/);
    expect([claude.calls, await today()]).toEqual([0, 0]);
  });

  it('failed calls fill the cap: at the limit the next call gets the message and Claude isn’t called', async () => {
    as('u_admin');
    await fillTo(AI_DAILY_LIMIT - 1);
    claude.reply = 'garbled';
    fails(await ai.draftSessionNote({ sessionId: 'ses_15', transcript: RECAP }), 'AI_FAILED', /garbled/); // the last call, used up by a failure
    expect(claude.calls).toBe(1);
    claude.reply = NOTE;
    fails(await ai.draftSessionNote({ sessionId: 'ses_15', transcript: RECAP }), 'LIMIT', /^That’s the most drafts for today\. Type it in for now, or try again tomorrow\.$/);
    fails(await ai.readAnswerKeyPage({ bookId: 'book_g5', test: 'T4', fromNumber: 1, image }), 'LIMIT', /most drafts for today/);
    expect(claude.calls).toBe(1);
    expect(await today()).toBe(AI_DAILY_LIMIT);
  });

  it('two taps at once for the last call: only one reaches Claude', async () => {
    as('u_admin');
    await fillTo(AI_DAILY_LIMIT - 1);
    const rs = await Promise.all([1, 2, 3].map(() => ai.draftSessionNote({ sessionId: 'ses_15', transcript: RECAP })));
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.filter((r) => !r.ok && r.code === 'LIMIT')).toHaveLength(2);
    expect([claude.calls, await today()]).toEqual([1, AI_DAILY_LIMIT]);
  });
});

describe('S20: saving and discarding drafts work as before', () => {
  it('a good draft is DRAFT with its output; using it saves and marks it ACCEPTED', async () => {
    as('u_admin');
    claude.reply = PAGE;
    const r = ok(await ai.readAnswerKeyPage({ bookId: 'book_g5', test: 'T4', fromNumber: 1, image }));
    const row = await db.aiDraft.findUniqueOrThrow({ where: { id: r.draftId } });
    expect(row).toMatchObject({ kind: 'BOOK_PAGE', status: 'DRAFT', model: MODEL, effort: EFFORT, refId: 'book_g5:T4', output: { test: 'T4', items: r.items } });
    expect(JSON.stringify(row.input)).not.toContain('AAAA'); // the photo is never stored
    expect(await today()).toBe(1);
    ok(await books.saveAnswerKey({ bookId: 'book_g5', test: 'T4', rows: [{ number: 1, format: 'MC', answer: 'B' }], source: 'PHOTO', aiDraftId: r.draftId }));
    expect((await db.aiDraft.findUniqueOrThrow({ where: { id: r.draftId } })).status).toBe('ACCEPTED');
    expect(await today()).toBe(1);
  });

  it('a session-note draft keeps its transcript and output', async () => {
    as('u_admin');
    const ses = await upcomingSession({ studentId: 's_mateo' });
    const d = ok(await ai.draftSessionNote({ sessionId: ses.id, transcript: RECAP }));
    expect(d.note).toBe('We worked on fractions.');
    expect(await db.aiDraft.findUniqueOrThrow({ where: { id: d.draftId } })).toMatchObject({ kind: 'SESSION_NOTE', status: 'DRAFT', refId: ses.id, input: { transcript: RECAP }, output: { note: 'We worked on fractions.' } });
  });

  it('discarding a draft doesn’t give the call back', async () => {
    as('u_admin');
    await fillTo(AI_DAILY_LIMIT - 1);
    const d = ok(await ai.draftSessionNote({ sessionId: 'ses_15', transcript: RECAP }));
    const gone = ok(await ai.discardDraft({ draftId: d.draftId }));
    expect(gone?.status).toBe('DISCARDED');
    expect(await today()).toBe(AI_DAILY_LIMIT);
    fails(await ai.draftSessionNote({ sessionId: 'ses_15', transcript: RECAP }), 'LIMIT', /most drafts for today/);
    expect(claude.calls).toBe(1);
  });

  it('a failed call’s row can’t be accepted, and discarding leaves it FAILED', async () => {
    as('u_admin');
    claude.stop = 'refusal';
    fails(await ai.readAnswerKeyPage({ bookId: 'book_g5', test: 'T4', fromNumber: 1, image }), 'AI_FAILED');
    const failed = await db.aiDraft.findFirstOrThrow({ where: { status: 'FAILED' } });
    ok(await books.saveAnswerKey({ bookId: 'book_g5', test: 'T4', rows: [{ number: 1, format: 'MC', answer: 'B' }], aiDraftId: failed.id }));
    expect((await ai.discardDraft({ draftId: failed.id })).ok).toBe(true);
    expect((await db.aiDraft.findUniqueOrThrow({ where: { id: failed.id } })).status).toBe('FAILED');
  });
});

describe('S20: permissions', () => {
  it('a parent or a signed-out caller can’t make a call, and nothing is counted', async () => {
    for (const who of ['u_ana', null]) {
      as(who);
      const note = await ai.draftSessionNote({ sessionId: 'ses_15', transcript: RECAP });
      const page = await ai.readAnswerKeyPage({ bookId: 'book_g5', test: 'T4', fromNumber: 1, image });
      for (const r of [note, page]) expect(r.ok).toBe(false);
      expect((await ai.discardDraft({ draftId: 'x' })).ok).toBe(false);
    }
    as('u_ana');
    fails(await ai.draftSessionNote({ sessionId: 'ses_15', transcript: RECAP }), 'FORBIDDEN');
    expect([claude.calls, await today()]).toEqual([0, 0]);
  });
});
