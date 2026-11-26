/**
 * server/ai — the only two AI features (ADDITIONS.md §4b):
 *   A. draftSessionNote   Vienne talks after a session; Claude writes the note.
 *   B. readAnswerKeyPage  Vienne photographs an answer-key page; Claude reads it.
 *
 * Production: Claude Haiku 5.5 (`claude-haiku-5-5`), `output_config.effort: "high"`,
 * structured outputs (`output_config.format: json_schema`). The prompts and schemas
 * below are the real ones; the prototype fakes the model call locally so the demo
 * runs offline. Nothing is saved until Vienne taps "Use this" (the save actions in
 * scheduling.completeSession and books.saveAnswerKey mark the draft ACCEPTED).
 */
import { action, commit, getDb, need, newId, nowIso, requireAdmin } from '../core';
import { codesForGrade } from '../best';

export const MODEL = 'claude-haiku-5-5';
export const EFFORT = 'high';

/* ── A. Session note ───────────────────────────────────────── */
export const SESSION_NOTE_SCHEMA = {
  type: 'object',
  properties: {
    note: { type: 'string', description: 'The session note, 2–4 plain sentences, in Vienne’s voice, for the parent to read.' },
    homework: { type: ['string', 'null'] },
    skills: { type: 'array', items: { type: 'object', properties: { skillId: { type: 'string' }, rating: { type: ['integer', 'null'] } }, required: ['skillId', 'rating'], additionalProperties: false } },
    redo: { type: 'array', items: { type: 'object', properties: { test: { type: 'string' }, number: { type: 'integer' } }, required: ['test', 'number'], additionalProperties: false } },
    unsure: { type: 'array', items: { type: 'string' }, description: 'Anything said that could not be matched, in plain words.' },
  },
  required: ['note', 'homework', 'skills', 'redo', 'unsure'],
  additionalProperties: false,
};

export const sessionNoteSystem = () =>
  [
    'You turn a math tutor’s spoken recap into a short session note for the student’s parent.',
    'Write 2–4 plain, warm sentences in the tutor’s own voice (first person). No jargon, no emoji, no headings.',
    'Only use skills from the provided list (by skillId). Only use book questions that exist in the provided book map.',
    'If she mentions homework, put it in "homework"; otherwise null.',
    'Ratings are 1–4 (1 beginning, 2 developing, 3 proficient, 4 mastered) and only when she clearly says how it went; otherwise null.',
    'Put anything you could not match (a question number not in the map, an unclear skill) in "unsure" instead of guessing.',
  ].join('\n');

export const sessionNoteUser = ({ student, sessionDate, skills, bookMap, transcript }) =>
  JSON.stringify({ student: { firstName: student.firstName, grade: student.grade }, sessionDate, skills: skills.map((k) => ({ skillId: k.id, name: k.name })), bookMap, transcript });

/* ── B. Answer-key page ────────────────────────────────────── */
export const ANSWER_PAGE_SCHEMA = {
  type: 'object',
  properties: {
    test: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'integer' },
          answer: { type: ['string', 'null'] },
          format: { type: 'string', enum: ['MC', 'MULTI', 'NUMERIC', 'OPEN'] },
          benchmarkCode: { type: ['string', 'null'] },
          confident: { type: 'boolean' },
        },
        required: ['number', 'answer', 'format', 'benchmarkCode', 'confident'],
        additionalProperties: false,
      },
    },
  },
  required: ['test', 'items'],
  additionalProperties: false,
};

export const answerPageSystem = () =>
  [
    'You read one photographed answer-key page from a printed math test-prep book.',
    'Return every question number on the page with its answer exactly as printed.',
    'format: MC (one letter A–D), MULTI (several letters), NUMERIC (a number or fraction), OPEN (shown work, no single answer).',
    'benchmarkCode: only if the page prints a standard code, or if a question page is also provided; it must be one of the allowed codes, otherwise null.',
    'Set confident to false whenever the print is blurry, cut off, or you are not sure. Never guess an answer: use null.',
    'Do not copy or describe question text. Return only numbers, answers, formats and codes.',
  ].join('\n');

/* ── Prototype stand-ins for the model call ────────────────── */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sentence = (s) => {
  const t = s.trim().replace(/\s+/g, ' ');
  return t ? t[0].toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.') : '';
};
const KEYWORDS = {
  sk_fractions: ['fraction', 'numerator', 'denominator'],
  sk_decimals: ['decimal', 'tenths', 'hundredths'],
  sk_mult_div: ['multipl', 'divid', 'division', 'times table', 'facts'],
  sk_place_value: ['place value', 'tens and ones', 'rounding'],
  sk_add_sub: ['add', 'subtract', 'regroup', 'borrow', 'carry'],
  sk_word_problems: ['word problem', 'story problem'],
  sk_geometry: ['area', 'perimeter', 'shape', 'angle', 'volume'],
  sk_measurement: ['time', 'clock', 'measure', 'money', 'inch'],
  sk_data: ['graph', 'chart', 'data', 'line plot'],
  sk_ratios: ['ratio', 'rate', 'unit price'],
  sk_integers: ['integer', 'negative', 'exponent'],
  sk_patterns: ['pattern', 'equation', 'expression'],
};
const TEST_WORDS = { 'mini test 1': 'M1', 'mini-test 1': 'M1', 'mini test 2': 'M2', 'mini-test 2': 'M2', 'test 1': 'T1', 'test 2': 'T2', 'test 3': 'T3', 'test 4': 'T4' };

function fakeSessionNote({ student, skills, bookMap, transcript, lastTest }) {
  const text = transcript.toLowerCase();
  const found = skills.filter((k) => (KEYWORDS[k.id] || []).some((w) => text.includes(w)));
  const tested = Object.entries(TEST_WORDS).find(([w]) => text.includes(w))?.[1] ?? lastTest;
  const numbers = [...transcript.matchAll(/(?:#|number|numbers|question|questions|and)\s*(\d{1,2})/gi)].map((m) => Number(m[1]));
  const redo = [];
  const unsure = [];
  if (/missed|redo|wrong|again/.test(text)) {
    numbers.forEach((n) => (bookMap.some((b) => b.test === tested && b.numbers.includes(n)) ? redo.push({ test: tested, number: n }) : unsure.push(`#${n} isn’t in the answer key for ${tested || 'that test'} yet`)));
  }
  const parts = transcript.split(/(?<=[.!?])\s+|\s+(?:then|and then|also)\s+/i).map(sentence).filter(Boolean);
  const hw = transcript.match(/homework (?:is |was )?(.+?)(?:[.!?]|$)/i)?.[1];
  const good = /(great|well|really good|nailed|confident)/.test(text);
  return {
    note: parts.filter((p) => !/homework/i.test(p)).slice(0, 4).join(' ').replace(/\b(she|he) /i, `${student.firstName} `) || `${student.firstName} worked hard today.`,
    homework: hw ? sentence(hw) : null,
    skills: found.map((k) => ({ skillId: k.id, rating: good ? 3 : null })),
    redo,
    unsure: found.length ? unsure : [...unsure, 'Which skill did you work on? I couldn’t tell from what you said.'],
  };
}

/** A. Draft a session note from what Vienne said. */
export const draftSessionNote = action(async ({ sessionId, transcript }) => {
  requireAdmin();
  need(transcript?.trim().length > 8, 'Say a little more about the session');
  const db = getDb();
  const session = db.sessions.find((s) => s.id === sessionId);
  need(session, 'Session not found');
  const student = db.students.find((s) => s.id === session.studentId);
  const skills = db.skills.filter((k) => !k.archivedAt && student.grade >= k.gradeMin && student.grade <= k.gradeMax);
  const book = db.books.find((b) => b.grade === student.grade);
  const bookMap = book ? book.tests.map((t) => ({ test: t.key, name: t.name, numbers: db.bookItems.filter((i) => i.bookId === book.id && i.test === t.key).map((i) => i.number) })) : [];
  const lastSub = db.submissions.filter((s) => s.studentId === student.id && s.submittedAt).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
  const lastTest = lastSub && db.assignments.find((a) => a.id === lastSub.assignmentId)?.bookTest;

  // Production: anthropic.messages.create({ model: MODEL, max_tokens: 2000, output_config: { effort: EFFORT,
  //   format: { type: 'json_schema', schema: SESSION_NOTE_SCHEMA } }, system: sessionNoteSystem(),
  //   messages: [{ role: 'user', content: sessionNoteUser({ student, sessionDate: session.startsAt, skills, bookMap, transcript }) }] })
  await wait(1100);
  const out = fakeSessionNote({ student, skills, bookMap, transcript, lastTest });

  // Server-side checks: drop anything that doesn't exist in her data.
  const validSkills = out.skills.filter((x) => skills.some((k) => k.id === x.skillId));
  const redo = out.redo
    .map((x) => ({ ...x, item: book && db.bookItems.find((i) => i.bookId === book.id && i.test === x.test && i.number === x.number) }))
    .filter((x) => x.item)
    .map((x) => ({ test: x.test, number: x.number, bookItemId: x.item.id, testName: book.tests.find((t) => t.key === x.test).name }));
  return commit((d) => {
    const row = { id: newId('ai'), kind: 'SESSION_NOTE', model: MODEL, effort: EFFORT, refId: sessionId, status: 'DRAFT', input: { transcript }, output: { ...out, skills: validSkills, redo }, createdAt: nowIso(), decidedAt: null };
    d.aiDrafts.push(row);
    return { draftId: row.id, ...row.output, skills: validSkills.map((x) => ({ ...x, name: skills.find((k) => k.id === x.skillId).name })) };
  });
});

/**
 * B. Read one photographed answer-key page. The photo is sent once and then
 * deleted; only the returned rows are kept, and only after Vienne saves them.
 */
export const readAnswerKeyPage = action(async ({ bookId, test, fromNumber = 1, photoName }) => {
  requireAdmin();
  const db = getDb();
  const book = db.books.find((b) => b.id === bookId);
  need(book, 'Book not found');
  const t = book.tests.find((x) => x.key === test);
  need(t, 'Test not found');
  need(photoName, 'Take or choose a photo of the page');
  const codes = codesForGrade(book.grade);

  // Production: messages.create({ model: MODEL, output_config: { effort: EFFORT, format: { type: 'json_schema', schema: ANSWER_PAGE_SCHEMA } },
  //   system: answerPageSystem(), messages: [{ role: 'user', content: [
  //     { type: 'image', source: { type: 'base64', media_type, data } },
  //     { type: 'text', text: JSON.stringify({ test: t.name, expectedNumbers: [from, to], allowedCodes: codes }) } ] }] })
  // then delete the uploaded photo.
  await wait(1500);
  const perPage = 20;
  const to = Math.min(t.count, fromNumber + perPage - 1);
  const items = [];
  for (let number = fromNumber; number <= to; number += 1) {
    const roll = (number * 37 + test.length * 11) % 100;
    const format = number % 13 === 0 ? 'OPEN' : roll < 72 ? 'MC' : roll < 84 ? 'MULTI' : 'NUMERIC';
    const answer = format === 'OPEN' ? null : format === 'MC' ? 'ABCD'[roll % 4] : format === 'MULTI' ? ['A,C', 'B,D', 'A,B,E'][roll % 3] : ['3/4', '12', '0.6', '48'][roll % 4];
    const confident = !(number % 9 === 4);
    items.push({ number, format, answer: confident ? answer : null, benchmarkCode: codes[(number * 7 + test.length) % codes.length] ?? null, confident });
  }
  return commit((d) => {
    const row = { id: newId('ai'), kind: 'BOOK_PAGE', model: MODEL, effort: EFFORT, refId: `${bookId}:${test}`, status: 'DRAFT', input: { photoName, photoDeletedAt: nowIso() }, output: { test, items }, createdAt: nowIso(), decidedAt: null };
    d.aiDrafts.push(row);
    return { draftId: row.id, test, from: fromNumber, to, expected: t.count, items };
  });
});

/** Vienne tapped "No thanks". */
export const discardDraft = action(async ({ draftId }) => {
  requireAdmin();
  return commit((db) => Object.assign(db.aiDrafts.find((x) => x.id === draftId) ?? {}, { status: 'DISCARDED', decidedAt: nowIso() }));
});
