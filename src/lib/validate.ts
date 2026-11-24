import { z } from 'zod';
import { ApiError } from './result';

/**
 * Input validation. Every server function is a public endpoint, so its input is
 * parsed before anything else. The first problem becomes the user-facing message.
 */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) {
    const issue = r.error.issues[0];
    if (issue?.code === 'unrecognized_keys') throw new ApiError('INVALID', 'You can’t change that');
    const custom = issue && issue.code === 'custom' ? issue.message : undefined;
    throw new ApiError('INVALID', custom ?? (issue?.message && !issue.message.startsWith('Invalid') ? issue.message : 'Check the details and try again.'));
  }
  return r.data;
}

export const id = z.string().trim().min(1, 'Something’s missing').max(64);
export const ids = z.array(id).max(500);
export const text = (max = 2000) => z.string().trim().max(max, `Keep it under ${max} characters`);
export const optText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters`)
    .nullish()
    .transform((v) => (v ? v : null));
export const int = z.number().int();
export const grade = z.number().int().min(0, 'Grade must be K–6').max(6, 'Grade must be K–6');

/** An instant: ISO string (or Date) → Date. */
export const instant = z
  .union([z.string().min(1), z.date()])
  .transform((v) => new Date(v))
  .refine((d) => !Number.isNaN(d.getTime()), 'Choose a valid date and time');

export const httpsUrl = z.string().trim().regex(/^https:\/\/\S+$/, 'The link should start with https://').max(500);
export const testKey = z.string().regex(/^(M[1-9]|T[1-9])$/, 'Choose a test');
export const mode = z.enum(['IN_PERSON', 'VIDEO'], 'Choose in person or video call');
