/**
 * S15: a family's reads that return a resource (content.listResourcesForStudent,
 * assignments.listForStudent) send a family DTO: no sharedWith, no shares, and the
 * file only as a file DTO. Vienne's reads keep sharedWith.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok, valuesOf } from './helpers';
import * as assignments from '@/server/assignments';
import * as content from '@/server/content';

freshDemo();

/** The file DTO (S13) plus when its upload was checked: nothing else from the FileAsset row. */
const FILE_KEYS = ['filename', 'id', 'mimeType', 'sizeBytes', 'uploadedAt', 'url'];
let resourceId = '';

beforeAll(async () => {
  as('u_admin');
  // Shared with Ana's Mateo (grade 3) and Grace's Noah (grade 5).
  const r = ok(
    await content.createResource({ title: 'Fraction strips, cut and compare', kind: 'WORKSHEET', fileId: 'fa_fraction_strips', gradeMin: 3, gradeMax: 5, visibility: 'SELECTED', status: 'PUBLISHED', studentIds: ['s_mateo', 's_noah'] }),
  );
  resourceId = r.id;
  ok(await assignments.createPracticeAssignment({ title: 'Cut out the strips', resourceId, studentIds: ['s_mateo', 's_noah'] }));
});

type Res = { id: string; title: string; kind: string; description: string | null; url: string | null; body: unknown; file: Record<string, unknown> | null };

async function anasReads() {
  as('u_ana');
  const library = ok(await content.listResourcesForStudent({ studentId: 's_mateo' })) as unknown as Res[];
  const work = ok(await assignments.listForStudent({ studentId: 's_mateo' }));
  const fromWork = work.map((w) => w.assignment.resource as unknown as Res | null).filter((x): x is Res => !!x);
  return { library, work, fromWork };
}

describe('a family’s resources are a family DTO', () => {
  it('the library: no sharedWith or shares, the file as a file DTO', async () => {
    const { library } = await anasReads();
    const r = library.find((x) => x.id === resourceId)!;
    expect(r, 'the shared resource is in Mateo’s library').toBeTruthy();
    for (const x of library) {
      expect(x).not.toHaveProperty('sharedWith');
      expect(x).not.toHaveProperty('shares');
      if (x.file) expect(Object.keys(x.file).sort(), x.id).toEqual(FILE_KEYS);
    }
    expect(r.file).toMatchObject({ id: 'fa_fraction_strips', filename: 'fraction-strips-worksheet.pdf', mimeType: 'application/pdf', url: '/api/files/fa_fraction_strips' });
  });

  it('the work list: the assignment’s resource is the same family DTO, not the raw row', async () => {
    const { fromWork, library } = await anasReads();
    const r = fromWork.find((x) => x.id === resourceId)!;
    expect(r, 'the practice assignment carries its resource').toBeTruthy();
    expect(r).not.toHaveProperty('sharedWith');
    expect(r).not.toHaveProperty('shares');
    expect(r).not.toHaveProperty('deletedAt');
    expect(Object.keys(r.file!).sort()).toEqual(FILE_KEYS);
    expect(r).toEqual(library.find((x) => x.id === resourceId));
  });

  it('nothing names the other family’s child or any parent but Ana', async () => {
    const all = await anasReads();
    const text = JSON.stringify(all);
    expect(text).not.toContain('s_noah');
    expect(text).not.toContain('Noah');
    expect(text).not.toContain('u_grace');
    expect(valuesOf(all, 'parentId').filter((p) => p !== 'u_ana')).toEqual([]);
    expect(valuesOf(all, 'storageKey')).toEqual([]);
    expect(valuesOf(all, 'uploadedById')).toEqual([]);
  });

  it('every field the parent screens read still arrives', async () => {
    const { library, fromWork } = await anasReads();
    for (const r of [...library, ...fromWork]) for (const k of ['id', 'title', 'kind', 'description', 'url', 'body', 'file']) expect(r, `${r.id}.${k}`).toHaveProperty(k);
    const r = library.find((x) => x.id === resourceId)!;
    expect(r.file).toMatchObject({ id: expect.any(String), filename: expect.any(String), sizeBytes: expect.any(Number) });
  });
});

describe('Vienne’s reads keep sharedWith', () => {
  it('listResources and listResourcesForStudent list both children', async () => {
    as('u_admin');
    const all = ok(await content.listResources({}));
    const forMateo = ok(await content.listResourcesForStudent({ studentId: 's_mateo' })) as unknown as { id: string; sharedWith: { id: string }[] }[];
    for (const list of [all, forMateo]) {
      const r = list.find((x) => x.id === resourceId)!;
      expect(r.sharedWith.map((s) => s?.id).sort()).toEqual(['s_mateo', 's_noah']);
    }
  });
});

describe('permissions', () => {
  it('Ana can’t read the other family’s library or work', async () => {
    as('u_ana');
    fails(await content.listResourcesForStudent({ studentId: 's_noah' }), 'FORBIDDEN');
    fails(await assignments.listForStudent({ studentId: 's_noah' }), 'FORBIDDEN');
  });

  it('signed out: neither read answers', async () => {
    as(null);
    fails(await content.listResourcesForStudent({ studentId: 's_mateo' }), 'UNAUTHENTICATED');
    fails(await assignments.listForStudent({ studentId: 's_mateo' }), 'UNAUTHENTICATED');
  });

  it('the share rows themselves are still there for Vienne', async () => {
    expect(await db.resourceShare.count({ where: { resourceId } })).toBe(2);
  });
});
