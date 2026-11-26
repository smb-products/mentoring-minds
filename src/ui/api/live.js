'use client';
/**
 * LIVE ADAPTER — written, tested, NOT switched on. (docs/WIRING.md)
 *
 * The same `api` object as the mock, backed by the real server functions:
 *   - reads unwrap their Result and throw on failure, exactly like the mock's reads
 *     (the error carries .code, and its message is the server's plain-language one);
 *   - writes return the Result as-is and tell useQuery to re-run (live-hooks.changed);
 *   - a call that throws (network drop, redeploy under an open tab) fails like any other:
 *     code 'NETWORK' or 'STALE' with a plain message, thrown by reads, returned by writes;
 *   - content.uploadFile({ file }) runs the 3-step upload (src/lib/upload-client.ts).
 *
 * To switch an area over, list it in LIVE in src/ui/api/index.js.
 */
import * as ai from '@/server/ai';
import * as assignments from '@/server/assignments';
import * as books from '@/server/books';
import * as content from '@/server/content';
import * as dashboard from '@/server/dashboard';
import * as families from '@/server/families';
import * as fast from '@/server/fast';
import * as invites from '@/server/invites';
import * as messages from '@/server/messages';
import * as notifications from '@/server/notifications';
import * as reports from '@/server/reports';
import * as scheduling from '@/server/scheduling';
import * as taxonomy from '@/server/taxonomy';
import { uploadFile } from '@/lib/upload-client';
import { changed } from './live-hooks';

/** The mock's reads (plain functions that return data or throw). Everything else is a write. */
export const READS = {
  ai: [],
  assignments: ['listAssignments', 'getAssignment', 'listForStudent', 'gradingQueue'],
  books: ['listBooks', 'getAnswerKey', 'bookForGrade', 'listRedo'],
  content: ['getFileForUser', 'listResources', 'listResourcesForStudent'],
  dashboard: ['getAdminToday', 'getParentOverview'],
  families: ['listFamilies', 'getFamily'],
  fast: ['listResults', 'nextWindow'],
  invites: ['listInvites'],
  messages: ['listThreads', 'getThread', 'unreadCount'],
  notifications: ['listForUser'],
  reports: ['listForStudent', 'getReport'],
  scheduling: ['getSettings', 'getAvailability', 'listTimeOff', 'listLocations', 'getOpenSlots', 'listSessions'],
  taxonomy: ['listSubjects'],
};

const NETWORK = 'We couldn’t reach the server. Check your connection and try again.';
const STALE = 'The app was just updated. Reload the page to keep going.';

/** A server function that threw instead of returning a Result, as a plain Result. */
function thrown(e) {
  const text = `${e?.name ?? ''} ${e?.message ?? ''}`;
  if (/Failed to find Server Action|UnrecognizedActionError|Server Action .* was not found|failed-to-find-server-action/i.test(text)) return { ok: false, error: STALE, code: 'STALE' };
  return { ok: false, error: NETWORK, code: 'NETWORK' };
}

async function call(fn, input) {
  try {
    return await fn(input);
  } catch (e) {
    return thrown(e);
  }
}

function asRead(fn) {
  return async (input) => {
    const r = await call(fn, input);
    if (r.ok) return r.data;
    const error = new Error(r.error);
    error.code = r.code;
    throw error;
  };
}

function asWrite(fn) {
  return async (input) => {
    const r = await call(fn, input);
    if (r.ok) changed();
    return r;
  };
}

function wrap(name, mod) {
  const reads = new Set(READS[name]);
  return Object.fromEntries(Object.entries(mod).filter(([, fn]) => typeof fn === 'function').map(([key, fn]) => [key, reads.has(key) ? asRead(fn) : asWrite(fn)]));
}

export const live = {
  ai: wrap('ai', ai),
  assignments: wrap('assignments', assignments),
  books: wrap('books', books),
  content: {
    ...wrap('content', content),
    /** Same call as the mock's, plus the File itself: upload({ file, filename, mimeType, sizeBytes }).
     *  mimeType stands in when the phone sends a blank file.type.
     *  @param {{ file: File, filename?: string, mimeType?: string, sizeBytes?: number }} input */
    uploadFile: async ({ file, mimeType }) => {
      const r = await call(() => uploadFile(file, mimeType));
      if (r.ok) changed();
      return r;
    },
  },
  dashboard: wrap('dashboard', dashboard),
  families: wrap('families', families),
  fast: wrap('fast', fast),
  invites: wrap('invites', invites),
  messages: wrap('messages', messages),
  notifications: wrap('notifications', notifications),
  reports: wrap('reports', reports),
  scheduling: wrap('scheduling', scheduling),
  taxonomy: wrap('taxonomy', taxonomy),
};
