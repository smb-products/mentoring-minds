/**
 * The daily job (reminders, clean-up, the cron route) and the two AI features,
 * with Claude stubbed out so no real calls are made.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { as, db, fails, freshDemo, ok, upcomingSession } from './helpers';
import { cleanUp, sendSessionReminders } from '@/lib/jobs';
import { GET as cron } from '@/app/api/cron/daily/route';

const claude = vi.hoisted(() => ({ reply: '' as string, stop: 'end_turn' as string, error: null as Error | null, calls: [] as unknown[] }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async (req: unknown) => {
        claude.calls.push(req);
        if (claude.error) throw claude.error;
        return { stop_reason: claude.stop, content: [{ type: 'text', text: claude.reply }] };
      },
    };
  },
}));

import * as ai from '@/server/ai';

freshDemo();

describe('daily reminders', () => {
  it('reminds families about sessions today and tomorrow, once', async () => {
    const sent = await sendSessionReminders();
    expect(sent).toBeGreaterThan(0);
    const n = await db.notification.findFirstOrThrow({ where: { type: 'SESSION_REMINDER', createdAt: { gt: new Date(Date.now() - 60000) } } });
    expect(n.title).toMatch(/session (today|tomorrow)$/);
    expect(n.body).toMatch(/\d{1,2}:\d{2}\s?[AP]M/);
    expect(await sendSessionReminders()).toBe(0); // running twice sends nothing new
  });

  it('the cron route needs the secret', async () => {
    process.env.CRON_SECRET = 'cron-secret-for-tests';
    expect((await cron(new Request('http://localhost/api/cron/daily'))).status).toBe(401);
    expect((await cron(new Request('http://localhost/api/cron/daily', { headers: { authorization: 'Bearer wrong' } }))).status).toBe(401);
    const res = await cron(new Request('http://localhost/api/cron/daily', { headers: { authorization: 'Bearer cron-secret-for-tests' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ reminders: 0, purgedResources: 0 });
  });

  it('clean-up empties the 30-day bin and removes abandoned uploads', async () => {
    await db.resource.update({ where: { id: 'res_counting' }, data: { deletedAt: new Date(Date.now() - 31 * 86400000) } });
    const stale = await db.fileAsset.create({ data: { storageKey: 'files/stale', filename: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 10, uploadedById: 'u_ana', createdAt: new Date(Date.now() - 2 * 86400000) } });
    const r = await cleanUp();
    expect(r).toEqual({ purgedResources: 1, abandonedUploads: 1, redeemFailures: 0 });
    expect(await db.fileAsset.findUnique({ where: { id: stale.id } })).toBeNull();
  });
});

describe('AI: Talk about it', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    Object.assign(claude, { stop: 'end_turn', error: null, calls: [] });
  });

  it('drafts a note; skills and questions that don’t exist are dropped, nothing is saved', async () => {
    as('u_admin');
    const skill = await db.skill.findFirstOrThrow({ where: { gradeMin: { lte: 5 }, gradeMax: { gte: 5 } } });
    claude.reply = JSON.stringify({ note: 'We worked on fractions.', homework: 'Page 12', skills: [{ skillId: skill.id, rating: 3 }, { skillId: 'made_up', rating: 2 }], redo: [{ test: 'T1', number: 4 }, { test: 'T1', number: 999 }], unsure: [] });
    const ses = await upcomingSession({ studentId: 's_noah' });
    const d = ok(await ai.draftSessionNote({ sessionId: ses.id, transcript: 'Noah did great with fractions, redo number 4 on test one' }));
    expect(d.skills).toEqual([{ skillId: skill.id, rating: 3, name: skill.name }]);
    expect(d.redo.map((r) => r.number)).toEqual([4]);
    expect(d.unsure).toEqual(['1 question number wasn’t in the answer key']);
    const req = claude.calls[0] as { model: string; output_config: { effort: string } };
    expect([req.model, req.output_config.effort]).toEqual(['claude-haiku-5-5', 'high']);
    expect((await db.aiDraft.findUniqueOrThrow({ where: { id: d.draftId } })).status).toBe('DRAFT');
    expect(await db.sessionNote.findUnique({ where: { sessionId: ses.id } })).toBeNull();
    ok(await ai.discardDraft({ draftId: d.draftId }));
    expect((await db.aiDraft.findUniqueOrThrow({ where: { id: d.draftId } })).status).toBe('DISCARDED');
  });

  it('a refusal, a cut-off reply or no connection gives Vienne a plain message', async () => {
    as('u_admin');
    claude.stop = 'refusal';
    fails(await ai.draftSessionNote({ sessionId: 'ses_15', transcript: 'a long enough recap' }), 'AI_FAILED', /Type it in/);
    claude.stop = 'max_tokens';
    fails(await ai.draftSessionNote({ sessionId: 'ses_15', transcript: 'a long enough recap' }), 'AI_FAILED', /too long/);
    claude.error = new Error('ECONNRESET');
    fails(await ai.draftSessionNote({ sessionId: 'ses_15', transcript: 'a long enough recap' }), 'AI_FAILED', /isn’t available/);
    delete process.env.ANTHROPIC_API_KEY;
    fails(await ai.draftSessionNote({ sessionId: 'ses_15', transcript: 'a long enough recap' }), 'AI_FAILED');
  });

  it('stops at the daily limit', async () => {
    as('u_admin');
    await db.aiDraft.createMany({ data: Array.from({ length: 150 }, () => ({ kind: 'SESSION_NOTE' as const, model: 'm', effort: 'high', refId: 'x', input: {}, output: {} })) });
    fails(await ai.draftSessionNote({ sessionId: 'ses_15', transcript: 'a long enough recap' }), 'LIMIT', /most drafts for today/);
    await db.aiDraft.deleteMany({ where: { refId: 'x' } });
  });
});

describe('AI: Set up from photos', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    Object.assign(claude, { stop: 'end_turn', error: null, calls: [] });
  });

  it('reads a page; out-of-range numbers and other grades’ standards are dropped', async () => {
    as('u_admin');
    claude.reply = JSON.stringify({ test: 'T4', items: [{ number: 1, answer: 'B', format: 'MC', benchmarkCode: 'MA.5.FR.1.1', confident: true }, { number: 2, answer: null, format: 'MC', benchmarkCode: 'MA.3.FR.1.1', confident: false }, { number: 500, answer: 'A', format: 'MC', benchmarkCode: null, confident: true }] });
    const image = { mediaType: 'image/jpeg' as const, base64: 'A'.repeat(400) };
    const r = ok(await ai.readAnswerKeyPage({ bookId: 'book_g5', test: 'T4', fromNumber: 1, image }));
    expect(r.items.map((i) => [i.number, i.benchmarkCode])).toEqual([
      [1, 'MA.5.FR.1.1'],
      [2, null],
    ]);
    const draft = await db.aiDraft.findUniqueOrThrow({ where: { id: r.draftId } });
    expect(JSON.stringify(draft.input)).not.toContain('AAAA'); // the photo itself is never stored
    fails(await ai.readAnswerKeyPage({ bookId: 'book_g5', test: 'T4', image: { mediaType: 'image/gif' as never, base64: 'A'.repeat(400) } }), 'INVALID', /JPG, PNG or WebP/);
  });
});
