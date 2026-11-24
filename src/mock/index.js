/**
 * The data contract. Each namespace = one server/ module from the backend plan (§7).
 * PORTING: replace each import with the real module. Reads become direct calls in
 * server components; writes become server actions with the same name + input shape.
 * Writes resolve to { ok: true, data } | { ok: false, error, code }.
 */
import * as families from './server/families';
import * as invites from './server/invites';
import * as taxonomy from './server/taxonomy';
import * as scheduling from './server/scheduling';
import * as content from './server/content';
import * as books from './server/books';
import * as fast from './server/fast';
import * as ai from './server/ai';
import * as assignments from './server/assignments';
import * as reports from './server/reports';
import * as messages from './server/messages';
import * as notifications from './server/notifications';
import * as dashboard from './server/dashboard';

export const api = { families, invites, taxonomy, scheduling, content, books, fast, ai, assignments, reports, messages, notifications, dashboard };

export { useQuery, useAction } from './hooks';
export { auth, setSessionUser } from './core';
