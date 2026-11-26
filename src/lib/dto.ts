import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from './db';
import { areaFor, skillArea } from './best';
import type { AppSettings } from './settings';

/**
 * Shapes returned to the screens — the same fields as tests/contract/mock/dto.js
 * (docs/CONTRACT.md). Every server function returns these, never raw rows, so
 * secrets (password hashes, invite hashes, answer keys) can't slip out.
 *
 * Each DTO has a matching Prisma `include` so callers fetch exactly what it needs.
 */

type Json = Prisma.JsonValue;

/* ── People ─────────────────────────────────────────────── */

export const subjectDTO = (s: { id: string; name: string; color: string } | null | undefined) => (s ? { id: s.id, name: s.name, color: s.color } : null);

export const studentSummary = (s: { id: string; firstName: string; lastName: string; grade: number; avatarColor: string; parentId: string } | null | undefined) =>
  s ? { id: s.id, firstName: s.firstName, lastName: s.lastName, grade: s.grade, avatarColor: s.avatarColor, parentId: s.parentId } : null;

export const studentInclude = { subjects: { include: { subject: true } } } satisfies Prisma.StudentInclude;
type StudentRow = Prisma.StudentGetPayload<{ include: typeof studentInclude }>;

/** Full student. `adminNotes` (Vienne's private notes) only for Vienne. */
export function studentDTO(s: StudentRow, { admin }: { admin: boolean }) {
  const { subjects, adminNotes, ...rest } = s;
  return { ...rest, ...(admin ? { adminNotes } : {}), subjects: subjects.map((x) => subjectDTO(x.subject)) };
}

export const userSummary = (u: { id: string; name: string; email: string; phone: string | null; role: string; status: string; image: string | null } | null | undefined) =>
  u ? { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, status: u.status, image: u.image } : null;

/* ── Sessions ───────────────────────────────────────────── */

export const sessionInclude = {
  student: true,
  subject: true,
  location: true,
  requestedBy: true,
  note: { include: { skills: { include: { skill: true } } } },
} satisfies Prisma.SessionInclude;
export type SessionRow = Prisma.SessionGetPayload<{ include: typeof sessionInclude }>;

export function sessionDTO(s: SessionRow) {
  const { student, subject, location, requestedBy, note, ...rest } = s;
  return {
    ...rest,
    student: studentSummary(student),
    subject: subjectDTO(subject),
    location,
    requestedBy: userSummary(requestedBy),
    note: note && (({ skills, ...n }) => ({ ...n, skills: skills.map((x) => x.skill) }))(note),
  };
}

/** When the Join call button shows for a video session. */
export const joinWindow = (s: { startsAt: Date; endsAt: Date }, settings: Pick<AppSettings, 'joinOpensMin'>) => ({
  opensAt: new Date(s.startsAt.getTime() - settings.joinOpensMin * 60000),
  closesAt: s.endsAt,
});

/**
 * For parents: private notes hidden, and the video link only inside the join
 * window of a confirmed session (joinOpensMin before the start until the end).
 */
export function sessionForParent(s: SessionRow, settings: Pick<AppSettings, 'joinOpensMin'>, now = new Date()) {
  const dto: ReturnType<typeof sessionDTO> & { joinOpensAt?: Date } = sessionDTO(s);
  if (dto.note && !dto.note.sharedWithParent) dto.note = null;
  if (dto.mode === 'VIDEO') {
    const { opensAt, closesAt } = joinWindow(s, settings);
    const open = now >= opensAt && now <= closesAt;
    dto.joinOpensAt = opensAt;
    if (!open || dto.status !== 'CONFIRMED') dto.meetingUrl = null;
  }
  return dto;
}

/* ── Content ────────────────────────────────────────────── */

export const resourceInclude = {
  subject: true,
  file: true,
  tags: { include: { tag: true } },
  shares: { include: { student: true } },
} satisfies Prisma.ResourceInclude;
type ResourceRow = Prisma.ResourceGetPayload<{ include: typeof resourceInclude }>;

export function resourceDTO(r: ResourceRow) {
  const { subject, file, tags, shares, deletedAt: _deletedAt, ...rest } = r;
  return { ...rest, subject: subjectDTO(subject), file: fileOrNull(file), tags: tags.map((t) => t.tag), sharedWith: shares.map((x) => studentSummary(x.student)) };
}

/** Preview (locked) accounts only ever receive this: never fileId, url or body. */
export const resourceTeaser = (r: { id: string; title: string; kind: string; gradeMin: number; gradeMax: number; subject: { id: string; name: string; color: string } | null }) => ({
  id: r.id,
  title: r.title,
  kind: r.kind,
  subject: subjectDTO(r.subject),
  gradeMin: r.gradeMin,
  gradeMax: r.gradeMax,
  locked: true as const,
});

/* ── The book ───────────────────────────────────────────── */

export type BookTest = { key: string; name: string; count: number };
export const testsOf = (book: { tests: Json }) => (book.tests as BookTest[]) ?? [];

export const bookSummary = (b: { id: string; title: string; grade: number; tests: Json; buyUrl: string | null } | null | undefined) =>
  b ? { id: b.id, title: b.title, grade: b.grade, tests: testsOf(b), buyUrl: b.buyUrl } : null;

type BookItemRow = Prisma.BookItemGetPayload<object>;

/** A book question. The answer key is admin-only: `withAnswer: false` for families. */
export function bookItemDTO(item: BookItemRow, { grade, withAnswer }: { grade: number; withAnswer: boolean }) {
  const { answer, ...rest } = item;
  const base = { ...rest, area: areaFor(grade, { code: item.benchmarkCode }) };
  return withAnswer ? { ...base, answer } : base;
}

/* ── Files ──────────────────────────────────────────────── */

/** What a screen gets for one file: never the storage key, the uploader or any other column. */
export function fileDTO(f: { id: string; filename: string; mimeType: string; sizeBytes: number }) {
  return { id: f.id, filename: f.filename, mimeType: f.mimeType, sizeBytes: f.sizeBytes, url: `/api/files/${f.id}` };
}
/** A file attached to a resource or a submission: the same, plus when its upload was checked. */
const fileOrNull = (f: Parameters<typeof fileDTO>[0] & { uploadedAt: Date | null } | null | undefined) => (f ? { ...fileDTO(f), uploadedAt: f.uploadedAt } : null);

/* ── Work ───────────────────────────────────────────────── */

export type Photo = { number: number; fileId: string };
export type ScoredAnswer = { number: number; value: string | null; correct: boolean | null };

export const submissionInclude = {
  student: true,
  file: true,
  assignment: { include: { book: true } },
} satisfies Prisma.SubmissionInclude;
type SubmissionRow = Prisma.SubmissionGetPayload<{ include: typeof submissionInclude }>;

/** Loads the file rows for photos in one query (photos are JSON, not a relation). */
export async function photoFiles(subs: { photos: Json }[]) {
  const wanted = [...new Set(subs.flatMap((s) => ((s.photos as Photo[]) ?? []).map((p) => p.fileId)))];
  if (!wanted.length) return new Map<string, Prisma.FileAssetGetPayload<object>>();
  const rows = await db.fileAsset.findMany({ where: { id: { in: wanted } } });
  return new Map(rows.map((f) => [f.id, f]));
}

export function submissionDTO(s: SubmissionRow, files: Map<string, Prisma.FileAssetGetPayload<object>>) {
  const { student, assignment: a, file, answers, draft, ...rest } = s;
  return {
    ...rest,
    answers: answers as ScoredAnswer[] | null,
    draft: draft as { number: number; value: string | null }[] | null,
    student: studentSummary(student),
    assignment: a && {
      id: a.id,
      title: a.title,
      kind: a.kind,
      dueAt: a.dueAt,
      bookId: a.bookId,
      bookTest: a.bookTest,
      bookFrom: a.bookFrom,
      bookTo: a.bookTo,
      book: bookSummary(a.book),
    },
    file: fileOrNull(file),
    photos: ((s.photos as Photo[]) ?? []).map((p) => ({ ...p, file: fileOrNull(files.get(p.fileId)) })),
  };
}

/** Convenience: DTOs for many submissions with one photo lookup. */
export async function submissionDTOs(subs: SubmissionRow[]) {
  const files = await photoFiles(subs);
  return subs.map((s) => submissionDTO(s, files));
}

/* ── Reports ────────────────────────────────────────────── */

export const reportInclude = { student: { select: { grade: true } }, ratings: { include: { skill: true } } } satisfies Prisma.ProgressReportInclude;
type ReportRow = Prisma.ProgressReportGetPayload<{ include: typeof reportInclude }>;

/** Ratings carry the FAST area (grades 3–6) or B.E.S.T. strand (K–2) they count toward. */
export function reportDTO(r: ReportRow) {
  const { student, ratings, ...rest } = r;
  return {
    ...rest,
    ratings: ratings.map(({ skill, ...x }) => ({ ...x, skill, area: skillArea(student.grade, skill) })),
  };
}
