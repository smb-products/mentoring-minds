'use server';
/**
 * server/content — files and library resources.
 *
 * Uploads go straight from the browser to storage (docs/WIRING.md):
 *   createUpload({ filename, mimeType, sizeBytes }) → { file, upload }
 *     upload.kind 'blob':  the browser calls @vercel/blob/client upload() (token from /api/files/blob)
 *     upload.kind 'local': the browser PUTs the bytes to upload.url (development)
 *   finishUpload({ fileId }) → the file, once its size and real type are checked
 * src/lib/upload-client.ts does all three; it's what the screens call as uploadFile.
 *
 * Contract: tests/contract/mock/server/content.js (the frozen mock)
 */
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireActive, requireAdmin, requireStudentAccess, requireUser } from '@/lib/guards';
import { action, ApiError, found, need, query } from '@/lib/result';
import { id, ids, optText, parse, text } from '@/lib/validate';
import { resourceDTO, resourceInclude, resourceTeaser } from '@/lib/dto';
import { ALLOWED_TYPES, MAX_BYTES, matchesType, readStart, removeObject, storageKeyFor, storedSize, uploadTarget, type AllowedType } from '@/lib/storage';
import { canReadFile, visibleTo } from '@/lib/files';

/* ── Files ──────────────────────────────────────────────── */

const LABEL: Record<AllowedType, string> = { 'application/pdf': 'PDF', 'image/png': 'PNG', 'image/jpeg': 'JPG', 'image/webp': 'WebP' };

export const createUpload = action(async (input: { filename: string; mimeType: string; sizeBytes: number }) => {
  const user = await requireActive();
  const v = parse(
    z.object({
      filename: z.string().trim().min(1).max(200),
      mimeType: z.enum(ALLOWED_TYPES, 'Use a PDF, PNG, JPG or WebP file'),
      sizeBytes: z.number().int().min(1, 'That file is empty').max(MAX_BYTES, 'Files can be up to 25 MB'),
    }),
    input,
  );
  const filename = v.filename.replace(/[\\/\u0000-\u001f]/g, '_');
  const key = storageKeyFor(randomUUID(), v.mimeType);
  const file = await db.fileAsset.create({ data: { storageKey: key, filename, mimeType: v.mimeType, sizeBytes: v.sizeBytes, uploadedById: user.id } });
  const upload = uploadTarget(file.id, key, v.mimeType);
  return { file, upload };
});

/** Checks the uploaded bytes (size and real type) and marks the file ready. */
export const finishUpload = action(async (input: { fileId: string }) => {
  const user = await requireActive();
  const { fileId } = parse(z.object({ fileId: id }), input);
  const file = found(await db.fileAsset.findUnique({ where: { id: fileId } }), 'File');
  need(file.uploadedById === user.id, 'That upload isn’t yours', 'FORBIDDEN');
  if (file.uploadedAt) return file;
  const size = await storedSize(file.storageKey);
  need(size != null, 'The upload didn’t finish. Try again.');
  const ok = size === file.sizeBytes && matchesType(await readStart(file.storageKey), file.mimeType);
  if (!ok) {
    await removeObject(file.storageKey);
    await db.fileAsset.delete({ where: { id: file.id } });
    throw new ApiError('INVALID', `That file isn’t a real ${LABEL[file.mimeType as AllowedType] ?? 'file'}. Try another.`);
  }
  return db.fileAsset.update({ where: { id: file.id }, data: { uploadedAt: new Date() } });
});

/** Permission check for one file (the download route uses the same rule). */
export const getFileForUser = query(async (input: { fileId: string }) => {
  const user = await requireUser();
  const { fileId } = parse(z.object({ fileId: id }), input);
  const { file, allowed } = await canReadFile(user, fileId);
  found(file, 'File');
  if (user.role !== 'ADMIN' && user.status !== 'ACTIVE') throw new ApiError('NOT_ACTIVE', 'Enter your invite code to open files.');
  need(allowed, 'You don’t have access to this file.', 'FORBIDDEN');
  return { ...file, url: `/api/files/${file.id}` };
});

/* ── Resources ──────────────────────────────────────────── */

const kind = z.enum(['WORKSHEET', 'VIDEO', 'LINK', 'NOTE', 'IMAGE']);

export const listResources = query(async (input: { subjectId?: string; kind?: string; status?: string } = {}) => {
  await requireAdmin();
  const v = parse(z.object({ subjectId: id.optional(), kind: kind.optional(), status: z.enum(['DRAFT', 'PUBLISHED']).optional() }), input);
  const rows = await db.resource.findMany({ where: { deletedAt: null, ...v }, include: resourceInclude, orderBy: { updatedAt: 'desc' } });
  return rows.map(resourceDTO);
});

/** Full resources for active families; teasers (no file, link or text) for preview accounts. */
export const listResourcesForStudent = query(async (input: { studentId?: string } = {}) => {
  const user = await requireUser();
  const { studentId } = parse(z.object({ studentId: id.optional() }), input);
  if (user.role !== 'ADMIN' && user.status === 'PREVIEW') {
    const teasers = await db.resource.findMany({ where: { status: 'PUBLISHED', showInPreview: true, deletedAt: null }, include: { subject: true }, orderBy: { updatedAt: 'desc' } });
    return teasers.map(resourceTeaser);
  }
  need(studentId, 'Choose a child');
  await requireStudentAccess(studentId);
  const student = found(await db.student.findUnique({ where: { id: studentId } }), 'Student');
  const rows = await db.resource.findMany({ where: { status: 'PUBLISHED', deletedAt: null }, include: resourceInclude, orderBy: { updatedAt: 'desc' } });
  return rows.filter((r) => visibleTo({ ...r, shares: r.shares }, student)).map(resourceDTO);
});

const fields = {
  title: text(120).min(1, 'Give it a title'),
  description: optText(2000),
  kind,
  subjectId: id.nullish(),
  gradeMin: z.number().int().min(0).max(6),
  gradeMax: z.number().int().min(0).max(6),
  fileId: id.nullish(),
  url: z.string().trim().max(1000).nullish(),
  body: z.object({ text: z.string().max(20000) }).nullish(),
  visibility: z.enum(['ALL', 'GRADES', 'SELECTED']),
  status: z.enum(['DRAFT', 'PUBLISHED']),
  showInPreview: z.boolean(),
};
type Fields = { [K in keyof typeof fields]: z.output<(typeof fields)[K]> };

async function validate(r: Fields) {
  need(r.gradeMin <= r.gradeMax, 'Grade range is backwards');
  if (r.kind === 'WORKSHEET' || r.kind === 'IMAGE') {
    need(r.fileId, 'Attach a file');
    const f = await db.fileAsset.findUnique({ where: { id: r.fileId } });
    need(f?.uploadedAt, 'That file didn’t finish uploading');
    if (r.kind === 'IMAGE') need(f.mimeType.startsWith('image/'), 'Attach an image');
  }
  if (r.kind === 'VIDEO' || r.kind === 'LINK') need(/^https?:\/\/\S+$/.test(r.url || ''), 'Add a link starting with https://');
  if (r.kind === 'NOTE') need(r.body?.text?.trim(), 'Write the note');
}

const DEFAULTS: Omit<Fields, 'title' | 'kind'> = { description: null, subjectId: null, gradeMin: 0, gradeMax: 6, fileId: null, url: null, body: null, visibility: 'ALL', status: 'DRAFT', showInPreview: false };

const dbFields = (r: Partial<Fields>) => {
  const { body, ...rest } = r;
  return { ...rest, ...(body !== undefined && { body: body === null ? Prisma.DbNull : body }) };
};

export const createResource = action(async (input: Partial<Fields> & { title: string; kind: string; studentIds?: string[] }) => {
  await requireAdmin();
  const v = parse(z.object({ ...fields, studentIds: ids.default([]) }).partial({ description: true, subjectId: true, gradeMin: true, gradeMax: true, fileId: true, url: true, body: true, visibility: true, status: true, showInPreview: true }), input);
  const { studentIds, ...rest } = v;
  const row = { ...DEFAULTS, ...rest } as Fields;
  await validate(row);
  const created = await db.resource.create({
    data: { ...(dbFields(row) as Omit<Prisma.ResourceUncheckedCreateInput, 'shares'>), shares: { create: studentIds.map((studentId) => ({ studentId })) } },
    include: resourceInclude,
  });
  return resourceDTO(created);
});

export const updateResource = action(async (input: Partial<Fields> & { resourceId: string; studentIds?: string[] }) => {
  await requireAdmin();
  const v = parse(z.object({ resourceId: id, studentIds: ids.optional(), ...fields }).partial().required({ resourceId: true }), input);
  const { resourceId, studentIds, ...patch } = v;
  const cur = found(await db.resource.findFirst({ where: { id: resourceId, deletedAt: null } }), 'Resource');
  const next = { ...cur, ...patch } as unknown as Fields;
  await validate(next);
  const updated = await db.resource.update({
    where: { id: resourceId },
    data: { ...dbFields(patch), ...(studentIds && { shares: { deleteMany: {}, create: studentIds.map((studentId) => ({ studentId })) } }) },
    include: resourceInclude,
  });
  return resourceDTO(updated);
});

export const setPublishStatus = action(async (input: { resourceId: string; status: 'DRAFT' | 'PUBLISHED' }) => {
  await requireAdmin();
  const v = parse(z.object({ resourceId: id, status: z.enum(['DRAFT', 'PUBLISHED']) }), input);
  found(await db.resource.findFirst({ where: { id: v.resourceId, deletedAt: null } }), 'Resource');
  return resourceDTO(await db.resource.update({ where: { id: v.resourceId }, data: { status: v.status }, include: resourceInclude }));
});

export const setSharing = action(async (input: { resourceId: string; visibility: 'ALL' | 'GRADES' | 'SELECTED'; studentIds?: string[] }) => {
  await requireAdmin();
  const v = parse(z.object({ resourceId: id, visibility: z.enum(['ALL', 'GRADES', 'SELECTED']), studentIds: ids.default([]) }), input);
  found(await db.resource.findFirst({ where: { id: v.resourceId, deletedAt: null } }), 'Resource');
  const updated = await db.resource.update({
    where: { id: v.resourceId },
    data: { visibility: v.visibility, shares: { deleteMany: {}, create: v.visibility === 'SELECTED' ? v.studentIds.map((studentId) => ({ studentId })) : [] } },
    include: resourceInclude,
  });
  return resourceDTO(updated);
});

/** Moves a resource to the bin (emptied after 30 days by the daily job). restoreResource undoes it. */
export const deleteResource = action(async (input: { resourceId: string }) => {
  await requireAdmin();
  const { resourceId } = parse(z.object({ resourceId: id }), input);
  const n = await db.resource.updateMany({ where: { id: resourceId, deletedAt: null }, data: { deletedAt: new Date() } });
  need(n.count, 'Resource not found', 'NOT_FOUND');
  return null;
});

export const restoreResource = action(async (input: { resourceId: string }) => {
  await requireAdmin();
  const { resourceId } = parse(z.object({ resourceId: id }), input);
  const n = await db.resource.updateMany({ where: { id: resourceId, deletedAt: { not: null } }, data: { deletedAt: null } });
  need(n.count, 'Nothing to restore');
  return null;
});
