/** W4 holdouts: no answer key for families; library files only for the children they're shared with. */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok, valuesOf } from '../integration/helpers';
import * as books from '@/server/books';
import * as content from '@/server/content';
import { GET } from '@/app/api/files/[id]/route';

freshDemo();

const open = async (id: string) => (await GET(new Request(`http://localhost/api/files/${id}`), { params: Promise.resolve({ id }) })).status;

describe('W4: leaks and the wrong person', () => {
  it('no family answer carries the answer key or Vienne’s notes, and only Vienne reads or edits the key', async () => {
    const item = await db.bookItem.findFirstOrThrow({ where: { bookId: 'book_g4', test: 'T1', format: 'MC' } });
    for (const [parent, studentId, grade] of [['u_ana', 's_mateo', 3], ['u_daniel', 's_sofia', 4]] as const) {
      as(parent);
      const seen = [ok(await books.listBooks()), ok(await books.bookForGrade({ grade })), ok(await books.listRedo({ studentId })), ok(await content.listResourcesForStudent({ studentId }))];
      for (const key of ['answer', 'answers', 'adminNotes', 'passwordHash']) expect(valuesOf(seen, key), key).toEqual([]);
    }
    for (const [who, code] of [['u_ana', 'FORBIDDEN'], ['u_tom', 'FORBIDDEN'], [null, 'UNAUTHENTICATED']] as const) {
      as(who);
      fails(await books.getAnswerKey({ bookId: 'book_g4', test: 'T1' }), code);
      fails(await books.saveAnswerKey({ bookId: 'book_g4', test: 'T1', rows: [{ number: item.number, format: 'MC', answer: 'A' }] }), code);
      fails(await content.listResources(), code);
      fails(await content.deleteResource({ resourceId: 'res_area' }), code);
    }
    expect(await db.bookItem.findUniqueOrThrow({ where: { id: item.id } })).toEqual(item);
    as('u_grace');
    fails(await books.setHasBook({ studentId: 's_jordan' }), 'FORBIDDEN');
    fails(await books.listRedo({ studentId: 's_sofia' }), 'FORBIDDEN');
    fails(await content.listResourcesForStudent({ studentId: 's_mateo' }), 'FORBIDDEN');
    expect((await db.student.findUniqueOrThrow({ where: { id: 's_jordan' } })).hasBookAt).toBeNull();
  });

  it('a PREVIEW parent only gets teasers, never a file, link or note text', async () => {
    as('u_tom');
    const teasers = ok(await content.listResourcesForStudent({}));
    expect(teasers.length).toBeGreaterThan(0);
    for (const key of ['file', 'fileId', 'url', 'body', 'shares', 'storageKey']) expect(valuesOf(teasers, key).filter(Boolean), key).toEqual([]);
    expect(await open('fa_fraction_strips')).toBe(403);
    as(null);
    fails(await content.listResourcesForStudent({}), 'UNAUTHENTICATED');
    expect(await open('fa_fraction_strips')).toBe(401);
  });

  it('a file stops opening for a family it isn’t shared with, or once it’s a draft or deleted', async () => {
    as('u_admin');
    ok(await content.setSharing({ resourceId: 'res_area', visibility: 'SELECTED', studentIds: ['s_mateo'] }));
    as('u_grace');
    expect(ok(await content.listResourcesForStudent({ studentId: 's_noah' })).map((r) => r.id)).not.toContain('res_area');
    expect(await open('fa_area')).toBe(403);
    fails(await content.getFileForUser({ fileId: 'fa_area' }), 'FORBIDDEN');
    as('u_ana');
    expect(await open('fa_area')).toBe(200);
    as('u_admin');
    ok(await content.setPublishStatus({ resourceId: 'res_area', status: 'DRAFT' }));
    as('u_ana');
    expect(await open('fa_area')).toBe(403);
    as('u_admin');
    ok(await content.setPublishStatus({ resourceId: 'res_area', status: 'PUBLISHED' }));
    ok(await content.deleteResource({ resourceId: 'res_area' }));
    as('u_ana');
    expect(await open('fa_area')).toBe(403);
    expect(ok(await content.listResourcesForStudent({ studentId: 's_mateo' })).map((r) => r.id)).not.toContain('res_area');
    expect(await open('no_such_file')).toBe(404);
  });
});
