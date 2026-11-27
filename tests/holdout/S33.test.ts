/**
 * S33 holdouts: with the AI features gone, a stale client's old fields change nothing.
 * Who can read a typed note stays the same, and bad input saves nothing.
 */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok, upcomingSession, valuesOf } from './../integration/helpers';
import * as books from '@/server/books';
import * as dashboard from '@/server/dashboard';
import * as scheduling from '@/server/scheduling';

freshDemo();

/** Everything a signed-in family screen could read about Noah's sessions. */
async function readsAboutNoah() {
  return [
    await scheduling.listSessions({}),
    await scheduling.listSessions({ studentId: 's_noah' }),
    await dashboard.getParentOverview({ studentId: 's_noah' }),
  ];
}

describe('S33 holdout: typed session notes', () => {
  it('a stale voice-draft request with sharing off stays private from every family, and a shared one reaches only Noah’s parent', async () => {
    const hidden = await upcomingSession({ studentId: 's_noah' });
    const shared = await upcomingSession({ studentId: 's_noah', not: [hidden.id] });
    const SECRET = 'HOLDOUT-PRIVATE Noah froze on the timed page.';
    const SECRET_HW = 'HOLDOUT-PRIVATE-HW call the school';
    const OPEN = 'HOLDOUT-SHARED Noah compared fractions with strips.';
    const old = { source: 'VOICE', aiDraftId: 'ai_old' };

    as('u_admin');
    ok(await scheduling.completeSession({ sessionId: hidden.id, attendance: 'PRESENT', summary: SECRET, homework: SECRET_HW, sharedWithParent: false, ...old } as never));
    ok(await scheduling.completeSession({ sessionId: shared.id, attendance: 'PRESENT', summary: OPEN, ...old } as never));

    // Noah's parent, the other parent, a PREVIEW parent, signed out.
    for (const who of ['u_grace', 'u_ana', 'u_tom', null]) {
      as(who);
      const seen = JSON.stringify(await readsAboutNoah());
      expect(seen, `${who}: private note`).not.toContain('HOLDOUT-PRIVATE');
      if (who === 'u_grace') expect(seen).toContain(OPEN);
      else expect(seen, `${who}: another family’s note`).not.toContain(OPEN);
    }

    as('u_grace');
    const mine = ok(await scheduling.listSessions({ studentId: 's_noah' }));
    expect(valuesOf(mine, 'adminNotes')).toEqual([]);
    expect(valuesOf(mine, 'aiDraftId')).toEqual([]);
    expect(new Set(valuesOf(mine, 'source')).has('VOICE')).toBe(false);
  });

  it('empty or draft-only requests save nothing; a refused key row saves nothing; families never get the key', async () => {
    const s = await upcomingSession({ studentId: 's_mateo' }).catch(() => upcomingSession());
    as('u_admin');
    for (const bad of [{ summary: '' }, { summary: '   \n ' }, { aiDraftId: 'ai_old', source: 'VOICE' }]) {
      fails(await scheduling.completeSession({ sessionId: s.id, attendance: 'PRESENT', ...bad } as never), 'INVALID');
    }
    expect((await db.session.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('CONFIRMED');
    expect(await db.sessionNote.findUnique({ where: { sessionId: s.id } })).toBeNull();

    const item = await db.bookItem.findFirstOrThrow({ where: { bookId: 'book_g5', format: 'MC' }, orderBy: { id: 'asc' } });
    const key = { bookId: item.bookId, test: item.test };
    const draftOnly = { ...key, rows: [], source: 'PHOTO', aiDraftId: 'ai_old' };
    fails(await books.saveAnswerKey(draftOnly as never), 'INVALID');
    fails(await books.saveAnswerKey({ ...key, rows: [{ number: item.number, format: 'MC', answer: 'Z' }] }), 'INVALID');
    expect((await db.bookItem.findUniqueOrThrow({ where: { id: item.id } })).answer).toBe(item.answer);

    for (const who of ['u_grace', 'u_ana', 'u_tom', null]) {
      as(who);
      const res = await books.getAnswerKey(key);
      expect(res.ok, `${who}`).toBe(false);
      expect(valuesOf(res, 'answer'), `${who}`).toEqual([]);
      expect(valuesOf(await books.listBooks(), 'answer'), `${who}`).toEqual([]);
    }
  });
});
