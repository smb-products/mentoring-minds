/** S7 holdouts: session ids can’t be probed, and a refusal changes nothing, for either parent, a locked account or nobody. */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from '../integration/helpers';
import * as scheduling from '@/server/scheduling';

freshDemo();

const LINK = 'https://meet.example.com/holdout-s7-room';
const NOTE = 'HOLDOUT-S7-ADMIN-NOTE';
const MADE_UP = ['ses_does_not_exist', "' OR 1=1 --", 'x'.repeat(60)];
const STATUSES = ['REQUESTED', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'] as const;

/** One video session per status, plus a confirmed one past the cancel cutoff and one inside the join window. */
async function sessionsFor(studentId: string, parentId: string) {
  const inMinutes = (m: number) => new Date(Date.now() + m * 60000);
  const plan = [...STATUSES.map((status, i) => ({ status, at: 60 * 24 * (20 + i) })), { status: 'CONFIRMED' as const, at: 90 }, { status: 'CONFIRMED' as const, at: 2 }];
  const made = [];
  for (const { status, at } of plan) {
    made.push(await db.session.create({ data: { studentId, subjectId: 'sub_math', mode: 'VIDEO', meetingUrl: LINK, requestedById: parentId, startsAt: inMinutes(at), endsAt: inMinutes(at + 45), durationMin: 45, status } }));
  }
  return made.map((s) => s.id);
}

const everything = async () => ({
  sessions: await db.session.findMany({ orderBy: { id: 'asc' } }),
  notes: await db.sessionNote.count(),
  notifications: await db.notification.count(),
});

/** Every server function a family could send a session id to. */
const byId: Record<string, (sessionId: string) => Promise<{ ok: boolean }>> = {
  cancelSession: (sessionId) => scheduling.cancelSession({ sessionId }),
  joinCall: (sessionId) => scheduling.joinCall({ sessionId }),
  confirmSession: (sessionId) => scheduling.confirmSession({ sessionId }),
  declineSession: (sessionId) => scheduling.declineSession({ sessionId }),
  rescheduleSession: (sessionId) => scheduling.rescheduleSession({ sessionId, startsAt: new Date(Date.now() + 40 * 86400000).toISOString() }),
  completeSession: (sessionId) => scheduling.completeSession({ sessionId, attendance: 'PRESENT', summary: 'x' }),
  markNoShow: (sessionId) => scheduling.markNoShow({ sessionId }),
  setMeetingUrl: (sessionId) => scheduling.setMeetingUrl({ sessionId, meetingUrl: 'https://meet.example.com/mine' }),
};

describe('S7 holdouts', () => {
  it('between Ana and Grace, the other’s sessions in any state and made-up ids get one identical FORBIDDEN from every function', async () => {
    const graces = await sessionsFor('s_noah', 'u_grace');
    const anas = await sessionsFor('s_mateo', 'u_ana');
    const before = await everything();
    for (const [who, theirs] of [['u_ana', graces], ['u_grace', anas]] as const) {
      as(who);
      for (const [name, call] of Object.entries(byId)) {
        const answers = new Set<string>();
        for (const sessionId of [...theirs, ...MADE_UP]) answers.add(JSON.stringify(await call(sessionId)));
        expect([...answers], `${who} ${name}`).toHaveLength(1);
        const answer = JSON.parse([...answers][0]);
        expect(answer, `${who} ${name}`).toMatchObject({ ok: false, code: 'FORBIDDEN' });
        expect([...answers][0]).not.toContain(LINK);
      }
    }
    expect(await everything()).toEqual(before);
  });

  it('signed out, preview and paused get one refusal from every function, even for empty, missing or wrong-typed input', async () => {
    const graces = await sessionsFor('s_noah', 'u_grace');
    await db.user.update({ where: { id: 'u_grace' }, data: { status: 'PAUSED' } });
    const before = await everything();
    for (const [who, code] of [[null, 'UNAUTHENTICATED'], ['u_tom', 'NOT_ACTIVE'], ['u_grace', 'NOT_ACTIVE']] as const) {
      as(who);
      for (const name of ['cancelSession', 'joinCall'] as const) {
        const answers = new Set<string>();
        for (const sessionId of [...graces, ...MADE_UP, '', 'x'.repeat(5000), undefined, 42, { not: null }]) {
          const r = await byId[name](sessionId as string);
          fails(r as never, code);
          answers.add(JSON.stringify(r));
        }
        for (const input of [undefined, null, {}]) fails(await scheduling[name](input as never), code);
        expect(answers.size, `${who} ${name}`).toBe(1);
      }
    }
    expect(await everything()).toEqual(before);
    await db.user.update({ where: { id: 'u_grace' }, data: { status: 'ACTIVE' } });
  });

  it('an active family’s own cancel answer carries no video link or admin note; a bad input changes nothing', async () => {
    const [requested] = await sessionsFor('s_noah', 'u_grace');
    await db.student.update({ where: { id: 's_noah' }, data: { adminNotes: NOTE } });
    as('u_grace');
    const before = await everything();
    fails(await scheduling.cancelSession({ sessionId: requested, reason: 'x'.repeat(5000) }), 'INVALID');
    fails(await scheduling.cancelSession({ sessionId: '' }), 'INVALID');
    expect(await everything()).toEqual(before);
    const text = JSON.stringify(ok(await scheduling.cancelSession({ sessionId: requested })));
    expect(text).not.toContain(LINK);
    expect(text).not.toContain(NOTE);
    fails(await scheduling.cancelSession({ sessionId: requested }), 'INVALID');
  });
});
