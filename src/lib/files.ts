import 'server-only';
import { db, type Tx } from './db';
import type { Photo } from './dto';

type Viewer = { id: string; role: string; status: string };

/** Is this published, live resource visible to this student? */
export function visibleTo(
  r: { status: string; deletedAt: Date | null; visibility: string; gradeMin: number; gradeMax: number; shares?: { studentId: string }[] },
  student: { id: string; grade: number },
) {
  if (r.status !== 'PUBLISHED' || r.deletedAt) return false;
  if (r.visibility === 'ALL') return true;
  if (r.visibility === 'GRADES') return student.grade >= r.gradeMin && student.grade <= r.gradeMax;
  return (r.shares ?? []).some((s) => s.studentId === student.id);
}

/**
 * Who may open a file: Vienne, anyone; an active parent, a published resource
 * visible to one of their children, or their own children's work.
 * Files that haven't finished uploading are never served.
 */
export async function canReadFile(user: Viewer, fileId: string) {
  const file = await db.fileAsset.findUnique({ where: { id: fileId } });
  if (!file || !file.uploadedAt) return { file: null, allowed: false } as const;
  if (user.role === 'ADMIN') return { file, allowed: true } as const;
  if (user.status !== 'ACTIVE') return { file, allowed: false } as const;

  const kids = await db.student.findMany({ where: { parentId: user.id, status: { not: 'ARCHIVED' } }, select: { id: true, grade: true } });
  if (!kids.length) return { file, allowed: false } as const;
  const kidIds = kids.map((k) => k.id);

  const subs = await db.submission.findMany({ where: { studentId: { in: kidIds } }, select: { fileId: true, photos: true } });
  if (subs.some((s) => s.fileId === fileId || ((s.photos as Photo[]) ?? []).some((p) => p.fileId === fileId))) return { file, allowed: true } as const;

  // Their own upload that hasn't been handed in yet (the answer sheet shows it back).
  if (file.uploadedById === user.id) return { file, allowed: true } as const;

  const resources = await db.resource.findMany({ where: { fileId, status: 'PUBLISHED', deletedAt: null }, include: { shares: { select: { studentId: true } } } });
  return { file, allowed: resources.some((r) => kids.some((k) => visibleTo(r, k))) } as const;
}

/** Every `fileId` value anywhere inside a Json column (photos, drafts, answers, resource bodies). */
function collectFileIds(value: unknown, out: Set<string>) {
  if (Array.isArray(value)) for (const v of value) collectFileIds(v, out);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'fileId' && typeof v === 'string') out.add(v);
      else collectFileIds(v, out);
    }
  }
}

/**
 * The ids of every file something still points at: resources (in the bin too) and their
 * thumbnails, a submission's uploaded work, and any file id kept in a Json column
 * (a submission's photos, draft or answers, a resource's body).
 * The daily clean-up never removes a file in this set.
 */
export async function fileIdsInUse(client: Tx = db) {
  const used = new Set<string>();
  const resources = await client.resource.findMany({ select: { fileId: true, thumbnailId: true, body: true } });
  for (const r of resources) {
    if (r.fileId) used.add(r.fileId);
    if (r.thumbnailId) used.add(r.thumbnailId);
    collectFileIds(r.body, used);
  }
  const subs = await client.submission.findMany({ select: { fileId: true, photos: true, draft: true, answers: true } });
  for (const id of fileIdsOf(subs)) used.add(id);
  return used;
}

/** The file ids these submissions point at: the uploaded work, and any in the photos, draft or answers. */
export function fileIdsOf(subs: { fileId: string | null; photos: unknown; draft: unknown; answers: unknown }[]) {
  const out = new Set<string>();
  for (const s of subs) {
    if (s.fileId) out.add(s.fileId);
    collectFileIds(s.photos, out);
    collectFileIds(s.draft, out);
    collectFileIds(s.answers, out);
  }
  return out;
}

/**
 * Inside the transaction that has just removed the records pointing at `candidates` (S23):
 * deletes the rows of the files nothing uses any more and returns their storage keys, for
 * removeObject once it commits. A file anything else still uses (a library resource, another
 * child's work) stays.
 */
export async function dropUnusedFiles(tx: Tx, candidates: Iterable<string>) {
  const ids = [...new Set(candidates)];
  if (!ids.length) return [];
  const inUse = await fileIdsInUse(tx);
  const files = await tx.fileAsset.findMany({
    where: { id: { in: ids.filter((x) => !inUse.has(x)) }, resources: { none: {} }, submissions: { none: {} } },
    select: { id: true, storageKey: true },
  });
  await tx.fileAsset.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
  return files.map((f) => f.storageKey);
}
