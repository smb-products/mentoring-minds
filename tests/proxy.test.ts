import { describe, expect, it } from 'vitest';
import { config, redirectFor } from '@/proxy';
import manifest from '@/app/manifest';

const PAGE_MATCHER = config.matcher[0];

/** The sign-in redirect must cover every page and no API route (the cron and Blob can't sign in). */
const matches = (path: string) => new RegExp(`^${PAGE_MATCHER.replace('/((?!', '/(?!').replace(').*)', ').*')}$`).test(path);

describe('which requests the sign-in guard sees', () => {
  it('every page', () => {
    for (const p of ['/', '/sign-in', '/privacy', '/opengraph-image', '/admin/today', '/admin/families/u_ana', '/parent/home', '/parent/learning/sb_x']) expect(matches(p), p).toBe(true);
  });
  it('no API route, PWA file or static asset', () => {
    for (const p of ['/api/cron/daily', '/api/files/abc', '/api/files/blob', '/api/files/upload/abc', '/api/auth/session', '/sw.js', '/manifest.webmanifest', '/icons/icon-192.png', '/_next/static/x.js', '/favicon.ico'])
      expect(matches(p), p).toBe(false);
  });
});

const VIENNE = { role: 'ADMIN' };
const PARENT = { role: 'PARENT' };

describe('where the proxy sends each visitor (L1)', () => {
  it('signed out, / is the landing page and opens', () => {
    expect(redirectFor('/', null)).toBeNull();
    expect(redirectFor('/', undefined)).toBeNull();
  });

  it('signed in, / goes home: Vienne to /admin/today, a parent to /parent/home', () => {
    expect(redirectFor('/', VIENNE)).toBe('/admin/today');
    expect(redirectFor('/', PARENT)).toBe('/parent/home');
  });

  it('/privacy and the Open Graph image open for everyone, signed in or not', () => {
    for (const p of ['/privacy', '/opengraph-image'])
      for (const user of [null, VIENNE, PARENT]) expect(redirectFor(p, user), `${p} ${JSON.stringify(user)}`).toBeNull();
  });

  it('matches whole paths, never a prefix: look-alikes still need a sign-in', () => {
    for (const p of ['/privacyx', '/privacy/anything', '/privacy/', '/opengraph-imagex', '/opengraph-image/x', '/landing', '//', '/index'])
      expect(redirectFor(p, null), p).toBe('/sign-in');
  });

  it('every other page still sends a signed-out visitor to /sign-in', () => {
    for (const p of ['/admin', '/admin/today', '/admin/families/u_ana', '/parent', '/parent/home', '/parent/learning/sb_x', '/does-not-exist'])
      expect(redirectFor(p, null), p).toBe('/sign-in');
  });

  it('sign-in opens signed out, and sends a signed-in visitor home', () => {
    expect(redirectFor('/sign-in', null)).toBeNull();
    expect(redirectFor('/sign-in', VIENNE)).toBe('/admin/today');
    expect(redirectFor('/sign-in', PARENT)).toBe('/parent/home');
  });

  it('a parent can’t open /admin, and Vienne can open her pages and a parent theirs', () => {
    expect(redirectFor('/admin/today', PARENT)).toBe('/parent/home');
    expect(redirectFor('/admin/today', VIENNE)).toBeNull();
    expect(redirectFor('/parent/home', PARENT)).toBeNull();
  });
});

describe('the installed app (manifest)', () => {
  it('opens to sign-in (or home, through the proxy), never the landing page, and its scope stays /', () => {
    const m = manifest();
    expect(m.start_url).toBe('/sign-in');
    expect(m.scope).toBe('/');
    expect(redirectFor(m.start_url!, null)).toBeNull();
    expect(redirectFor(m.start_url!, PARENT)).toBe('/parent/home');
  });
});
