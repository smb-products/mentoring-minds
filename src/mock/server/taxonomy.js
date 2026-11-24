/** server/taxonomy — Vienne's subjects and skills. Archive, never delete. */
import { action, commit, getDb, need, newId, nowIso, requireAdmin, requireUser } from '../core';

export async function listSubjects({ includeArchived = false } = {}) {
  requireUser();
  const db = getDb();
  return db.subjects
    .filter((s) => includeArchived || !s.archivedAt)
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      ...s,
      skills: db.skills.filter((k) => k.subjectId === s.id && (includeArchived || !k.archivedAt)).sort((a, b) => a.order - b.order),
    }));
}

export const upsertSubject = action(async ({ id, name, color }) => {
  requireAdmin();
  need(name?.trim(), 'Name the subject');
  return commit((db) => {
    if (id) return Object.assign(db.subjects.find((s) => s.id === id), { name: name.trim(), ...(color && { color }) });
    const row = { id: newId('sub'), name: name.trim(), color: color || 'chart-1', order: db.subjects.length, archivedAt: null };
    db.subjects.push(row);
    return row;
  });
});

export const upsertSkill = action(async ({ id, subjectId = 'sub_math', name, strand, gradeMin, gradeMax, benchmarkCodes }) => {
  requireAdmin();
  need(name?.trim(), 'Name the skill');
  need(gradeMin <= gradeMax, 'Grade range is backwards');
  return commit((db) => {
    const fields = { name: name.trim(), gradeMin, gradeMax, ...(strand && { strand }), ...(benchmarkCodes && { benchmarkCodes }) };
    if (id) return Object.assign(db.skills.find((s) => s.id === id), fields);
    const order = db.skills.filter((s) => s.subjectId === subjectId).length;
    const row = { id: newId('sk'), subjectId, strand: strand || 'NSO', benchmarkCodes: benchmarkCodes || [], order, archivedAt: null, ...fields };
    db.skills.push(row);
    return row;
  });
});

export const reorderSkills = action(async ({ subjectId, skillIds }) => {
  requireAdmin();
  commit((db) => skillIds.forEach((id, i) => {
    const s = db.skills.find((x) => x.id === id && x.subjectId === subjectId);
    if (s) s.order = i;
  }));
});

export const archiveSkill = action(async ({ skillId, archived = true }) => {
  requireAdmin();
  commit((db) => (db.skills.find((s) => s.id === skillId).archivedAt = archived ? nowIso() : null));
});

export const archiveSubject = action(async ({ subjectId, archived = true }) => {
  requireAdmin();
  commit((db) => (db.subjects.find((s) => s.id === subjectId).archivedAt = archived ? nowIso() : null));
});
