/**
 * S31: any ?error= code on /sign-in gets a plain message. A code the screen knows keeps its own text;
 * anything else, including names a plain object inherits, gets the generic sign-in message (a string,
 * never a function or an object, which would break the page).
 */
import { describe, expect, it } from 'vitest';
import { GENERIC_PROBLEM, signInProblem } from '@/app/(auth)/sign-in/errors';

const INHERITED = ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', 'isPrototypeOf', 'toLocaleString', 'propertyIsEnumerable', '__defineGetter__'];

describe('signInProblem', () => {
  it('keeps the messages for the codes it knows', () => {
    expect(signInProblem('AccessDenied')).toBe('Google hasn’t confirmed that email address yet. Confirm it with Google, or use email and password.');
    expect(signInProblem('OAuthAccountNotLinked')).toBe('That email already signs in another way. Use your email and password, or ask Vienne.');
    expect(signInProblem('Configuration')).toBe('Google sign-in isn’t working right now. Use your email and password, or try again later.');
  });

  it('gives the generic message for an unknown code', () => {
    expect(GENERIC_PROBLEM).toBe('Signing in didn’t work. Please try again.');
    expect(signInProblem('SomethingUnexpected')).toBe(GENERIC_PROBLEM);
    expect(signInProblem('accessdenied')).toBe(GENERIC_PROBLEM);
  });

  it.each(INHERITED)('gives the generic message for the inherited name %s', (code) => {
    expect(signInProblem(code)).toBe(GENERIC_PROBLEM);
  });

  it('shows nothing without a single code', () => {
    expect(signInProblem(undefined)).toBeUndefined();
    expect(signInProblem('')).toBeUndefined();
    expect(signInProblem(['AccessDenied', 'Configuration'])).toBeUndefined();
  });
});
