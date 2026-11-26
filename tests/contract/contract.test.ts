/**
 * THE WIRING CHECKER. The screens were built against the mock (frozen in tests/contract/mock). This calls
 * each mock function and its real twin (src/server) on identical data — the mock's
 * own records are loaded into Postgres — as the same user, and compares the shapes
 * of what comes back: every field the screens can read from the mock must be there,
 * with the same type, in the real result.
 *
 *   npm run test:contract
 *
 * A failure names the function and the field path, e.g.
 *   scheduling.listSessions (u_ana): missing in real: [].note.skills
 * Intentional differences are listed in ALLOWED_EXTRA / SKIP with the reason.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { as, db } from '../integration/helpers';
import { loadDemo, truncateAll } from '../../prisma/data';

// Claude is stubbed so the AI functions can be compared without network calls.
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async (req: { output_config: { format: { schema: { properties: Record<string, unknown> } } } }) => {
        const isNote = 'note' in req.output_config.format.schema.properties;
        const text = isNote
          ? JSON.stringify({ note: 'We worked on fractions.', homework: null, skills: [{ skillId: 'sk_fractions', rating: 3 }], redo: [{ test: 'T1', number: 2 }], unsure: [] })
          : JSON.stringify({ test: 'T4', items: [{ number: 1, answer: 'B', format: 'MC', benchmarkCode: null, confident: true }] });
        return { stop_reason: 'end_turn', content: [{ type: 'text', text }] };
      },
    };
  },
}));

import { getDb, setSessionUser } from './mock/core';
import * as mAi from './mock/server/ai';
import * as mAssignments from './mock/server/assignments';
import * as mBooks from './mock/server/books';
import * as mContent from './mock/server/content';
import * as mDashboard from './mock/server/dashboard';
import * as mFamilies from './mock/server/families';
import * as mFast from './mock/server/fast';
import * as mInvites from './mock/server/invites';
import * as mMessages from './mock/server/messages';
import * as mNotifications from './mock/server/notifications';
import * as mReports from './mock/server/reports';
import * as mScheduling from './mock/server/scheduling';
import * as mTaxonomy from './mock/server/taxonomy';
import * as rAi from '@/server/ai';
import * as rAssignments from '@/server/assignments';
import * as rBooks from '@/server/books';
import * as rContent from '@/server/content';
import * as rDashboard from '@/server/dashboard';
import * as rFamilies from '@/server/families';
import * as rFast from '@/server/fast';
import * as rInvites from '@/server/invites';
import * as rMessages from '@/server/messages';
import * as rNotifications from '@/server/notifications';
import * as rReports from '@/server/reports';
import * as rScheduling from '@/server/scheduling';
import * as rTaxonomy from '@/server/taxonomy';

type Mod = Record<string, unknown>;
const MODULES: Record<string, [Mod, Mod]> = {
  ai: [mAi, rAi],
  assignments: [mAssignments, rAssignments],
  books: [mBooks, rBooks],
  content: [mContent, rContent],
  dashboard: [mDashboard, rDashboard],
  families: [mFamilies, rFamilies],
  fast: [mFast, rFast],
  invites: [mInvites, rInvites],
  messages: [mMessages, rMessages],
  notifications: [mNotifications, rNotifications],
  reports: [mReports, rReports],
  scheduling: [mScheduling, rScheduling],
  taxonomy: [mTaxonomy, rTaxonomy],
};

/** Mock exports that are internal helpers or prompt constants, not endpoints. */
const HELPERS = new Set(['MODEL', 'EFFORT', 'SESSION_NOTE_SCHEMA', 'ANSWER_PAGE_SCHEMA', 'sessionNoteSystem', 'sessionNoteUser', 'answerPageSystem', 'starsFor', 'itemsFor', 'toNumber', 'check', 'bookResultsFor', 'inviteStatus', 'notify', 'notifyAdmins']);
/** Mock functions whose real version deliberately works differently (see docs/WIRING.md). */
const REPLACED: Record<string, string> = {
  'content.uploadFile': 'Real uploads are createUpload → PUT → finishUpload; the screens call src/lib/upload-client.ts uploadFile(file).',
};
/** Fields only the real backend returns (fine for the screens: they ignore unknown fields). */
const ALLOWED_EXTRA = [
  /\.uploadedAt$/, // files: set once the bytes are checked
  /\.fileId$/, // submissions: optional practice upload (mock rows lack the key when unset)
  /\.url$/, // content.getFileForUser: the download URL
  /\.joinOpensAt$/, // parents' video sessions (mock sets it too, only for video)
];

/**
 * Fields the mock returns that the real backend deliberately leaves out.
 * `adminNotes` is Vienne's private note on a student: the mock sent it to parents in
 * a few places (updateStudent, getReport); the real backend only sends it to Vienne.
 */
const ALLOWED_MISSING: { path: RegExp; when: (user: string) => boolean; why: string }[] = [
  { path: /(^|\.)adminNotes$/, when: (u) => u !== 'u_admin', why: 'Vienne’s private notes never go to parents' },
  // S13: files are a DTO (src/lib/dto.ts fileDTO); the mock returned the whole FileAsset row.
  { path: /(^content\.getFileForUser|\.file)\.(storageKey|uploadedById|createdAt)$/, when: () => true, why: 'Files go out as a DTO: no storage key, uploader or other columns' },
  // S15: a family's library sends no `sharedWith` (the mock listed other families' children and their parent ids).
  { path: /^content\.listResourcesForStudent\[\]\.sharedWith$/, when: (u) => u !== 'u_admin', why: 'A family never sees who else a resource is shared with' },
];

/** Error codes: the mock's need() always says INVALID; the real backend says NOT_FOUND for missing rows. */
const sameCode = (m: { code?: string; error: string }, r: { code?: string }) => m.code === r.code || (m.code === 'INVALID' && r.code === 'NOT_FOUND' && /not found/i.test(m.error));

/* ── shapes ─────────────────────────────────────────────── */

type Shape = { t: 'null' } | { t: 'string' } | { t: 'number' } | { t: 'boolean' } | { t: 'array'; of: Shape | null } | { t: 'object'; keys: Record<string, Shape> };

function shapeOf(v: unknown): Shape {
  if (v === null || v === undefined) return { t: 'null' };
  if (Array.isArray(v)) return { t: 'array', of: v.reduce<Shape | null>((acc, x) => merge(acc, shapeOf(x)), null) };
  if (typeof v === 'object') return { t: 'object', keys: Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, shapeOf(x)])) };
  return { t: typeof v as 'string' | 'number' | 'boolean' };
}

/** Union of two shapes (array elements, nullable fields). */
function merge(a: Shape | null, b: Shape | null): Shape | null {
  if (!a) return b;
  if (!b) return a;
  if (a.t === 'null') return b;
  if (b.t === 'null') return a;
  if (a.t === 'object' && b.t === 'object') {
    const keys: Record<string, Shape> = { ...a.keys };
    for (const [k, s] of Object.entries(b.keys)) keys[k] = merge(keys[k] ?? null, s)!;
    return { t: 'object', keys };
  }
  if (a.t === 'array' && b.t === 'array') return { t: 'array', of: merge(a.of, b.of) };
  return a;
}

/**
 * Problems with `real` given the screens were built on `mock`.
 * A key the mock returns is required in the real result even when its value is null or [].
 * A null in the mock is a nullable field: the real side may hold any value there. A null in
 * the real result where the mock has a list or an object is a type problem (the screen would
 * call `.map` or read a field on it). Lists: both sides run on the same data, so when only
 * one side has elements that is reported too, and element shapes are compared when both do.
 */
function compare(mock: Shape | null, real: Shape | null, path = '', out: { missing: string[]; type: string[]; extra: string[]; empty: string[] } = { missing: [], type: [], extra: [], empty: [] }) {
  if (!mock || mock.t === 'null') return out; // nullable in the mock: the real side may be anything
  if (!real || real.t === 'null') {
    if (mock.t === 'array' || mock.t === 'object') out.type.push(`${path || '(root)'}: mock ${mock.t}, real null`);
    return out; // a nullable scalar
  }
  if (mock.t !== real.t) {
    out.type.push(`${path || '(root)'}: mock ${mock.t}, real ${real.t}`);
    return out;
  }
  if (mock.t === 'array' && real.t === 'array') {
    if (!mock.of !== !real.of) out.empty.push(`${path}[]: ${mock.of ? 'mock has elements, real is empty' : 'mock is empty, real has elements'}`);
    return compare(mock.of, real.of, `${path}[]`, out);
  }
  if (mock.t === 'object' && real.t === 'object') {
    for (const k of Object.keys(mock.keys)) {
      if (!(k in real.keys)) out.missing.push(`${path}.${k}`);
      else compare(mock.keys[k], real.keys[k], `${path}.${k}`, out);
    }
    for (const k of Object.keys(real.keys)) if (!(k in mock.keys) && !ALLOWED_EXTRA.some((re) => re.test(`${path}.${k}`))) out.extra.push(`${path}.${k}`);
  }
  return out;
}

const json = (v: unknown) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
type Outcome = { ok: true; data: unknown } | { ok: false; error: string; code?: string };
const isResult = (v: unknown): v is Outcome => !!v && typeof v === 'object' && 'ok' in v && typeof (v as { ok: unknown }).ok === 'boolean' && ('data' in v || 'error' in v);

async function callMock(ns: string, fn: string, input: unknown, user: string): Promise<Outcome> {
  setSessionUser(user, { silent: true });
  try {
    const v = await (MODULES[ns][0][fn] as (i: unknown) => unknown)(input);
    return isResult(v) ? (json(v) as Outcome) : { ok: true, data: json(v) };
  } catch (e) {
    return { ok: false, error: (e as Error).message, code: (e as { code?: string }).code };
  }
}
async function callReal(ns: string, fn: string, input: unknown, user: string): Promise<Outcome> {
  as(user);
  return json(await (MODULES[ns][1][fn] as (i: unknown) => Promise<Outcome>)(input)) as Outcome;
}

const report: string[] = [];
const extras = new Set<string>();

/**
 * Calls both, asserts both succeed (or both fail with the same code), and compares shapes.
 * `realInput` is for rows each side created itself (their ids differ).
 */
async function check(ns: string, fn: string, input: unknown, user: string, realInput: unknown = input) {
  const label = `${ns}.${fn} (${user})`;
  const [m, r] = [await callMock(ns, fn, input, user), await callReal(ns, fn, realInput, user)];
  if (!m.ok || !r.ok) {
    expect(r.ok, `${label}: mock ${m.ok ? 'ok' : `${m.code} “${m.error}”`}, real ${r.ok ? 'ok' : `${r.code} “${r.error}”`}`).toBe(m.ok);
    if (!m.ok && !r.ok) expect(sameCode(m, r), `${label}: mock ${m.code}, real ${r.code}`).toBe(true);
    return r;
  }
  const diff = compare(shapeOf(m.data), shapeOf(r.data));
  diff.missing = diff.missing.filter((x) => !ALLOWED_MISSING.some((a) => (a.path.test(x) || a.path.test(`${ns}.${fn}${x}`)) && a.when(user)));
  diff.extra.forEach((x) => extras.add(`${ns}.${fn}${x}`));
  const problems = [...diff.missing.map((x) => `missing in real: ${x}`), ...diff.type.map((x) => `different type: ${x}`), ...diff.empty.map((x) => `different list: ${x}`)];
  if (problems.length) report.push(`${label}\n    ${problems.join('\n    ')}`);
  expect(problems, label).toEqual([]);
  return r;
}

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  await truncateAll(db as never);
  // The mock's own in-memory records, so both sides start identical (same ids, same times).
  await loadDemo(db as never, getDb() as never, { writeFiles: true });
});

/* ── 1. every endpoint the screens use exists ──────────── */

describe('every mock function has a real twin', () => {
  for (const [ns, [mock, real]] of Object.entries(MODULES)) {
    it(ns, () => {
      const missing = Object.keys(mock).filter((k) => typeof mock[k] === 'function' && !HELPERS.has(k) && !REPLACED[`${ns}.${k}`] && typeof real[k] !== 'function');
      expect(missing.map((k) => `${ns}.${k}`)).toEqual([]);
    });
  }
});

/* ── 2. reads, as each kind of user ────────────────────── */

const ADMIN = 'u_admin';

/** A confirmed session picked from the shared demo data by what the step needs (the demo moves with "now"). */
function upcoming(test: (s: { id: string; studentId: string; mode: string; startsAt: string; status: string }) => boolean, minHours = 30) {
  const d = getDb() as unknown as { sessions: { id: string; studentId: string; mode: string; startsAt: string; status: string }[]; students: { id: string; parentId: string }[] };
  const s = d.sessions
    .filter((x) => x.status === 'CONFIRMED' && new Date(x.startsAt).getTime() > Date.now() + minHours * 3600000 && test(x))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  if (!s) throw new Error('No demo session fits this step');
  return s.id;
}
const parentOf = (studentId: string) => (getDb() as unknown as { students: { id: string; parentId: string }[] }).students.find((x) => x.id === studentId)?.parentId;
const READS: [string, string, unknown, string][] = [
  ['dashboard', 'getAdminToday', {}, ADMIN],
  ['dashboard', 'getParentOverview', { studentId: 's_mateo' }, 'u_ana'],
  ['dashboard', 'getParentOverview', { studentId: 's_lucia' }, 'u_ana'],
  ['dashboard', 'getParentOverview', { studentId: 's_noah' }, 'u_grace'],
  ['dashboard', 'getParentOverview', { studentId: 's_ava' }, 'u_monique'],
  ['families', 'listFamilies', {}, ADMIN],
  ['families', 'getFamily', { parentId: 'u_ana' }, ADMIN],
  ['families', 'getFamily', { parentId: 'u_ana' }, 'u_ana'],
  ['families', 'getFamily', { parentId: 'u_grace' }, ADMIN],
  ['scheduling', 'getSettings', {}, ADMIN],
  ['scheduling', 'getSettings', {}, 'u_ana'],
  ['scheduling', 'getAvailability', {}, 'u_ana'],
  ['scheduling', 'listTimeOff', {}, ADMIN],
  ['scheduling', 'listLocations', {}, 'u_ana'],
  ['scheduling', 'listSessions', {}, ADMIN],
  ['scheduling', 'listSessions', {}, 'u_ana'],
  ['scheduling', 'listSessions', { studentId: 's_noah' }, 'u_grace'],
  ['scheduling', 'listSessions', { status: ['REQUESTED'] }, ADMIN],
  ['assignments', 'listAssignments', {}, ADMIN],
  ['assignments', 'getAssignment', { assignmentId: 'as_g5_t1' }, ADMIN],
  ['assignments', 'getAssignment', { assignmentId: 'as_fldoe' }, ADMIN],
  ['assignments', 'listForStudent', { studentId: 's_mateo' }, 'u_ana'],
  ['assignments', 'listForStudent', { studentId: 's_lucia' }, 'u_ana'],
  ['assignments', 'gradingQueue', {}, ADMIN],
  ['books', 'listBooks', {}, ADMIN],
  ['books', 'getAnswerKey', { bookId: 'book_g5', test: 'T1' }, ADMIN],
  ['books', 'bookForGrade', { grade: 5 }, 'u_ana'],
  ['books', 'listRedo', { studentId: 's_lucia' }, 'u_ana'],
  ['books', 'listRedo', { studentId: 's_mateo' }, ADMIN],
  ['fast', 'listResults', { studentId: 's_lucia' }, 'u_ana'],
  ['fast', 'listResults', { studentId: 's_ava' }, 'u_monique'],
  ['fast', 'nextWindow', {}, 'u_ana'],
  ['content', 'listResources', {}, ADMIN],
  ['content', 'listResourcesForStudent', { studentId: 's_mateo' }, 'u_ana'],
  ['content', 'listResourcesForStudent', {}, 'u_tom'],
  ['content', 'getFileForUser', { fileId: 'fa_lucia_work' }, 'u_ana'],
  ['reports', 'listForStudent', { studentId: 's_mateo' }, 'u_ana'],
  ['reports', 'listForStudent', { studentId: 's_arjun' }, ADMIN],
  ['reports', 'getReport', { reportId: 'rep_mateo_1' }, 'u_ana'],
  ['reports', 'getReport', { reportId: 'rep_arjun_1' }, ADMIN],
  ['messages', 'listThreads', {}, ADMIN],
  ['messages', 'getThread', { conversationId: 'conv_daniel' }, ADMIN],
  ['messages', 'getThread', {}, 'u_ana'],
  ['messages', 'unreadCount', {}, ADMIN],
  ['notifications', 'listForUser', {}, ADMIN],
  ['notifications', 'listForUser', {}, 'u_monique'],
  ['invites', 'listInvites', {}, ADMIN],
  ['taxonomy', 'listSubjects', {}, 'u_ana'],
  // Failures must match too (same code), so screens show the same message paths.
  ['dashboard', 'getParentOverview', { studentId: 's_sofia' }, 'u_ana'],
  ['reports', 'getReport', { reportId: 'rep_arjun_1' }, 'u_priya'],
];

describe('reads match the mock', () => {
  for (const [ns, fn, input, user] of READS) it(`${ns}.${fn} as ${user} ${JSON.stringify(input)}`, () => check(ns, fn, input, user));
});

/* ── 3. writes, applied to both in the same order ──────── */

describe('writes match the mock', () => {
  it('scheduling: request → confirm → complete; cancel; decline; time off', async () => {
    setSessionUser('u_ana', { silent: true });
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 14 * 86400000).toISOString();
    await check('scheduling', 'getOpenSlots', { durationMin: 45, mode: 'VIDEO', from, to }, 'u_ana');
    const slots = (await (mScheduling.getOpenSlots as (i: unknown) => Promise<{ startsAt: string }[]>)({ durationMin: 45, mode: 'VIDEO', from, to }));
    const req = await check('scheduling', 'requestSession', { studentId: 's_mateo', mode: 'VIDEO', startsAt: slots[1].startsAt, durationMin: 45, parentNote: 'hi' }, 'u_ana');
    const id = (req as { data: { id: string } }).data.id;
    // Ids differ between the two sides from here, so later steps use demo rows.
    await check('scheduling', 'confirmSession', { sessionId: 'ses_r1' }, ADMIN);
    await check('scheduling', 'declineSession', { sessionId: 'ses_r2', reason: 'Away' }, ADMIN);
    await check('scheduling', 'cancelSession', { sessionId: upcoming((x) => parentOf(x.studentId) === 'u_ana'), reason: 'Trip' }, 'u_ana');
    await check('scheduling', 'markNoShow', { sessionId: upcoming((x) => x.mode === 'IN_PERSON' && parentOf(x.studentId) !== 'u_ana', 2) }, ADMIN);
    await check('scheduling', 'setMeetingUrl', { sessionId: upcoming((x) => x.mode === 'VIDEO', 2), meetingUrl: 'https://meet.google.com/abc-defg-hij' }, ADMIN);
    await check('scheduling', 'joinCall', { sessionId: 'ses_live' }, 'u_grace');
    await check('scheduling', 'completeSession', { sessionId: 'ses_live', attendance: 'PRESENT', summary: 'Good session', skillIds: [], redoItemIds: [], clearRedoIds: [] }, ADMIN);
    await check('scheduling', 'addTimeOff', { startsAt: new Date(Date.now() + 40 * 86400000).toISOString(), endsAt: new Date(Date.now() + 41 * 86400000).toISOString(), reason: 'Conference' }, ADMIN);
    await check('scheduling', 'updateSettings', { joinOpensMin: 10 }, ADMIN);
    // Her own hours saved back unchanged, so later steps see the same week.
    const hours = (getDb() as unknown as { availability: { weekday: number; startMin: number; endMin: number; modes: string[] }[] }).availability;
    await check('scheduling', 'setAvailability', { rows: hours.map(({ weekday, startMin, endMin, modes }) => ({ weekday, startMin, endMin, modes })) }, ADMIN);
    const day = new Date(Date.now() + 55 * 86400000);
    day.setUTCHours(17, 0, 0, 0);
    await check('scheduling', 'createSessionAsAdmin', { studentId: 's_mateo', mode: 'IN_PERSON', locationId: 'loc_studio', startsAt: day.toISOString(), durationMin: 60 }, ADMIN);
    await check('scheduling', 'removeTimeOff', { timeOffId: 'to_1' }, ADMIN);
    expect(id).toBeTruthy();
  });

  it('families and FAST', async () => {
    await check('families', 'updateStudent', { studentId: 's_mateo', goals: 'More confidence' }, 'u_ana');
    await check('families', 'updateParent', { parentId: 'u_ana', phone: '(305) 555-0000' }, ADMIN);
    await check('families', 'setTextSize', { textSize: 'LARGE' }, 'u_ana');
    await check('families', 'addStudent', { parentId: 'u_grace', firstName: 'June', grade: 1 }, ADMIN);
    // Before the reset: after it, Daniel can only choose a new password (S21).
    await check('fast', 'deleteResult', { id: 'fr_sofia_PM1_2026' }, 'u_daniel');
    await check('families', 'resetParentPassword', { parentId: 'u_daniel' }, ADMIN);
    await check('families', 'setParentStatus', { parentId: 'u_daniel', status: 'PAUSED' }, ADMIN);
    await check('families', 'setParentStatus', { parentId: 'u_daniel', status: 'ACTIVE' }, ADMIN);
    await check('fast', 'saveResult', { studentId: 's_mateo', schoolYear: '2026–27', window: 'PM2', scaleScore: 300, level: 3 }, 'u_ana');
    await check('fast', 'saveResult', { studentId: 's_ava', schoolYear: '2026–27', window: 'PM2', scaleScore: 600, percentile: 50 }, 'u_monique');
    await check('books', 'setHasBook', { studentId: 's_lucia', hasBook: true }, 'u_ana');
  });

  it('homework: assign, draft, hand in, grade, return, practice', async () => {
    await check('assignments', 'createBookAssignment', { bookId: 'book_g3', test: 'T2', from: 1, to: 5, studentIds: ['s_mateo'] }, ADMIN);
    await check('assignments', 'createPracticeAssignment', { title: 'Sample questions', resourceId: 'res_fldoe_samples', studentIds: ['s_lucia'] }, ADMIN);
    await check('assignments', 'saveAnswerDraft', { submissionId: 'sb_jordan_m1', answers: [{ number: 1, value: 'A' }] }, 'u_keisha');
    const key = await db.bookItem.findMany({ where: { bookId: 'book_g3', test: 'M1' }, orderBy: { number: 'asc' } });
    await check('assignments', 'submitAnswerSheet', { submissionId: 'sb_jordan_m1', answers: key.filter((k) => k.format !== 'OPEN').map((k) => ({ number: k.number, value: k.answer })), photos: [] }, 'u_keisha');
    const pending = ((await db.submission.findUniqueOrThrow({ where: { id: 'sb_arjun_t1' } })).answers as { number: number; correct: boolean | null }[]).filter((a) => a.correct === null);
    await check('assignments', 'gradeSubmission', { submissionId: 'sb_arjun_t1', results: pending.map((p) => ({ number: p.number, correct: true })), feedback: 'Nice' }, ADMIN);
    await check('assignments', 'returnSubmission', { submissionId: 'sb_chidi_t1', feedback: 'Redo #19' }, ADMIN);
    await check('assignments', 'markPracticeDone', { submissionId: 'sb_noah_fldoe' }, 'u_grace');
    await check('books', 'addRedo', { studentId: 's_lucia', test: 'T1', numbers: [2] }, ADMIN);
    const mc = await db.bookItem.findFirstOrThrow({ where: { bookId: 'book_g5', test: 'T1', format: 'MC' }, orderBy: { number: 'asc' } });
    await check('books', 'saveAnswerKey', { bookId: 'book_g5', test: 'T1', rows: [{ number: mc.number, format: 'MC', answer: mc.answer, benchmarkCode: mc.benchmarkCode }] }, ADMIN);
  });

  it('reports, messages, invites, content, skills, notifications', async () => {
    await check('reports', 'createDraft', { studentId: 's_eli' }, ADMIN);
    await check('reports', 'updateReport', { reportId: 'rep_eli_1', summary: 'Eli is improving.' }, ADMIN);
    await check('reports', 'setRatings', { reportId: 'rep_eli_1', ratings: [{ skillId: 'sk_fractions', rating: 3 }, { skillId: 'sk_mult_div', rating: 2, comment: 'Getting there' }] }, ADMIN);
    await check('reports', 'publishReport', { reportId: 'rep_eli_1' }, ADMIN);
    await check('messages', 'sendMessage', { body: 'Thank you!' }, 'u_ana');
    await check('messages', 'sendMessage', { conversationId: 'conv_ana', body: 'You’re welcome' }, ADMIN);
    await check('messages', 'markThreadRead', { conversationId: 'conv_ana' }, ADMIN);
    await check('invites', 'createInvite', { parentName: 'New Family', plannedStudents: [{ firstName: 'Kai', lastName: 'Lee', grade: 4 }] }, ADMIN);
    await check('invites', 'revokeInvite', { inviteId: 'inv_sam' }, ADMIN);
    await check('invites', 'restoreInvite', { inviteId: 'inv_sam' }, ADMIN);
    await check('invites', 'regenerateInvite', { inviteId: 'inv_sam' }, ADMIN);
    await check('invites', 'redeemInvite', { code: 'MM-9RT2' }, 'u_lena');
    await check('content', 'createResource', { title: 'Bring your book', kind: 'NOTE', body: { text: 'Bring it!' } }, ADMIN);
    await check('content', 'updateResource', { resourceId: 'res_mult', title: 'Multiplication facts', studentIds: ['s_eli', 's_noah'] }, ADMIN);
    await check('content', 'setSharing',{ resourceId: 'res_mult', visibility: 'SELECTED', studentIds: ['s_eli'] }, ADMIN);
    await check('content', 'setPublishStatus', { resourceId: 'res_ratio_intro', status: 'PUBLISHED' }, ADMIN);
    await check('content', 'deleteResource', { resourceId: 'res_counting' }, ADMIN);
    await check('content', 'restoreResource', { resourceId: 'res_counting' }, ADMIN);
    await check('taxonomy', 'upsertSkill', { name: 'Telling time', strand: 'M', gradeMin: 1, gradeMax: 3 }, ADMIN);
    await check('taxonomy', 'archiveSkill', { skillId: 'sk_counting' }, ADMIN);
    await check('taxonomy', 'archiveSkill', { skillId: 'sk_counting', archived: false }, ADMIN);
    await check('notifications', 'markRead', { notificationId: 'n9' }, 'u_monique');
    await check('notifications', 'markAllRead', {}, 'u_monique');
    await check('notifications', 'runDailyReminders', {}, ADMIN);
  });

  it('AI drafts (Claude stubbed)', async () => {
    // The mock's stand-in reads the words; the stub always answers T1 #2 to redo, so the recap says so.
    const note = await check('ai', 'draftSessionNote', { sessionId: 'ses_15', transcript: 'Noah did great with fractions today. He missed number 2 on test 1.' }, ADMIN);
    const mockDrafts = (getDb() as unknown as { aiDrafts: { id: string }[] }).aiDrafts;
    await check('ai', 'discardDraft', { draftId: mockDrafts[mockDrafts.length - 1].id }, ADMIN, { draftId: (note as { data: { draftId: string } }).data.draftId });
    await check('ai', 'readAnswerKeyPage', { bookId: 'book_g5', test: 'T4', fromNumber: 1, photoName: 'page.jpg', image: { mediaType: 'image/jpeg', base64: 'A'.repeat(400) } }, ADMIN);
  });

  it('prints what the real backend adds (informational)', () => {
    if (extras.size) console.info(`Fields only the real backend returns (${extras.size}):\n  ${[...extras].sort().join('\n  ')}`);
    if (report.length) console.info(report.join('\n'));
  });
});

/* ── 4. the live adapter's list of reads matches the mock ── */

import { readFileSync } from 'node:fs';

/** Plain functions in the mock that change data: the adapter treats them as writes. */
const NOT_READS: Record<string, string> = {
  'notifications.runDailyReminders': 'It sends reminders (a write). No screen calls it; the daily cron does.',
};

describe('live adapter (src/ui/api/live.js)', () => {
  it('never lists a write as a read', () => {
    const src = readFileSync('src/ui/api/live.js', 'utf8');
    const listed = Function(`return ${src.slice(src.indexOf('export const READS = ') + 'export const READS = '.length, src.indexOf('};', src.indexOf('export const READS')) + 1)}`)() as Record<string, string[]>;
    for (const key of Object.keys(NOT_READS)) {
      const [ns, fn] = key.split('.');
      expect(listed[ns], key).not.toContain(fn);
    }
  });

  it('treats exactly the mock’s reads as reads', async () => {
    // A read in the mock is `export async function x`; a write is `export const x = action(`.
    const src = readFileSync('src/ui/api/live.js', 'utf8');
    const listed = Function(`return ${src.slice(src.indexOf('export const READS = ') + 'export const READS = '.length, src.indexOf('};', src.indexOf('export const READS')) + 1)}`)() as Record<string, string[]>;
    for (const ns of Object.keys(MODULES)) {
      const mock = readFileSync(`tests/contract/mock/server/${ns}.js`, 'utf8');
      const reads = [...mock.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]).filter((n) => !HELPERS.has(n) && !NOT_READS[`${ns}.${n}`]);
      expect(listed[ns]?.slice().sort(), ns).toEqual(reads.sort());
    }
  });
});
