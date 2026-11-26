/** W6 holdout (check 8): times are Miami time, even on a phone set to another zone. */
import { expect, requires, test } from '../e2e/support/fixtures';

requires('scheduling', 'dashboard', 'families');

test.use({ timezoneId: 'America/Los_Angeles' });

test('a parent whose phone is on Pacific time is offered and told Miami times', async ({ page, as, db }) => {
  await as('grace');
  await page.goto('/parent/sessions');
  await page.getByRole('button', { name: 'Request a session' }).first().click();
  const drawer = page.getByRole('dialog', { name: /Request a session/ });
  await drawer.getByRole('radio', { name: '45 min' }).click();
  await drawer.getByRole('radiogroup', { name: 'How' }).getByRole('radio', { name: 'Video call' }).click();
  await drawer.getByRole('radiogroup', { name: 'Day' }).getByRole('radio').nth(1).click();
  const time = drawer.getByRole('radiogroup', { name: /times$/ }).first().getByRole('radio').first();
  const offered = (await time.textContent())!.trim();
  await time.click();
  await drawer.getByLabel('Anything Vienne should know? (optional)').fill('HOLDOUT-PACIFIC');
  await drawer.getByRole('button', { name: 'Send request' }).click();
  await expect.poll(() => db.session.count({ where: { parentNote: 'HOLDOUT-PACIFIC' } })).toBe(1);
  const saved = await db.session.findFirstOrThrow({ where: { parentNote: 'HOLDOUT-PACIFIC' } });
  const miami = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(saved.startsAt);
  const plain = (s: string) => s.replace(/\s/g, ' ');
  expect(plain(offered), 'the time button Grace tapped').toBe(plain(miami));
});

test('the same phone shows an already booked session at its Miami time', async ({ page, as, db }) => {
  const s = await db.session.findFirstOrThrow({ where: { student: { parentId: 'u_grace' }, status: 'CONFIRMED', startsAt: { gt: new Date(Date.now() + 86_400_000) } }, orderBy: { startsAt: 'asc' } });
  const clock = (timeZone: string) => new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(s.startsAt).replace(/\s/g, ' ');
  await as('grace');
  await page.goto('/parent/sessions');
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', day: 'numeric' }).format(s.startsAt);
  await page.getByRole('main').getByRole('button', { name: new RegExp(`^${day} `) }).first().click();
  const detail = page.getByRole('dialog');
  await expect(detail).toContainText(clock('America/New_York'));
  await expect(detail).not.toContainText(clock('America/Los_Angeles'));
});
