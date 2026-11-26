'use server';
/**
 * server/ai — "Talk about it" (session notes) and "Set up from photos" (answer keys).
 * Nothing is saved from a draft: Vienne's "Use this" calls scheduling.completeSession
 * or books.saveAnswerKey with the draft id, which marks the AiDraft ACCEPTED.
 * Photos are sent once and never stored.
 */
import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/guards';
import { z } from 'zod';
import { action, ApiError, found, need } from '@/lib/result';
import { id, parse, testKey } from '@/lib/validate';
import { testsOf } from '@/lib/dto';
import { codesForGrade } from '@/lib/best';
import { AI_DAILY_LIMIT, ANSWER_PAGE_SCHEMA, answerPageSystem, EFFORT, MODEL, SESSION_NOTE_SCHEMA, sessionNoteSystem, sessionNoteUser } from '@/lib/ai/prompts';

let client: Anthropic | undefined;
const anthropic = () => (client ??= new Anthropic()); // reads ANTHROPIC_API_KEY on first use

/**
 * Cost guard. Each call costs well under a cent (Haiku 5.5, small prompts, max_tokens capped),
 * but a stuck button or a bug shouldn't be able to run up a bill. Set a monthly spend limit
 * in the Claude Console as well.
 */
async function withinDailyLimit() {
  const since = new Date(Date.now() - 86400000);
  need((await db.aiDraft.count({ where: { createdAt: { gte: since } } })) < AI_DAILY_LIMIT, 'That’s the most drafts for today. Type it in for now, or try again tomorrow.', 'LIMIT');
}

const AI_DOWN = 'The AI helper isn’t available right now. Type it in instead, or try again in a minute.';

async function structured<T>(system: string, content: Anthropic.MessageParam['content'], schema: Record<string, unknown>): Promise<T> {
  await withinDailyLimit();
  need(process.env.ANTHROPIC_API_KEY, AI_DOWN, 'AI_FAILED');
  let res: Anthropic.Message;
  try {
    res = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 4000, // includes thinking at high effort; caps the cost of one call at $0.002 of output
      output_config: { effort: EFFORT, format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content }],
    });
  } catch (e) {
    console.error('anthropic', (e as Error).message);
    throw new ApiError('AI_FAILED', AI_DOWN);
  }
  if (res.stop_reason === 'refusal') throw new ApiError('AI_FAILED', 'The AI helper couldn’t do this one. Type it in instead.');
  if (res.stop_reason === 'max_tokens') throw new ApiError('AI_FAILED', 'That was too long for the AI helper. Try a shorter recap, or one page at a time.');
  const text = res.content.find((b) => b.type === 'text');
  need(text && text.type === 'text', 'The draft came back empty. Try again.', 'AI_FAILED');
  try {
    return JSON.parse(text.text) as T;
  } catch {
    throw new ApiError('AI_FAILED', 'The draft came back garbled. Try again.');
  }
}

type NoteOut = { note: string; homework: string | null; skills: { skillId: string; rating: number | null }[]; redo: { test: string; number: number }[]; unsure: string[] };

/** A. Draft a session note from what Vienne said (text from the device's dictation). */
export const draftSessionNote = action(async (input: { sessionId: string; transcript: string }) => {
  await requireAdmin();
  const { sessionId, transcript } = parse(z.object({ sessionId: id, transcript: z.string().trim().min(9, 'Say a little more about the session').max(8000, 'That recap is too long. Keep it to a few minutes.') }), input);
  const session = found(await db.session.findUnique({ where: { id: sessionId }, include: { student: true } }), 'Session');
  const { student } = session;
  const skills = await db.skill.findMany({ where: { archivedAt: null, gradeMin: { lte: student.grade }, gradeMax: { gte: student.grade } } });
  const book = await db.book.findUnique({ where: { grade: student.grade }, include: { items: { select: { id: true, test: true, number: true } } } });
  const tests = (book?.tests as { key: string; name: string }[] | undefined) ?? [];
  const bookMap = tests.map((t) => ({ test: t.key, name: t.name, numbers: book!.items.filter((i) => i.test === t.key).map((i) => i.number) }));

  const out = await structured<NoteOut>(
    sessionNoteSystem(),
    sessionNoteUser({ student, sessionDate: session.startsAt.toISOString(), skills, bookMap, transcript }),
    SESSION_NOTE_SCHEMA as unknown as Record<string, unknown>,
  );

  // Keep only what exists in her data.
  const validSkills = out.skills.filter((x) => skills.some((k) => k.id === x.skillId)).map((x) => ({ ...x, rating: x.rating && x.rating >= 1 && x.rating <= 4 ? x.rating : null }));
  const redo = out.redo
    .map((r) => ({ ...r, item: book?.items.find((i) => i.test === r.test && i.number === r.number) }))
    .filter((r) => r.item)
    .map((r) => ({ test: r.test, number: r.number, bookItemId: r.item!.id, testName: tests.find((t) => t.key === r.test)?.name ?? r.test }));
  const dropped = out.redo.length - redo.length;
  const unsure = [...out.unsure, ...(dropped ? [dropped === 1 ? '1 question number wasn’t in the answer key' : `${dropped} question numbers weren’t in the answer key`] : [])];

  const draft = await db.aiDraft.create({
    data: { kind: 'SESSION_NOTE', model: MODEL, effort: EFFORT, refId: sessionId, input: { transcript }, output: { ...out, skills: validSkills, redo, unsure } },
  });
  return { draftId: draft.id, note: out.note, homework: out.homework, skills: validSkills.map((x) => ({ ...x, name: skills.find((k) => k.id === x.skillId)!.name })), redo, unsure };
});

type PageOut = { test: string; items: { number: number; answer: string | null; format: 'MC' | 'MULTI' | 'NUMERIC' | 'OPEN'; benchmarkCode: string | null; confident: boolean }[] };

/** B. Read one photographed answer-key page. The image is not stored. */
export const readAnswerKeyPage = action(async (input: { bookId: string; test: string; fromNumber?: number; image: { mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; base64: string } }) => {
  await requireAdmin();
  const { bookId, test, fromNumber, image } = parse(
    z.object({
      bookId: id,
      test: testKey,
      fromNumber: z.number().int().min(1).default(1),
      image: z.object(
        { mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp'], 'Use a JPG, PNG or WebP photo'), base64: z.string().min(100, 'Take or choose a photo of the page').max(5_000_000, 'Use a smaller photo').regex(/^[A-Za-z0-9+/=]+$/, 'That photo didn’t come through. Try again.') },
        'Take or choose a photo of the page',
      ),
    }),
    input,
  );
  const book = found(await db.book.findUnique({ where: { id: bookId } }), 'Book');
  const t = found(testsOf(book).find((x) => x.key === test), 'Test');
  const codes = codesForGrade(book.grade);

  const out = await structured<PageOut>(
    answerPageSystem(),
    [
      { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
      { type: 'text', text: JSON.stringify({ test: t.name, expectedFrom: fromNumber, expectedTo: t.count, allowedCodes: codes }) },
    ],
    ANSWER_PAGE_SCHEMA as unknown as Record<string, unknown>,
  );

  const items = out.items
    .filter((it) => Number.isInteger(it.number) && it.number >= 1 && it.number <= t.count)
    .map((it) => ({ ...it, benchmarkCode: it.benchmarkCode && codes.includes(it.benchmarkCode) ? it.benchmarkCode : null }));
  const draft = await db.aiDraft.create({
    data: { kind: 'BOOK_PAGE', model: MODEL, effort: EFFORT, refId: `${bookId}:${test}`, input: { photoDeletedAt: new Date().toISOString() }, output: { test, items } },
  });
  const nums = items.map((i) => i.number);
  return { draftId: draft.id, test, from: nums.length ? Math.min(...nums) : fromNumber, to: nums.length ? Math.max(...nums) : fromNumber, expected: t.count, items };
});

export const discardDraft = action(async (input: { draftId: string }) => {
  await requireAdmin();
  const { draftId } = parse(z.object({ draftId: id }), input);
  await db.aiDraft.updateMany({ where: { id: draftId, status: 'DRAFT' }, data: { status: 'DISCARDED', decidedAt: new Date() } });
  // The draft as it now stands, like the mock (a missing id stays a quiet no-op). Vienne-only data.
  return db.aiDraft.findUnique({ where: { id: draftId }, select: { id: true, kind: true, model: true, effort: true, refId: true, status: true, input: true, output: true, createdAt: true, decidedAt: true } });
});
