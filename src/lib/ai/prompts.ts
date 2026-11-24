/**
 * The two AI features' prompts and JSON schemas (ADDITIONS.md §4b). Shared with the
 * prototype (src/mock/server/ai.js). Model: Claude Haiku 5.5 at high effort,
 * with structured outputs so the server can check every field.
 */
export const MODEL = 'claude-haiku-5-5';
export const EFFORT = 'high' as const;
/** Drafts allowed per 24 hours (both features together). A busy day is ~20 notes plus a book's answer pages. */
export const AI_DAILY_LIMIT = 150;

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
} as const;

export const sessionNoteSystem = () =>
  [
    'You turn a math tutor’s spoken recap into a short session note for the student’s parent.',
    'Write 2–4 plain, warm sentences in the tutor’s own voice (first person). No jargon, no emoji, no headings.',
    'Only use skills from the provided list (by skillId). Only use book questions that exist in the provided book map.',
    'If she mentions homework, put it in "homework"; otherwise null.',
    'Ratings are 1–4 (1 beginning, 2 developing, 3 proficient, 4 mastered) and only when she clearly says how it went; otherwise null.',
    'Put anything you could not match (a question number not in the map, an unclear skill) in "unsure" instead of guessing.',
  ].join('\n');

export const sessionNoteUser = ({ student, sessionDate, skills, bookMap, transcript }: { student: { firstName: string; grade: number }; sessionDate: string; skills: { id: string; name: string }[]; bookMap: { test: string; name: string; numbers: number[] }[]; transcript: string }) =>
  JSON.stringify({ student: { firstName: student.firstName, grade: student.grade }, sessionDate, skills: skills.map((k) => ({ skillId: k.id, name: k.name })), bookMap, transcript });

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
} as const;

export const answerPageSystem = () =>
  [
    'You read one photographed answer-key page from a printed math test-prep book.',
    'Return every question number on the page with its answer exactly as printed.',
    'format: MC (one letter A–D), MULTI (several letters), NUMERIC (a number or fraction), OPEN (shown work, no single answer).',
    'benchmarkCode: only if the page prints a standard code, or if a question page is also provided; it must be one of the allowed codes, otherwise null.',
    'Set confident to false whenever the print is blurry, cut off, or you are not sure. Never guess an answer: use null.',
    'Do not copy or describe question text. Return only numbers, answers, formats and codes.',
  ].join('\n');

