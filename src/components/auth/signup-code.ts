/**
 * J2: the invite code typed at sign-up (SignInForm), kept in this tab until the new account is signed in.
 * createAccount takes no code (S36): the Add your child step redeems it with redeemInvite, so a code keeps its own
 * limits and messages. Its own module, so the sign-in page doesn't load the app's data layer.
 */
export const SIGNUP_CODE_KEY = 'mm.signup.code';

/** Keeps `code` for the step, or forgets any kept one (an empty `code`). Storage off: the step's code form still works. */
export function keepSignupCode(code: string) {
  try {
    if (code) sessionStorage.setItem(SIGNUP_CODE_KEY, code);
    else sessionStorage.removeItem(SIGNUP_CODE_KEY);
  } catch {}
}

/** The kept code, once: reading it forgets it. */
export function takeSignupCode(): string | null {
  try {
    const code = sessionStorage.getItem(SIGNUP_CODE_KEY);
    sessionStorage.removeItem(SIGNUP_CODE_KEY);
    return code;
  } catch {
    return null;
  }
}
