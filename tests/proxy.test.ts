import { describe, expect, it } from 'vitest';
import { config } from '@/proxy';

const PAGE_MATCHER = config.matcher[0];

/** The sign-in redirect must cover every page and no API route (the cron and Blob can't sign in). */
const matches = (path: string) => new RegExp(`^${PAGE_MATCHER.replace('/((?!', '/(?!').replace(').*)', ').*')}$`).test(path);

describe('which requests the sign-in guard sees', () => {
  it('every page', () => {
    for (const p of ['/', '/sign-in', '/admin/today', '/admin/families/u_ana', '/parent/home', '/parent/learning/sb_x']) expect(matches(p), p).toBe(true);
  });
  it('no API route, PWA file or static asset', () => {
    for (const p of ['/api/cron/daily', '/api/files/abc', '/api/files/blob', '/api/files/upload/abc', '/api/auth/session', '/sw.js', '/manifest.webmanifest', '/icons/icon-192.png', '/_next/static/x.js', '/favicon.ico'])
      expect(matches(p), p).toBe(false);
  });
});
