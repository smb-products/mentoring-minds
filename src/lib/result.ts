/**
 * Every server function resolves to a Result instead of throwing.
 *
 * Why reads return a Result too (the mock's reads throw): in production Next.js
 * replaces the message of an error thrown from a server function with a generic
 * one, so a thrown "That student isn’t on your account." would never reach the
 * screen. The live adapter (docs/WIRING.md) unwraps reads, so the screens behave
 * exactly as they do on the mock.
 *
 * Results are also converted to plain JSON shapes (Dates → ISO strings), because
 * that's what the screens get from the mock (docs/CONTRACT.md).
 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

/** Error codes the screens may branch on. */
export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'NOT_ACTIVE'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID'
  | 'INVALID_CODE'
  | 'LOCKED'
  | 'SLOT_TAKEN'
  | 'PAST_CUTOFF'
  | 'NO_KEY'
  | 'LIMIT'
  | 'AI_FAILED'
  | 'SERVER';

export class ApiError extends Error {
  constructor(
    public code: ErrorCode | string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Throws a user-facing error when `cond` is falsy. */
export function need(cond: unknown, message: string, code: ErrorCode = 'INVALID'): asserts cond {
  if (!cond) throw new ApiError(code, message);
}

/** Throws NOT_FOUND when `value` is null/undefined, otherwise returns it. */
export function found<T>(value: T | null | undefined, what: string): T {
  if (value == null) throw new ApiError('NOT_FOUND', `${what} not found`);
  return value;
}

/** Deep-converts Dates to ISO strings, so results match the mock (and JSON). */
export type Wire<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Wire<U>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;

export function toWire<T>(value: T): Wire<T> {
  if (value instanceof Date) return value.toISOString() as Wire<T>;
  if (Array.isArray(value)) return value.map(toWire) as Wire<T>;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = toWire(v);
    return out as Wire<T>;
  }
  return value as Wire<T>;
}

function fail(e: unknown): { ok: false; error: string; code: string } {
  if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
  console.error(e);
  return { ok: false, error: 'Something went wrong. Please try again.', code: 'SERVER' };
}

/**
 * Wraps a server function (read or write): ApiErrors become { ok: false } with the
 * plain-language message; anything else is logged and reported generically.
 */
export function action<I, O>(fn: (input: I) => Promise<O>) {
  // Functions whose input is optional can be called with no argument: listFamilies().
  type Args = undefined extends I ? [input?: I] : [input: I];
  return async (...args: Args): Promise<Result<Wire<O>>> => {
    try {
      return { ok: true, data: toWire(await fn(args[0] as I)) };
    } catch (e) {
      return fail(e);
    }
  };
}

/** Same as action(); a separate name so reads and writes are easy to tell apart. */
export const query = action;
