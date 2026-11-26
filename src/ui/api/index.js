import { api as mock } from '../../mock';
import { live } from './live';

/** Areas running on the real backend. Uncomment your ticket's lines, test, commit. */
const LIVE = new Set([
  // W0
  'dashboard',
  // W1
  'taxonomy',
  'fast',
  // W2
  // 'families',
  // 'invites',
  // W3
  'messages',
  'notifications',
  // W4
  'books',
  'content',
  // W5
  // 'assignments',
  // W6
  // 'scheduling',
  // W7
  // 'reports',
  // 'ai',
]);

export const api = Object.fromEntries(Object.entries(mock).map(([k, v]) => [k, LIVE.has(k) ? live[k] : v]));
export { useQuery, useAction } from './live-hooks';
export { auth, setSessionUser } from '../../mock';
