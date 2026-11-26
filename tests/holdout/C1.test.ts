/** C1 holdouts: the comments point at a frozen copy that exists, and the reads in the edited files still keep families apart. */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok, valuesOf } from '../integration/helpers';
import { getParentOverview } from '@/server/dashboard';
import { listForStudent } from '@/server/assignments';
import { bookForGrade, listRedo } from '@/server/books';

freshDemo();

const ROOT = process.cwd();
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });

const NOTE = 'HOLDOUT-C1-ADMIN-NOTE';
const LINK = 'https://meet.example.com/holdout-c1-room';

const reads: Record<string, (studentId: string) => Promise<{ ok: boolean }>> = {
  getParentOverview: (studentId) => getParentOverview({ studentId }),
  listForStudent: (studentId) => listForStudent({ studentId }),
  listRedo: (studentId) => listRedo({ studentId }),
};

describe('C1 holdouts', () => {
  it('every tests/contract/mock/ path a comment in src names exists, and each server area names its own file', () => {
    const missing: string[] = [];
    let named = 0;
    for (const file of files(path.join(ROOT, 'src'))) {
      const text = readFileSync(file, 'utf8');
      const rel = path.relative(ROOT, file);
      for (const [mention] of text.matchAll(/tests\/contract\/mock\/[A-Za-z0-9_./-]*/g)) {
        named++;
        const target = mention.replace(/\.+$/, '');
        if (!existsSync(path.join(ROOT, target))) missing.push(`${rel} → ${target}`);
      }
      const contract = rel.startsWith('src/server/') && text.match(/Contract: (\S+?\.js)\b/);
      if (contract) expect(contract[1], rel).toBe(`tests/contract/mock/server/${path.basename(file, '.ts')}.js`);
    }
    expect(named).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('Ana and Grace can’t read each other’s child; signed out and preview read neither', async () => {
    await db.student.updateMany({ where: { id: { in: ['s_mateo', 's_noah'] } }, data: { adminNotes: NOTE } });
    for (const [who, studentId, code] of [
      ['u_ana', 's_noah', 'FORBIDDEN'],
      ['u_grace', 's_mateo', 'FORBIDDEN'],
      [null, 's_mateo', 'UNAUTHENTICATED'],
      [null, 's_noah', 'UNAUTHENTICATED'],
      ['u_tom', 's_mateo', 'NOT_ACTIVE'],
      ['u_tom', 's_noah', 'NOT_ACTIVE'],
    ] as const) {
      as(who);
      for (const read of Object.values(reads)) {
        const r = await read(studentId);
        fails(r as never, code);
        expect(JSON.stringify(r)).not.toContain(NOTE);
      }
    }
    as(null);
    fails(await bookForGrade({ grade: 4 }), 'UNAUTHENTICATED');
  });

  it('a parent’s own reads carry no answer key, admin note or early video link; wrong input is refused', async () => {
    // The demo's live call is inside its join window, where the link belongs: take it out so any link seen below is a leak.
    await db.session.update({ where: { id: 'ses_live' }, data: { status: 'CANCELLED' } });
    for (const [who, studentId, parentId] of [['u_ana', 's_mateo', 'u_ana'], ['u_grace', 's_noah', 'u_grace']] as const) {
      await db.student.update({ where: { id: studentId }, data: { adminNotes: NOTE } });
      const startsAt = new Date(Date.now() + 3 * 86400000);
      await db.session.create({ data: { studentId, subjectId: 'sub_math', mode: 'VIDEO', meetingUrl: LINK, requestedById: parentId, status: 'CONFIRMED', startsAt, endsAt: new Date(startsAt.getTime() + 45 * 60000), durationMin: 45 } });
      as(who);
      for (const [name, read] of Object.entries(reads)) {
        const data = ok((await read(studentId)) as never);
        const text = JSON.stringify(data);
        expect(text, `${who} ${name}`).not.toContain(NOTE);
        expect(text, `${who} ${name}`).not.toContain(LINK);
        for (const key of ['answer', 'adminNotes', 'meetingUrl', 'passwordHash']) expect(valuesOf(data, key).filter(Boolean), `${who} ${name} ${key}`).toEqual([]);
        for (const bad of ['', 42, undefined, { not: null }]) fails((await read(bad as never)) as never, 'INVALID');
      }
      const book = ok(await bookForGrade({ grade: 4 }));
      expect(valuesOf(book, 'answer')).toEqual([]);
    }
    fails(await bookForGrade({ grade: 99 }), 'INVALID');
  });

  it('a child with nothing yet gets empty lists and zero counts, not another child’s work', async () => {
    const child = await db.student.create({ data: { parentId: 'u_ana', firstName: 'Demo', lastName: 'Empty', grade: 4 } });
    as('u_ana');
    expect(ok(await listForStudent({ studentId: child.id }))).toEqual([]);
    expect(ok(await listRedo({ studentId: child.id }))).toEqual([]);
    expect(ok(await getParentOverview({ studentId: child.id }))).toMatchObject({ nextSession: null, pendingRequests: [], todo: [], starsTotal: 0, completedCount: 0, lastSessionNote: null, latestReport: null, redoCount: 0, latestResult: null });
    as('u_grace');
    fails(await listForStudent({ studentId: child.id }), 'FORBIDDEN');
  });
});
