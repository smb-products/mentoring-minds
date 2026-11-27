/** What a parent reads when Google sign-in comes back with ?error= (Auth.js error codes). */
const ERRORS: Record<string, string> = {
  AccessDenied: 'Google hasn’t confirmed that email address yet. Confirm it with Google, or use email and password.',
  OAuthAccountNotLinked: 'That email already signs in another way. Use your email and password, or ask Vienne.',
  Configuration: 'Google sign-in isn’t working right now. Use your email and password, or try again later.',
};

export const GENERIC_PROBLEM = 'Signing in didn’t work. Please try again.';

/**
 * The message for an ?error= code: its own text for a code we know, the generic one for anything else.
 * Only own keys count, so names a plain object inherits (constructor, toString, __proto__…) get the generic text.
 */
export function signInProblem(error: string | string[] | undefined): string | undefined {
  const code = typeof error === 'string' ? error : undefined;
  if (!code) return undefined;
  return Object.hasOwn(ERRORS, code) ? ERRORS[code] : GENERIC_PROBLEM;
}
