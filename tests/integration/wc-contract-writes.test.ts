/**
 * WC: gaps the contract check found in the writes the screens use.
 * ai.discardDraft now returns the draft as it stands, like the mock (the contract test
 * compares the shapes). Claude is stubbed; sign-in goes through as(), never a mocked auth().
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ note: 'We worked on fractions.', homework: null, skills: [], redo: [], unsure: [] }) }] }),
    };
  },
}));

import * as ai from '@/server/ai';

freshDemo();

async function draft() {
  as('u_admin');
  return ok(await ai.draftSessionNote({ sessionId: 'ses_15', transcript: 'Noah did great with fractions today.' }));
}

describe('ai.discardDraft', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('returns the discarded draft; a second discard changes nothing', async () => {
    const d = await draft();
    const first = ok(await ai.discardDraft({ draftId: d.draftId }));
    expect(first).toMatchObject({ id: d.draftId, kind: 'SESSION_NOTE', refId: 'ses_15', status: 'DISCARDED' });
    expect(first?.decidedAt).toBeTruthy();
    expect(first?.output).toMatchObject({ note: 'We worked on fractions.' });
    const again = ok(await ai.discardDraft({ draftId: d.draftId }));
    expect(again?.status).toBe('DISCARDED');
    expect(again?.decidedAt).toEqual(first?.decidedAt);
  });

  it('a draft that was already saved stays saved', async () => {
    const d = await draft();
    await db.aiDraft.update({ where: { id: d.draftId }, data: { status: 'ACCEPTED', decidedAt: new Date() } });
    expect(ok(await ai.discardDraft({ draftId: d.draftId }))?.status).toBe('ACCEPTED');
  });

  it('an unknown draft is a quiet no-op', async () => {
    as('u_admin');
    expect(ok(await ai.discardDraft({ draftId: 'ai_missing' }))).toBeNull();
  });

  it('only Vienne can discard, and a refusal touches nothing', async () => {
    const d = await draft();
    as('u_ana');
    fails(await ai.discardDraft({ draftId: d.draftId }), 'FORBIDDEN');
    as(null);
    const out = await ai.discardDraft({ draftId: d.draftId });
    expect(out.ok).toBe(false);
    expect((await db.aiDraft.findUniqueOrThrow({ where: { id: d.draftId } })).status).toBe('DRAFT');
  });
});
