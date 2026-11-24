/**
 * server/fast — FAST (grades 3–6) and Star Math (K–2) results, and the testing
 * windows. Either Vienne or the student's parent can enter a result; every row
 * records who entered it, and Vienne can correct any of them.
 */
import { action, commit, getDb, need, newId, nowIso, requireStudentAccess, requireUser } from '../core';
import { categoriesFor, isFastGrade, AREA_LABEL } from '../best';

const WINDOWS = ['PM1', 'PM2', 'PM3'];

const resultDTO = (db, r) => {
  const by = db.users.find((u) => u.id === r.enteredById);
  return {
    ...r,
    enteredBy: by && { id: by.id, name: by.name, role: by.role },
    categories: (r.categories || []).map((c) => {
      const cat = categoriesFor(r.gradeTested).find((x) => x.id === c.categoryId);
      return { ...c, name: cat ? AREA_LABEL[cat.short] : c.categoryId, fullName: cat?.name };
    }),
  };
};

/** Results newest first, plus the categories a form should ask for. */
export async function listResults({ studentId }) {
  requireStudentAccess(studentId);
  const db = getDb();
  const student = db.students.find((s) => s.id === studentId);
  const order = (r) => `${r.schoolYear}-${r.window}`;
  return {
    testType: isFastGrade(student.grade) ? 'FAST_MATH' : 'STAR_MATH',
    categories: categoriesFor(student.grade).map((c) => ({ id: c.id, name: AREA_LABEL[c.short], fullName: c.name })),
    results: db.fastResults.filter((r) => r.studentId === studentId).sort((a, b) => order(b).localeCompare(order(a))).map((r) => resultDTO(db, r)),
  };
}

/**
 * Add or correct a result.
 * FAST: scaleScore + level 1–5 (+ optional category levels). Star Math: scaleScore + optional percentile.
 */
export const saveResult = action(async ({ id, studentId, schoolYear, window, scaleScore, level, percentile, categories = [] }) => {
  const user = requireStudentAccess(studentId);
  const db = getDb();
  const student = db.students.find((s) => s.id === studentId);
  const fast = isFastGrade(student.grade);
  need(WINDOWS.includes(window), 'Choose PM1, PM2 or PM3');
  need(/^\d{4}–\d{2}$/.test(schoolYear || ''), 'Choose the school year');
  need(Number.isInteger(scaleScore) && scaleScore > 0, 'Enter the scale score from the score report');
  if (fast) need(Number.isInteger(level) && level >= 1 && level <= 5, 'Choose the level, 1 to 5');
  if (!fast && percentile != null) need(percentile >= 1 && percentile <= 99, 'Percentile rank is 1 to 99');
  categories.forEach((c) => need(c.level >= 1 && c.level <= 5, 'Area levels are 1 to 5'));
  if (id && user.role !== 'ADMIN') need(db.fastResults.find((r) => r.id === id)?.enteredById === user.id, 'Only Vienne can change a result someone else entered');
  const dupe = db.fastResults.find((r) => r.studentId === studentId && r.schoolYear === schoolYear && r.window === window && r.id !== id);
  need(!dupe, `${window} ${schoolYear} is already entered. Edit that one instead.`);
  return commit((d) => {
    const fields = { schoolYear, window, scaleScore, level: fast ? level : null, percentile: fast ? null : percentile ?? null, categories: fast ? categories : [], enteredById: user.id, enteredAt: nowIso() };
    if (id) return resultDTO(d, Object.assign(d.fastResults.find((r) => r.id === id), fields));
    const row = { id: newId('fr'), studentId, testType: fast ? 'FAST_MATH' : 'STAR_MATH', gradeTested: student.grade, ...fields };
    d.fastResults.push(row);
    return resultDTO(d, row);
  });
});

export const deleteResult = action(async ({ id }) => {
  const db = getDb();
  const r = db.fastResults.find((x) => x.id === id);
  need(r, 'Result not found');
  const user = requireStudentAccess(r.studentId);
  if (user.role !== 'ADMIN') need(r.enteredById === user.id, 'Only Vienne can remove a result someone else entered');
  return commit((d) => {
    d.fastResults = d.fastResults.filter((x) => x.id !== id);
    return r;
  });
});

/** The next or current testing window (for Today and parent Home). */
export async function nextWindow() {
  requireUser();
  const now = Date.now();
  const w = [...getDb().settings.fastWindows].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).find((x) => new Date(x.endsAt).getTime() >= now);
  if (!w) return null;
  const startsMs = new Date(w.startsAt).getTime();
  return { ...w, inProgress: startsMs <= now, daysUntil: Math.max(0, Math.ceil((startsMs - now) / 86400000)) };
}
