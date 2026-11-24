import 'server-only';
import { db } from './db';
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
