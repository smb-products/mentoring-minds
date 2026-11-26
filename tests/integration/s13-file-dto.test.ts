/**
 * S13: content.getFileForUser checks the account before it looks the file up, and
 * returns a file DTO (src/lib/dto.ts fileDTO), never the FileAsset row.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';
import * as content from '@/server/content';
import * as families from '@/server/families';

freshDemo();

const MISSING = 'fa_does_not_exist';
const DTO_KEYS = ['filename', 'id', 'mimeType', 'sizeBytes', 'url'];

afterEach(async () => {
  as('u_admin');
  ok(await families.setParentStatus({ parentId: 'u_daniel', status: 'ACTIVE' }));
});

describe('content.getFileForUser returns a file DTO', () => {
  it('for Vienne: only id, filename, mimeType, sizeBytes and url', async () => {
    as('u_admin');
    const file = ok(await content.getFileForUser({ fileId: 'fa_arjun_work' }));
    const row = await db.fileAsset.findUniqueOrThrow({ where: { id: 'fa_arjun_work' } });
    expect(Object.keys(file).sort()).toEqual(DTO_KEYS);
    expect(file).toEqual({ id: row.id, filename: row.filename, mimeType: row.mimeType, sizeBytes: row.sizeBytes, url: `/api/files/${row.id}` });
  });

  it('for a family: their child’s work and a shared resource, the same five keys', async () => {
    as('u_ana');
    for (const fileId of ['fa_lucia_work', 'fa_fraction_strips']) {
      const file = ok(await content.getFileForUser({ fileId }));
      expect(Object.keys(file).sort(), fileId).toEqual(DTO_KEYS);
      expect(file).not.toHaveProperty('storageKey');
      expect(file).not.toHaveProperty('uploadedById');
    }
  });
});

describe('content.getFileForUser checks the account first', () => {
  it('signed out: UNAUTHENTICATED for a real id and a made-up one', async () => {
    as(null);
    const real = await content.getFileForUser({ fileId: 'fa_fraction_strips' });
    const missing = await content.getFileForUser({ fileId: MISSING });
    fails(real, 'UNAUTHENTICATED');
    expect(real).toEqual(missing);
  });

  it('a preview parent: NOT_ACTIVE for a real id and a made-up one alike', async () => {
    as('u_tom');
    const real = await content.getFileForUser({ fileId: 'fa_fraction_strips' });
    const missing = await content.getFileForUser({ fileId: MISSING });
    fails(real, 'NOT_ACTIVE');
    expect(real).toEqual(missing);
  });

  it('a paused parent: NOT_ACTIVE for their own child’s file and a made-up one alike', async () => {
    as('u_admin');
    ok(await families.setParentStatus({ parentId: 'u_daniel', status: 'PAUSED' }));
    const own = await db.submission.findFirst({ where: { student: { parentId: 'u_daniel' }, fileId: { not: null } } });
    as('u_daniel');
    const real = await content.getFileForUser({ fileId: own?.fileId ?? 'fa_fraction_strips' });
    const missing = await content.getFileForUser({ fileId: MISSING });
    fails(real, 'NOT_ACTIVE');
    expect(real).toEqual(missing);
  });

  it('an active family: FORBIDDEN for a file that isn’t theirs, NOT_FOUND for a missing one', async () => {
    as('u_ana');
    fails(await content.getFileForUser({ fileId: 'fa_arjun_work' }), 'FORBIDDEN');
    fails(await content.getFileForUser({ fileId: MISSING }), 'NOT_FOUND');
  });

  it('Vienne: NOT_FOUND for a missing id', async () => {
    as('u_admin');
    fails(await content.getFileForUser({ fileId: MISSING }), 'NOT_FOUND');
  });
});
