/**
 * S33: with the AI features removed, completeSession and saveAnswerKey only ever save TYPED,
 * whatever an old client sends (source, aiDraftId are ignored). Sign-in goes through as().
 */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';
import * as books from '@/server/books';
import * as scheduling from '@/server/scheduling';

freshDemo();

async function confirmedSession() {
  const s = await db.session.findFirstOrThrow({ where: { status: 'CONFIRMED' }, orderBy: { startsAt: 'asc' } });
  return s;
}

describe('completeSession', () => {
  it('a typed note completes the session; an old client’s VOICE source and draft id are ignored', async () => {
    const s = await confirmedSession();
    as('u_admin');
    const done = ok(await scheduling.completeSession({ sessionId: s.id, attendance: 'PRESENT', summary: 'Typed: rounding to the nearest ten.', source: 'VOICE', aiDraftId: 'ai_old' } as never));
    expect(done.status).toBe('COMPLETED');
    expect(done.note).toMatchObject({ summary: 'Typed: rounding to the nearest ten.', source: 'TYPED' });
    expect((await db.sessionNote.findUniqueOrThrow({ where: { sessionId: s.id } })).source).toBe('TYPED');
  });

  it('permissions: a parent and a signed-out caller can’t complete a session', async () => {
    const s = await confirmedSession();
    const parent = await db.student.findUniqueOrThrow({ where: { id: s.studentId } });
    as(parent.parentId);
    fails(await scheduling.completeSession({ sessionId: s.id, attendance: 'PRESENT', summary: 'mine' }), 'FORBIDDEN');
    as(null);
    expect((await scheduling.completeSession({ sessionId: s.id, attendance: 'PRESENT', summary: 'mine' })).ok).toBe(false);
    expect(await db.sessionNote.findUnique({ where: { sessionId: s.id } })).toBeNull();
  });
});

describe('saveAnswerKey', () => {
  it('typed rows save as TYPED; an old client’s PHOTO source and draft id are ignored', async () => {
    const item = await db.bookItem.findFirstOrThrow({ where: { format: 'MC' }, orderBy: { id: 'asc' } });
    const next = item.answer === 'A' ? 'B' : 'A';
    as('u_admin');
    ok(await books.saveAnswerKey({ bookId: item.bookId, test: item.test, rows: [{ number: item.number, format: 'MC', answer: next }], source: 'PHOTO', aiDraftId: 'ai_old' } as never));
    const after = await db.bookItem.findUniqueOrThrow({ where: { id: item.id } });
    expect([after.answer, after.source]).toEqual([next, 'TYPED']);
  });

  it('permissions: a parent and a signed-out caller can’t save a key', async () => {
    const item = await db.bookItem.findFirstOrThrow({ where: { format: 'MC' }, orderBy: { id: 'desc' } });
    const input = { bookId: item.bookId, test: item.test, rows: [{ number: item.number, format: 'MC' as const, answer: item.answer === 'C' ? 'D' : 'C' }] };
    as('u_ana');
    fails(await books.saveAnswerKey(input), 'FORBIDDEN');
    as(null);
    expect((await books.saveAnswerKey(input)).ok).toBe(false);
    expect((await db.bookItem.findUniqueOrThrow({ where: { id: item.id } })).answer).toBe(item.answer);
  });
});
