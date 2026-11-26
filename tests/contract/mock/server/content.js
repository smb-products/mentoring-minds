/** server/content — files and library resources (plan §9). */
import { action, ApiError, commit, getDb, need, newId, nowIso, requireAdmin, requireStudentAccess, requireUser } from '../core';
import { resourceDTO, resourceTeaser } from '../dto';

const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 25 * 1024 * 1024;

/** POST /api/files. In production the bytes are checked by signature and stored via StorageAdapter. */
export const uploadFile = action(async ({ filename, mimeType, sizeBytes }) => {
  const user = requireUser();
  need(ALLOWED.includes(mimeType), 'Use a PDF, PNG, JPG or WebP file');
  need(sizeBytes <= MAX_BYTES, 'Files can be up to 25 MB');
  return commit((db) => {
    const id = newId('fa');
    const row = { id, storageKey: `uploads/${id}`, filename, mimeType, sizeBytes, uploadedById: user.id, createdAt: nowIso() };
    db.fileAssets.push(row);
    return row;
  });
});

/** GET /api/files/[id] permission check. Returns the asset (prod: a short-lived signed URL). */
export async function getFileForUser({ fileId }) {
  const user = requireUser();
  const db = getDb();
  const file = db.fileAssets.find((f) => f.id === fileId);
  need(file, 'File not found');
  if (user.role === 'ADMIN') return file;
  if (user.status !== 'ACTIVE') throw new ApiError('NOT_ACTIVE', 'Enter your invite code to open files.');
  const kids = db.students.filter((s) => s.parentId === user.id);
  const ownsSubmission = db.submissions.some((s) => (s.fileId === fileId || (s.photos || []).some((p) => p.fileId === fileId)) && kids.some((k) => k.id === s.studentId));
  const resource = db.resources.find((r) => r.fileId === fileId);
  const canSee = resource && kids.some((k) => visibleTo(db, resource, k));
  if (!ownsSubmission && !canSee) throw new ApiError('FORBIDDEN', 'You don’t have access to this file.');
  return file;
}

function visibleTo(db, r, student) {
  if (r.status !== 'PUBLISHED') return false;
  if (r.visibility === 'ALL') return true;
  if (r.visibility === 'GRADES') return student.grade >= r.gradeMin && student.grade <= r.gradeMax;
  return db.resourceShares.some((s) => s.resourceId === r.id && s.studentId === student.id);
}

export async function listResources({ subjectId, kind, status } = {}) {
  requireAdmin();
  return getDb()
    .resources.filter((r) => (!subjectId || r.subjectId === subjectId) && (!kind || r.kind === kind) && (!status || r.status === status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(resourceDTO);
}

/** Full resources for active families; teasers (no file/url/body) for preview accounts. */
export async function listResourcesForStudent({ studentId }) {
  const db = getDb();
  const user = requireUser();
  if (user.role !== 'ADMIN' && user.status === 'PREVIEW') {
    return db.resources.filter((r) => r.status === 'PUBLISHED' && r.showInPreview).map(resourceTeaser);
  }
  requireStudentAccess(studentId);
  const student = db.students.find((s) => s.id === studentId);
  return db.resources.filter((r) => visibleTo(db, r, student)).map(resourceDTO);
}

const FIELDS = ['title', 'description', 'kind', 'subjectId', 'gradeMin', 'gradeMax', 'fileId', 'url', 'body', 'visibility', 'status', 'showInPreview'];
const pick = (input) => Object.fromEntries(Object.entries(input).filter(([k]) => FIELDS.includes(k)));

function validate(r) {
  need(r.title?.trim(), 'Give it a title');
  need(r.gradeMin <= r.gradeMax, 'Grade range is backwards');
  if (r.kind === 'WORKSHEET' || r.kind === 'IMAGE') need(r.fileId, 'Attach a file');
  if (r.kind === 'VIDEO' || r.kind === 'LINK') need(/^https?:\/\//.test(r.url || ''), 'Add a link starting with https://');
  if (r.kind === 'NOTE') need(r.body?.text?.trim(), 'Write the note');
}

export const createResource = action(async ({ studentIds = [], ...input }) => {
  requireAdmin();
  const now = nowIso();
  const row = { id: newId('res'), thumbnailId: null, fileId: null, url: null, body: null, subjectId: null, description: null, visibility: 'ALL', status: 'DRAFT', showInPreview: false, gradeMin: 0, gradeMax: 6, ...pick(input), createdAt: now, updatedAt: now };
  validate(row);
  return commit((db) => {
    db.resources.push(row);
    studentIds.forEach((studentId) => db.resourceShares.push({ resourceId: row.id, studentId }));
    return resourceDTO(row);
  });
});

export const updateResource = action(async ({ resourceId, studentIds, ...input }) => {
  requireAdmin();
  return commit((db) => {
    const r = db.resources.find((x) => x.id === resourceId);
    need(r, 'Resource not found');
    const next = { ...r, ...pick(input), updatedAt: nowIso() };
    validate(next);
    Object.assign(r, next);
    if (studentIds) db.resourceShares = db.resourceShares.filter((s) => s.resourceId !== resourceId).concat(studentIds.map((studentId) => ({ resourceId, studentId })));
    return resourceDTO(r);
  });
});

export const setPublishStatus = action(async ({ resourceId, status }) => {
  requireAdmin();
  return commit((db) => resourceDTO(Object.assign(db.resources.find((r) => r.id === resourceId), { status, updatedAt: nowIso() })));
});

export const setSharing = action(async ({ resourceId, visibility, studentIds = [] }) => {
  requireAdmin();
  return commit((db) => {
    const r = db.resources.find((x) => x.id === resourceId);
    r.visibility = visibility;
    db.resourceShares = db.resourceShares.filter((s) => s.resourceId !== resourceId).concat(visibility === 'SELECTED' ? studentIds.map((studentId) => ({ resourceId, studentId })) : []);
    return resourceDTO(r);
  });
});

/** Moves a resource to the bin (kept 30 days in production). restoreResource undoes it. */
export const deleteResource = action(async ({ resourceId }) => {
  requireAdmin();
  commit((db) => {
    const i = db.resources.findIndex((r) => r.id === resourceId);
    need(i >= 0, 'Resource not found');
    db.deletedResources = [...(db.deletedResources || []), { resource: db.resources[i], shares: db.resourceShares.filter((s) => s.resourceId === resourceId) }];
    db.resources.splice(i, 1);
    db.resourceShares = db.resourceShares.filter((s) => s.resourceId !== resourceId);
  });
});
export const restoreResource = action(async ({ resourceId }) => {
  requireAdmin();
  commit((db) => {
    const bin = (db.deletedResources || []).find((x) => x.resource.id === resourceId);
    need(bin, 'Nothing to restore');
    db.resources.push(bin.resource);
    db.resourceShares.push(...bin.shares);
    db.deletedResources = db.deletedResources.filter((x) => x !== bin);
  });
});
