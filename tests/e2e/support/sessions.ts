import { expect, test, type Page } from '@playwright/test';
import type { e2eDb } from './db';

const MIAMI = 'America/New_York';
const time = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: MIAMI, hour: 'numeric', minute: '2-digit' }).format(d);
const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: MIAMI }).format(d);

/**
 * Takes a student's next confirmed session and moves it to today, ended at least 30
 * minutes ago on a quarter hour, so it waits for Vienne's note on Today. Demo data is
 * relative to the clock, so the same student may have other sessions today: callers
 * find this one by its start time. Skips in the first hours after midnight, when no
 * finished session can fit into today.
 */
export async function endNextSession(db: ReturnType<typeof e2eDb>, studentId: string) {
  const s = await db.session.findFirstOrThrow({ where: { studentId, status: 'CONFIRMED', startsAt: { gt: new Date() } }, orderBy: { startsAt: 'asc' } });
  const quarter = 15 * 60_000;
  const endsAt = new Date(Math.floor((Date.now() - 30 * 60_000) / quarter) * quarter);
  const startsAt = new Date(endsAt.getTime() - s.durationMin * 60_000);
  test.skip(day(startsAt) !== day(new Date()), 'Too soon after midnight in Miami for a session to have finished today.');
  await db.session.update({ where: { id: s.id }, data: { startsAt, endsAt } });
  return { ...s, startsAt, endsAt, label: time(startsAt) };
}

/** On Vienne's Today screen, taps "Complete" on that session's row and returns the form. */
export async function openCompleteForm(page: Page, fullName: string, startsAtLabel: string) {
  await page.goto('/admin/today');
  const row = page
    .locator('main div')
    .filter({ has: page.getByRole('button', { name: new RegExp(`${startsAtLabel}[\\s\\S]*${fullName}`) }) })
    .filter({ has: page.getByRole('button', { name: 'Complete', exact: true }) })
    .last();
  await row.getByRole('button', { name: 'Complete', exact: true }).click();
  const form = page.getByRole('dialog').filter({ has: page.getByLabel('What you worked on') });
  await expect(form).toBeVisible();
  return form;
}
