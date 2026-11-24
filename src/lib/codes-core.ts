import { createHash, randomInt } from 'node:crypto';

/**
 * Invite codes look like MM-4D8F. Only a peppered SHA-256 is stored, plus a 2-character
 * hint. Shared by the server (lib/codes.ts) and the seed, so both hash identically.
 */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I
export const makeCode = () => `MM-${Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')}`;
export const hashCode = (code: string) => createHash('sha256').update(`${code.trim().toUpperCase()}:${process.env.INVITE_PEPPER ?? ''}`).digest('hex');
export const codeHint = (code: string) => `MM-••${code.trim().toUpperCase().slice(-2)}`;
