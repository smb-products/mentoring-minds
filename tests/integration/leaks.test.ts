/**
 * Nothing secret reaches a family's device. Every read a parent can make is
 * searched (deeply) for answer keys, password and invite hashes, Vienne's private
 * notes, her video room link, and video links outside the join window.
 */
import { describe, expect, it } from 'vitest';
import { as, db, freshDemo, ok, valuesOf } from './helpers';
import * as assignments from '@/server/assignments';
import * as books from '@/server/books';
import * as content from '@/server/content';
import * as dashboard from '@/server/dashboard';
import * as families from '@/server/families';
import * as fast from '@/server/fast';
import * as messages from '@/server/messages';
import * as notifications from '@/server/notifications';
import * as reports from '@/server/reports';
import * as scheduling from '@/server/scheduling';
import * as invites from '@/server/invites';

freshDemo();

async function everythingParentCanRead(parentId: string, studentIds: string[]) {
  as(parentId);
  const out: Record<string, unknown> = {
    family: ok(await families.getFamily({ parentId })),
    sessions: ok(await scheduling.listSessions({})),
    settings: ok(await scheduling.getSettings()),
    books: ok(await books.listBooks()),
    thread: ok(await messages.getThread({})),
    notifications: ok(await notifications.listForUser()),
  };
  for (const studentId of studentIds) {
    out[`overview:${studentId}`] = ok(await dashboard.getParentOverview({ studentId }));
    out[`work:${studentId}`] = ok(await assignments.listForStudent({ studentId }));
    out[`redo:${studentId}`] = ok(await books.listRedo({ studentId }));
    out[`fast:${studentId}`] = ok(await fast.listResults({ studentId }));
    out[`reports:${studentId}`] = ok(await reports.listForStudent({ studentId }));
    out[`library:${studentId}`] = ok(await content.listResourcesForStudent({ studentId }));
  }
  return out;
}

describe('what a family can read', () => {
  it('never includes the answer key, hashes or Vienne’s private notes', async () => {
    const all = await everythingParentCanRead('u_ana', ['s_mateo', 's_lucia']);
    expect(valuesOf(all, 'answer')).toEqual([]);
    expect(valuesOf(all, 'passwordHash')).toEqual([]);
    expect(valuesOf(all, 'codeHash')).toEqual([]);
    expect(valuesOf(all, 'adminNotes')).toEqual([]);
    expect(valuesOf(all, 'failedLogins')).toEqual([]);
    expect(valuesOf(all, 'defaultMeetingUrl').filter(Boolean)).toEqual([]);
    // Book questions still go out, just without answers.
    const work = all['work:s_mateo'] as { assignment: { slots: unknown[] } }[];
    expect(work.some((w) => w.assignment.slots.length > 0)).toBe(true);
  });

  it('doesn’t include private session notes', async () => {
    await db.sessionNote.updateMany({ where: { session: { student: { parentId: 'u_ana' } } }, data: { sharedWithParent: false } });
    const all = await everythingParentCanRead('u_ana', ['s_mateo', 's_lucia']);
    const notes = valuesOf(all, 'note').filter(Boolean);
    expect(notes).toEqual([]);
    // …while Vienne still sees them.
    as('u_admin');
    const fam = ok(await families.getFamily({ parentId: 'u_ana' }));
    expect(fam.sessions.some((x) => x.note)).toBe(true);
    await db.sessionNote.updateMany({ where: { session: { student: { parentId: 'u_ana' } } }, data: { sharedWithParent: true } });
  });

  it('only shows a video link inside the join window of a confirmed call', async () => {
    as('u_grace');
    const rows = ok(await scheduling.listSessions({ studentId: 's_noah' }));
    const settings = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
    const now = Date.now();
    for (const s of rows.filter((x) => x.mode === 'VIDEO')) {
      const open = s.status === 'CONFIRMED' && now >= new Date(s.startsAt).getTime() - settings.joinOpensMin * 60000 && now <= new Date(s.endsAt).getTime();
      if (open) expect(s.meetingUrl, s.id).toBeTruthy();
      else expect(s.meetingUrl, s.id).toBeNull();
    }
    // The demo has one call starting in a few minutes, and later ones that must stay hidden.
    expect(rows.find((s) => s.id === 'ses_live')?.meetingUrl).toBeTruthy();
    const later = rows.find((s) => s.mode === 'VIDEO' && s.status === 'CONFIRMED' && new Date(s.startsAt).getTime() > Date.now() + 2 * 3600000);
    expect(later, 'a later confirmed video call in the demo').toBeTruthy();
    expect(later!.meetingUrl).toBeNull();
  });

  it('Vienne does get the answer key and her notes', async () => {
    as('u_admin');
    const key = ok(await books.getAnswerKey({ bookId: 'book_g5', test: 'T1' }));
    expect(key.items.every((i) => 'answer' in i)).toBe(true);
    const fam = ok(await families.getFamily({ parentId: 'u_ana' }));
    expect(fam.students.every((s) => 'adminNotes' in s)).toBe(true);
  });

  it('Vienne’s invite list never includes code hashes', async () => {
    as('u_admin');
    const list = ok(await invites.listInvites());
    expect(list.length).toBe(5);
    expect(valuesOf(list, 'codeHash')).toEqual([]);
  });

  it('results come back as plain JSON: dates are ISO strings', async () => {
    as('u_ana');
    const o = ok(await dashboard.getParentOverview({ studentId: 's_mateo' }));
    const dates = valuesOf(o, 'startsAt').concat(valuesOf(o, 'createdAt'));
    expect(dates.length).toBeGreaterThan(0);
    for (const d of dates) expect(typeof d === 'string' && !Number.isNaN(Date.parse(d)), String(d)).toBe(true);
  });
});
