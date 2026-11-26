/** S20 holdouts: the cap as Vienne meets it, through real calls only (Claude stubbed at the SDK). */
import { describe, expect, it, vi } from 'vitest';
import { as, db, fails, freshDemo, ok } from '../integration/helpers';
import { AI_DAILY_LIMIT } from '@/lib/ai/prompts';

const claude = vi.hoisted(() => ({ calls: 0, mode: 'ok' as 'ok' | 'error' | 'refusal' | 'max_tokens' | 'garbled' | 'empty' | 'wrong-shape' }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async () => {
        claude.calls++;
        if (claude.mode === 'error') throw new Error('socket hang up');
        const text = claude.mode === 'garbled' ? '{"note":' : claude.mode === 'wrong-shape' ? '{}' : JSON.stringify({ note: 'Fractions.', homework: null, skills: [], redo: [], unsure: [] });
        return { stop_reason: claude.mode === 'refusal' || claude.mode === 'max_tokens' ? claude.mode : 'end_turn', content: claude.mode === 'empty' ? [] : [{ type: 'text', text }] };
      },
    };
  },
}));

import * as ai from '@/server/ai';

freshDemo();

const draft = (over: Partial<{ sessionId: string; transcript: string }> = {}) => ai.draftSessionNote({ sessionId: 'ses_15', transcript: 'We practiced fractions on a number line today.', ...over });

describe('S20 holdouts', () => {
  it('wrong input and other people use nothing up; every kind of bad answer does; then the limit holds', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    await db.aiDraft.deleteMany();

    as('u_admin');
    for (let i = 0; i < 10; i++) {
      expect((await draft({ transcript: 'short' })).ok).toBe(false);
      expect((await draft({ sessionId: 'ses_nothing' })).ok).toBe(false);
      expect((await ai.readAnswerKeyPage({ bookId: 'book_g5', test: 'T4', image: { mediaType: 'image/jpeg', base64: '' } })).ok).toBe(false);
    }
    for (const who of ['u_ana', 'u_grace', 'u_tom', null]) {
      as(who);
      expect((await draft()).ok, String(who)).toBe(false);
    }
    expect(claude.calls).toBe(0);

    as('u_admin');
    const modes = ['error', 'refusal', 'max_tokens', 'garbled', 'empty', 'wrong-shape', 'ok'] as const;
    let last = '';
    for (let i = 0; i < AI_DAILY_LIMIT; i++) {
      claude.mode = modes[i % modes.length];
      const r = await draft();
      if (!r.ok) expect(r.code, `call ${i + 1}`).not.toBe('LIMIT');
      else {
        expect(claude.mode, `call ${i + 1}`).toBe('ok');
        last = r.data.draftId;
      }
    }
    expect(claude.calls).toBe(AI_DAILY_LIMIT);

    claude.mode = 'ok';
    fails(await draft(), 'LIMIT', /most drafts for today/);
    ok(await ai.discardDraft({ draftId: last }));
    ok(await ai.discardDraft({ draftId: last }));
    fails(await draft(), 'LIMIT', /most drafts for today/);
    expect(claude.calls).toBe(AI_DAILY_LIMIT);
  });
});
