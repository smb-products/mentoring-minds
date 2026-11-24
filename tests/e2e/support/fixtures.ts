import { test as base, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { DEMO_PASSWORD } from '../../../prisma/data';
import { closeDb, e2eDb, resetDemo } from './db';
import { missing, sessionWired, type Area } from './live';

/** Demo accounts that sign in with a password (Monique, Priya and Lena use Google). */
export const USERS = {
  vienne: 'vienne@example.com',
  ana: 'ana.mendoza@example.com', // Mateo (3) and Lucia (5): book homework, FAST
  grace: 'grace.kim@example.com', // Noah (5): video calls
  daniel: 'daniel.reyes@example.com', // Sofia (4)
  keisha: 'keisha.brooks@example.com', // Jordan (3): doesn't have the book yet
  tom: 'tom.hughes@example.com', // PREVIEW: no invite code yet
} as const;
export type Who = keyof typeof USERS;

const HOME: Record<Who, string> = { vienne: '/admin/today', ana: '/parent/home', grace: '/parent/home', daniel: '/parent/home', keisha: '/parent/home', tom: '/parent/home' };

/** Sessions are JWTs and the demo ids never change, so one sign-in per user per run is enough. */
const sessions = new Map<Who, Awaited<ReturnType<BrowserContext['storageState']>>>();

export async function signIn(page: Page, who: Who) {
  await page.goto('/sign-in');
  await page.locator('input[name=email]').fill(USERS[who]);
  await page.locator('input[name=password]').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(`**${HOME[who]}`);
}

/** A separate browser signed in as `who`, for "Ana does X, Vienne sees it" tests. */
export async function openAs(browser: Browser, who: Who, options: Parameters<Browser['newContext']>[0] = {}) {
  const base = { timezoneId: 'America/New_York', locale: 'en-US', ...options };
  let context: BrowserContext;
  if (sessions.has(who)) {
    context = await browser.newContext({ ...base, storageState: sessions.get(who) });
  } else {
    context = await browser.newContext(base);
    await signIn(await context.newPage(), who);
    sessions.set(who, await context.storageState());
    await Promise.all(context.pages().map((p) => p.close()));
  }
  const page = await context.newPage();
  const errors = watchErrors(page);
  return { context, page, errors, close: () => context.close() };
}

/** Browser errors that mean something broke (the Definition of done says "no console errors"). */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // A failed request already shows up as the error the test is looking for.
    if (/Failed to load resource/.test(text)) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

type Fixtures = {
  /** The e2e database (Prisma), to check what a screen saved. */
  db: ReturnType<typeof e2eDb>;
  /** Fails the test if the page logged an error. */
  errors: string[];
  /** Signs this test's `page` in. */
  as: (who: Who) => Promise<Page>;
};

export const test = base.extend<Fixtures>({
  db: async ({}, use) => {
    await use(e2eDb());
  },
  errors: [
    async ({ page }, use) => {
      const errors = watchErrors(page);
      await use(errors);
      expect(errors, 'the browser logged errors').toEqual([]);
    },
    { auto: true },
  ],
  as: async ({ page, context }, use) => {
    await use(async (who) => {
      const saved = sessions.get(who);
      if (saved) await context.addCookies(saved.cookies);
      else {
        await signIn(page, who);
        sessions.set(who, await context.storageState());
      }
      return page;
    });
  },
});

/**
 * Declares which areas a spec file needs. Skips it, saying what to switch on, until
 * they're live in src/ui/api/index.js; gives the file a fresh copy of the demo data.
 */
export function requires(...areas: Area[]) {
  test.beforeAll(() => {
    const off = missing(areas);
    test.skip(off.length > 0, `On the mock: ${off.join(', ')}. List them in LIVE in src/ui/api/index.js (docs/WIRING.md).`);
  });
  freshData();
}

/** For specs that need sign-in wired (WIRING.md Step 1) but no particular area. */
export function requiresSignInWired() {
  test.beforeAll(() => {
    test.skip(!sessionWired(), 'Sign-in isn’t wired into the screens yet (WIRING.md Step 1). Runs once any area is live.');
  });
  freshData();
}

export function freshData() {
  test.beforeAll(async () => {
    await resetDemo();
  });
  test.afterAll(async () => {
    await closeDb();
  });
}

/** Today's date in Vienne's time zone, as the screens show it. */
export const miamiToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

export { expect };
