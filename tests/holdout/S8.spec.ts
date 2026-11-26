/**
 * S8 holdouts: locked parents on routes the acceptance sweep doesn’t open (another family’s and made-up
 * work ids), in the bell, on a phone, nothing private on the wire, and an account paused while signed in.
 */
import type { Page } from '@playwright/test';
import type { e2eDb } from '../e2e/support/db';
import { expect, freshData, test } from '../e2e/support/fixtures';
import { main } from '../e2e/support/ui';

freshData();
// Each test walks every parent route on a fresh load.
test.describe.configure({ timeout: 120_000 });

/** The bell. Its unread count can come before its name (“1 Alerts”). */
async function openBell(page: Page) {
  await page.getByRole('button', { name: /^(\d+ ?)?(Alerts|Notifications)/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible();
}

const PAUSED = 'Your account is paused. Message Vienne to turn it back on.';
const LINK = 'https://meet.example.com/holdout-s8-room';
const NOTE = 'HOLDOUT-S8-ADMIN-NOTE';
const CHILDREN = /Mateo|Lucia|Noah|Sofia|Jordan/;

async function plantSecrets(db: ReturnType<typeof e2eDb>) {
  await db.settings.update({ where: { id: 1 }, data: { defaultMeetingUrl: LINK } });
  await db.session.updateMany({ where: { mode: 'VIDEO' }, data: { meetingUrl: LINK } });
  await db.student.updateMany({ data: { adminNotes: NOTE } });
}

/** Every text response the page receives. */
function wire(page: Page) {
  const bodies: Promise<string>[] = [];
  page.on('response', (r) => {
    if (/json|html|text|x-component/.test(r.headers()['content-type'] ?? '')) bodies.push(r.text().catch(() => ''));
  });
  return async () => (await Promise.all(bodies)).join('\n');
}

async function settled(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('[aria-busy="true"]'), `${url} never finished loading`).toHaveCount(0, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
}

async function routes(db: ReturnType<typeof e2eDb>) {
  const others = await db.submission.findFirstOrThrow({ where: { student: { parentId: 'u_ana' } } });
  return ['/parent/home', '/parent/sessions', '/parent/learning', '/parent/messages', '/parent/progress',
    `/parent/learning/${others.id}`, '/parent/learning/sub_does_not_exist'];
}

test('a paused Grace: every route, another family’s and made-up work, and the bell show the message and nothing private', async ({ page, as, db }) => {
  await plantSecrets(db);
  await db.user.update({ where: { id: 'u_grace' }, data: { status: 'PAUSED' } });
  try {
    await as('grace');
    const received = wire(page);
    for (const url of await routes(db)) {
      await settled(page, url);
      await expect(page.getByText(PAUSED), url).toBeVisible();
      await expect(main(page), url).not.toContainText(/Mateo|Lucia/);
      await expect(page.getByText('This page couldn’t load'), url).toHaveCount(0);
      await expect(page.locator(`a[href="${LINK}"]`), url).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Join call|Request a session|Fill in answers/ }), url).toHaveCount(0);
    }
    await openBell(page);
    await page.waitForLoadState('networkidle');
    const text = await received();
    expect(text).not.toContain(LINK);
    expect(text).not.toContain(NOTE);
    expect(text).not.toContain('Mateo');
  } finally {
    await db.user.update({ where: { id: 'u_grace' }, data: { status: 'ACTIVE' } });
  }
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a preview parent: every route and the bell ask for the code, with no child or secret', async ({ page, as, db }) => {
    await plantSecrets(db);
    await as('tom');
    const received = wire(page);
    for (const url of await routes(db)) {
      await settled(page, url);
      await expect(page.getByText('Enter your invite code'), url).toBeVisible();
      await expect(page.locator('body'), url).not.toContainText(CHILDREN);
      await expect(page.getByText('This page couldn’t load'), url).toHaveCount(0);
    }
    await openBell(page);
    await page.waitForLoadState('networkidle');
    const text = await received();
    expect(text).not.toContain(LINK);
    expect(text).not.toContain(NOTE);
    expect(text).not.toMatch(/Mateo|Lucia|Noah/);
  });
});

test('paused while signed in: moving around and opening the bell never takes the app down', async ({ page, as, db, errors }) => {
  try {
    await as('daniel');
    await settled(page, '/parent/home');
    await db.user.update({ where: { id: 'u_daniel' }, data: { status: 'PAUSED' } });
    for (const name of ['Sessions', 'Learning', 'Progress', 'Messages', 'Home']) {
      await page.getByRole('link', { name: new RegExp(`^(\\d+ ?)?${name}`) }).first().click();
      await expect(page).toHaveURL(new RegExp(`/parent/${name.toLowerCase()}$`));
      await page.waitForLoadState('networkidle');
      // The navigation is outside the page's error boundary: it must still be there.
      await expect(page.getByRole('button', { name: /^Account/ }).first(), name).toBeVisible();
    }
    await openBell(page);
    await page.waitForLoadState('networkidle');
    expect(errors.filter((e) => e.startsWith('page error:'))).toEqual([]);
    // Errors the page's own boundary catches are logged by React; only uncaught ones count here.
    errors.length = 0;
    // On the next full load, the paused screen takes over.
    await settled(page, '/parent/home');
    await expect(page.getByText(PAUSED)).toBeVisible();
  } finally {
    await db.user.update({ where: { id: 'u_daniel' }, data: { status: 'ACTIVE' } });
  }
});
