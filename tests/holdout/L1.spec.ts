/**
 * L1 holdouts: the public pages are open to the world, so they carry nothing about a family or about where
 * Vienne is, whatever a visitor sends with the request; look-alike addresses open nothing; and a preview
 * parent goes home from / until they sign out.
 */
import { expect, freshData, test } from '../e2e/support/fixtures';
import { openAccount } from '../e2e/support/ui';

freshData();

const FAMILY = /Mateo|Lucia|Noah|Sofia|Jordan|Mendoza|Grace Kim|Tom Hughes|Coral Terrace|Kendale Park|Gets anxious|soccer stats/;

test('/ and /privacy carry nothing from the database, and /privacy names nobody but Vienne', async ({ page, request, db }) => {
  await db.settings.updateMany({ data: { defaultMeetingUrl: 'https://meet.example.com/HOLDOUT-ROOM' } });
  const users = await db.user.findMany();
  const locations = await db.location.findMany();
  const invites = await db.invite.findMany();
  const secrets = [
    'HOLDOUT-ROOM',
    ...users.flatMap((u) => [u.email, u.phone]),
    ...locations.map((l) => l.address),
    ...invites.flatMap((i) => [i.codeHash, i.codeHint, i.parentEmail]),
  ].filter((s): s is string => !!s);

  const variants: Record<string, string>[] = [{}, { RSC: '1' }, { cookie: 'authjs.session-token=made-up; mm.demo.parent=u_ana' }];
  for (const path of ['/', '/privacy', '/?parent=u_ana&studentId=s_noah', '/privacy?studentId=s_noah']) {
    for (const headers of variants) {
      const label = `${path} ${JSON.stringify(headers)}`;
      const res = await request.get(path, { headers });
      expect(res.status(), label).toBe(200);
      expect(new URL(res.url()).pathname, label).toBe(new URL(path, res.url()).pathname);
      const body = await res.text();
      expect(body, label).not.toMatch(FAMILY);
      for (const secret of secrets) expect(body.includes(secret), `${label} carries ${secret}`).toBe(false);
    }
  }

  await page.goto('/privacy');
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/Javaris|@[a-z0-9-]+\.[a-z]|\d{3}[-. ]\d{4}|Coral Way|Suite \d/i);
});

test('signed out, addresses that only look like the open pages never show anything private', async ({ request }) => {
  const paths = [
    '/privacyx', '/privacy/anything', '/privacy/admin/today', '/Privacy', '/PRIVACY', '/privacy-policy', '/opengraph-imagex',
    '/opengraph-image/anything', '/privacy%2F..%2Fadmin%2Ftoday', '/opengraph-image%2F..%2Fparent%2Fhome', '/index', '/landing',
    '/admin/today?next=/privacy', '/parent/home?path=/',
  ];
  for (const path of paths) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect([302, 303, 307, 308], path).toContain(res.status());
    expect(new URL(res.headers()['location'], 'http://x').pathname, path).toBe('/sign-in');
    expect(await res.text(), path).not.toMatch(FAMILY);
  }
});

test('a preview parent goes home from /, and after signing out / is the public page again', async ({ page, as }) => {
  await as('tom');
  await page.goto('/');
  await expect(page).toHaveURL(/\/parent\/home$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const panel = await openAccount(page);
  await panel.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/sign-in');

  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Math tutoring for grades K');
  await expect(page.locator('body')).not.toContainText(/Tom|tom\.hughes/);
  await page.goto('/parent/home');
  await expect(page).toHaveURL(/\/sign-in$/);
});
