/**
 * W7: progress reports and the AI helpers, as the live screens use them.
 * Claude is stubbed (no real calls); sign-in goes through as(), never a mocked auth().
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { as, db, fails, freshDemo, ok, upcomingSession } from './helpers';
import { AI_DAILY_LIMIT, EFFORT, MODEL } from '@/lib/ai/prompts';

const claude = vi.hoisted(() => ({ reply: '', calls: [] as { model: string; output_config: { effort: string } }[] }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async (req: { model: string; output_config: { effort: string } }) => {
        claude.calls.push(req);
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: claude.reply }] };
      },
    };
  },
}));

import * as reports from '@/server/reports';
import * as ai from '@/server/ai';

freshDemo();

const AI_DOWN = 'The AI helper isn’t available right now. Type it in instead, or try again in a minute.';
const RECAP = 'Mateo did well on comparing fractions. Missed number 3 and 11 on mini test 1, so we will redo those.';

describe('progress reports', () => {
  it('a draft stays hidden from the family; publishing tells them and shows it', async () => {
    as('u_admin');
    const draft = ok(await reports.createDraft({ studentId: 's_mateo' }));
    ok(await reports.updateReport({ reportId: draft.id, summary: 'Mateo is drawing a model before every word problem now.' }));
    ok(await reports.setRatings({ reportId: draft.id, ratings: [{ skillId: 'sk_word_problems', rating: 3 }] }));

    as('u_ana');
    expect(ok(await reports.listForStudent({ studentId: 's_mateo' })).map((r) => r.id)).not.toContain(draft.id);
    fails(await reports.getReport({ reportId: draft.id }), 'NOT_FOUND');
    const before = await db.notification.count({ where: { userId: 'u_ana', type: 'REPORT_PUBLISHED' } });

    as('u_admin');
    ok(await reports.publishReport({ reportId: draft.id }));
    expect(await db.notification.count({ where: { userId: 'u_ana', type: 'REPORT_PUBLISHED' } })).toBe(before + 1);

    as('u_ana');
    expect(ok(await reports.listForStudent({ studentId: 's_mateo' })).map((r) => r.summary)).toContain('Mateo is drawing a model before every word problem now.');
    expect(ok(await reports.getReport({ reportId: draft.id })).summary).toMatch(/drawing a model/);
  });

  it('permissions: another family can’t read it, and only Vienne can write or publish', async () => {
    as('u_admin');
    const r = ok(await reports.createDraft({ studentId: 's_mateo' }));
    as('u_grace');
    fails(await reports.listForStudent({ studentId: 's_mateo' }), 'FORBIDDEN');
    fails(await reports.getReport({ reportId: r.id }), 'NOT_FOUND');
    as('u_ana');
    fails(await reports.createDraft({ studentId: 's_mateo' }), 'FORBIDDEN');
    fails(await reports.updateReport({ reportId: r.id, summary: 'mine now' }), 'FORBIDDEN');
    fails(await reports.publishReport({ reportId: r.id }), 'FORBIDDEN');
    as(null);
    expect((await reports.listForStudent({ studentId: 's_mateo' })).ok).toBe(false);
  });
});

describe('AI: Talk about it', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    claude.calls = [];
  });

  it('without an API key, Vienne gets the plain message and no call is made', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    as('u_admin');
    const ses = await upcomingSession({ studentId: 's_mateo' });
    fails(await ai.draftSessionNote({ sessionId: ses.id, transcript: RECAP }), 'AI_FAILED', new RegExp(`^${AI_DOWN}$`));
    expect(claude.calls).toHaveLength(0);
  });

  it('a draft saves no session note until Vienne uses it, and uses MODEL and EFFORT', async () => {
    as('u_admin');
    claude.reply = JSON.stringify({ note: RECAP, homework: null, skills: [], redo: [], unsure: [] });
    const ses = await upcomingSession({ studentId: 's_mateo' });
    const d = ok(await ai.draftSessionNote({ sessionId: ses.id, transcript: RECAP }));
    expect(d.note).toBe(RECAP);
    expect([claude.calls[0].model, claude.calls[0].output_config.effort]).toEqual([MODEL, EFFORT]);
    expect(await db.sessionNote.count({ where: { summary: { contains: 'comparing fractions' } } })).toBe(0);
    expect((await db.aiDraft.findUniqueOrThrow({ where: { id: d.draftId } })).status).toBe('DRAFT');
  });

  it('stops at AI_DAILY_LIMIT drafts a day, before calling Claude', async () => {
    as('u_admin');
    const used = await db.aiDraft.count({ where: { createdAt: { gte: new Date(Date.now() - 86400000) } } });
    await db.aiDraft.createMany({ data: Array.from({ length: AI_DAILY_LIMIT - used }, () => ({ kind: 'SESSION_NOTE' as const, model: MODEL, effort: EFFORT, refId: 'w7_cap', input: {}, output: {} })) });
    fails(await ai.draftSessionNote({ sessionId: 'ses_15', transcript: RECAP }), 'LIMIT', /most drafts for today/);
    expect(claude.calls).toHaveLength(0);
    await db.aiDraft.deleteMany({ where: { refId: 'w7_cap' } });
  });

  it('permissions: a parent can’t ask for a draft', async () => {
    as('u_ana');
    fails(await ai.draftSessionNote({ sessionId: 'ses_15', transcript: RECAP }), 'FORBIDDEN');
    expect(claude.calls).toHaveLength(0);
  });
});
