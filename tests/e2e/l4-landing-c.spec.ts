import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, freshData, test } from './support/fixtures';

/**
 * L4: Landing C, "Bright and clear" (docs/design/landing-c.html, docs/DESIGN.md → Landing C), signed out on a
 * production build. Section by section in the mockup's order and words, with Inter, the brain logo, line icons,
 * --landing-* colors, a sample progress card from the demo seed, and L2's real form in the dark panel.
 */
freshData();

const HEADLINE = 'Math tutoring that builds real confidence';
const SUBHEAD = 'One-on-one and small-group sessions with Vienne Elliott, with F.A.S.T. test prep for Florida students.';
const SECTIONS = ['Ways to learn with Vienne', 'Know exactly how your child is doing', 'Simple pricing', 'Getting started takes three steps', 'Ready to get started?'];
const TRUST = ['Grades K–6', 'Florida B.E.S.T. standards', 'F.A.S.T. test prep', 'Step Up For Students accepted'];
const SERVICES: [string, string][] = [
  ['1-on-1 Tutoring', 'Individual support for students who need extra help in a subject.'],
  ['Small Groups', 'Students practice and learn alongside their peers.'],
  ['In-Home Tutoring', 'For special circumstances.'],
  ['Online Tutoring', 'For special circumstances.'],
];
const APP_LINES = [
  'Book sessions online at a time that suits you',
  'Homework with feedback from Vienne',
  'Progress reports in Vienne’s words',
  'F.A.S.T. score tracking and the area to work on next',
  'Message Vienne directly, plus video sessions when needed',
];
const STEPS: [string, string][] = [
  ['Request an invite', 'Tell Vienne about your child. She replies with an invite code.'],
  ['Create your account', 'Sign up in a minute with your code.'],
  ['Book your first session', 'Then follow homework and progress in the app.'],
];
const THANKS = 'Thanks. Vienne will email you soon.';

const css = (l: Locator, prop: string) => l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
const box = async (l: Locator) => (await l.boundingBox())!;
const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const squish = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();

test.describe('signed out', () => {
  test('the header: the brain logo at 32px, the name, and Services, Rates, Sign in and Get started', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('header').first();
    const logo = header.getByRole('img', { name: 'Mentoring Minds' });
    const size = await box(logo);
    expect(Math.round(size.width)).toBe(32);
    expect(Math.round(size.height)).toBe(32);
    const home = header.getByRole('link', { name: /Mentoring Minds Academy/ });
    await expect(home).toHaveAttribute('href', '/');
    await expect(home).toContainText('Mentoring Minds Academy');

    const nav = header.getByRole('navigation');
    await expect(nav.getByRole('link')).toHaveText(['Services', 'Rates', 'Sign in', 'Get started']);
    await expect(nav.getByRole('link', { name: 'Services' })).toHaveAttribute('href', '#services');
    await expect(nav.getByRole('link', { name: 'Rates' })).toHaveAttribute('href', '#rates');
    await expect(nav.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/sign-in');
    await expect(nav.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '#request-invite');

    await nav.getByRole('link', { name: 'Get started' }).click();
    await expect(page).toHaveURL(/#request-invite$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Ready to get started?' })).toBeInViewport();
    await nav.getByRole('link', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('Inter, no Google Fonts, and weight 700 with tight tracking for the hero and section titles', async ({ page }) => {
    const fonts: string[] = [];
    page.on('request', (r) => {
      if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) fonts.push(r.url());
    });
    await page.goto('/');
    await expect(page.locator('link[href*="fonts.googleapis"], link[href*="fonts.gstatic"]')).toHaveCount(0);
    const h1 = page.getByRole('heading', { level: 1 });
    expect(await css(h1, 'font-family')).toMatch(/^"?Inter/);
    expect(await css(page.locator('body'), 'font-family')).not.toMatch(/Jakarta/);
    expect(await css(h1, 'font-weight')).toBe('700');
    expect(parseFloat(await css(h1, 'letter-spacing'))).toBeLessThan(-1);
    for (const name of SECTIONS.filter((s) => s !== 'Simple pricing')) {
      const h2 = page.getByRole('heading', { level: 2, name });
      expect(await css(h2, 'font-weight'), name).toBe('700');
      expect(parseFloat(await css(h2, 'letter-spacing')), name).toBeLessThan(-0.5);
    }
    expect(fonts).toEqual([]);
  });

  test('the hero: the pill, the headline with the highlight, the subhead and both buttons', async ({ page }) => {
    await page.goto('/');
    const hero = page.locator('main section').first();
    await expect(hero.getByText('Grades K–6 · Miami-Dade · In person or online', { exact: true })).toBeVisible();
    const h1 = hero.getByRole('heading', { level: 1 });
    await expect(h1).toHaveText(HEADLINE);
    const mark = h1.locator('[data-highlight]');
    await expect(mark).toHaveText('real confidence');
    expect(await css(mark, 'background-image')).toMatch(/linear-gradient/);
    await expect(hero.locator('h1 + p')).toHaveText(SUBHEAD);

    const invite = hero.getByRole('link', { name: 'Request an invite' });
    const rates = hero.getByRole('link', { name: '$50 per hour · See rates' });
    await expect(invite).toHaveAttribute('href', '#request-invite');
    await expect(rates).toHaveAttribute('href', '#rates');
    await rates.click();
    await expect(page).toHaveURL(/#rates$/);
    await expect(region(page, 'Simple pricing')).toBeInViewport();
    await invite.click();
    await expect(page).toHaveURL(/#request-invite$/);
    await expect(page.locator('#request-invite').getByRole('form', { name: 'Request an invite' })).toBeInViewport();
  });

  test('the only gradients are the graph-paper hero and the highlight', async ({ page }) => {
    await page.goto('/');
    const withImages = await page.locator('.landing, .landing *').evaluateAll((els) =>
      els.filter((el) => getComputedStyle(el).backgroundImage !== 'none').map((el) => (el.hasAttribute('data-hero') ? 'hero' : el.hasAttribute('data-highlight') ? 'highlight' : el.outerHTML.slice(0, 80))),
    );
    expect(withImages.sort()).toEqual(['hero', 'highlight']);
    const hero = page.locator('[data-hero]');
    expect(await css(hero, 'background-image')).toMatch(/linear-gradient.*linear-gradient/);
    expect(await css(hero, 'background-size')).toBe('32px 32px');
  });

  test('the four trust tiles, each with a 20px line icon and no letter badge', async ({ page }) => {
    await page.goto('/');
    const tiles = page.getByRole('list', { name: 'At a glance' }).getByRole('listitem');
    await expect(tiles).toHaveText(TRUST);
    for (let i = 0; i < 4; i++) {
      const icon = tiles.nth(i).locator('svg');
      await expect(icon).toHaveCount(1);
      const b = await box(icon);
      expect([Math.round(b.width), Math.round(b.height)], TRUST[i]).toEqual([20, 20]);
      expect(await icon.getAttribute('fill')).toBe('none');
    }
  });

  test('Ways to learn with Vienne: the line and the four pastel service tiles', async ({ page }) => {
    await page.goto('/');
    const services = page.locator('section#services');
    await expect(services).toHaveAttribute('aria-labelledby', 'services-title');
    await expect(services.getByRole('heading', { level: 2 })).toHaveText('Ways to learn with Vienne');
    await expect(services).toContainText('Pick what fits your child. Every option includes the parent app.');
    const tiles = services.getByRole('listitem');
    await expect(tiles.getByRole('heading', { level: 3 })).toHaveText(SERVICES.map(([name]) => name));
    const colors = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const [name, line] = SERVICES[i];
      await expect(tiles.nth(i)).toContainText(line);
      colors.add(await css(tiles.nth(i), 'background-color'));
      expect(parseFloat(await css(tiles.nth(i), 'border-top-left-radius')), name).toBe(24);
    }
    expect(colors.size).toBe(4);
    // Four across on a desktop.
    const ys = await Promise.all([0, 1, 2, 3].map(async (i) => Math.round((await box(tiles.nth(i))).y)));
    expect(new Set(ys).size).toBe(1);
  });

  test('Know exactly how your child is doing: five lines, and a dark progress card that is clearly a sample', async ({ page }) => {
    await page.goto('/');
    const section = region(page, 'Know exactly how your child is doing');
    await expect(section).toContainText('Every family gets the Mentoring Minds app.');
    const lines = section.getByRole('list').getByRole('listitem');
    expect((await lines.allTextContents()).map((t) => squish(t).replace(/^✓ ?/, ''))).toEqual(APP_LINES);

    const card = section.locator('figure[data-sample-screen]');
    await expect(card.locator('figcaption')).toHaveText('Sample screen with demo data.');
    expect(squish(await card.innerText())).toBe(
      'Progress · Ella, grade 3 From Vienne Much more patient with word problems, and now draws a picture before solving. Average score 83% Next session Mon, 6:30 PM Sample screen with demo data.',
    );
    expect(await css(card, 'background-color')).toBe('rgb(16, 24, 40)');
    // Static markup: the page makes no server call to draw it.
    const source = readFileSync(path.join(process.cwd(), 'src/components/landing/Landing.tsx'), 'utf8');
    expect(source).not.toMatch(/@\/server|@\/lib\/db|prisma|fetch\(/);
    // Ella is a made-up sample name: in no family's data, not even the demo seed's (the leak holdouts ban those on /).
    expect(readFileSync(path.join(process.cwd(), 'prisma/demo/seed.js'), 'utf8')).not.toMatch(/\bElla\b/);
  });

  test('the pricing card: $50 per hour, the ways to pay, and Step Up For Students linked out', async ({ page }) => {
    await page.goto('/');
    const rates = page.locator('section#rates');
    await expect(rates).toHaveAttribute('aria-labelledby', 'rates-title');
    await expect(rates.getByRole('heading', { level: 2 })).toHaveText('Simple pricing');
    await expect(rates).toContainText('$50 per hour');
    await expect(rates).toContainText('In person or online, whichever works best for your child.');
    await expect(rates.getByText('Ways to pay', { exact: true })).toBeVisible();
    const ways = rates.getByRole('list', { name: 'Ways to pay' }).getByRole('listitem');
    expect((await ways.allTextContents()).map(squish)).toEqual(['Cash', 'Zelle', 'Cash App', 'Apple Pay', 'Step Up For Students scholarship ↗']);
    const stepUp = rates.getByRole('link', { name: 'Step Up For Students scholarship' });
    await expect(stepUp).toHaveAttribute('href', 'https://www.stepupforstudents.org');
    await expect(stepUp).toHaveAttribute('target', '_blank');
    await expect(stepUp).toHaveAttribute('rel', 'noopener noreferrer');
    expect(parseFloat(await css(rates.locator('[data-rates-panel]'), 'border-top-left-radius'))).toBe(28);
  });

  test('Getting started takes three steps', async ({ page }) => {
    await page.goto('/');
    const steps = region(page, 'Getting started takes three steps').getByRole('listitem');
    await expect(steps).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(steps.nth(i).locator('[data-step-number]')).toHaveText(String(i + 1));
      await expect(steps.nth(i).getByRole('heading', { level: 3 })).toHaveText(STEPS[i][0]);
      await expect(steps.nth(i)).toContainText(STEPS[i][1]);
    }
  });

  test('the sections come in the mockup’s order, with no About Vienne, testimonials or ratings', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(SECTIONS);
    const body = page.locator('body');
    await expect(body).not.toContainText(/About Vienne|testimonial|review|rating|★|5 stars|families trust/i);
    // The About Vienne slot is marked in the source, not rendered.
    expect(readFileSync(path.join(process.cwd(), 'src/components/landing/Landing.tsx'), 'utf8')).toMatch(/\{\/\* About Vienne[^*]*\*\/\}/);
  });

  test('the dark panel holds L2’s form: it sends, shows L2’s message, and Have a code links to sign-in', async ({ page, db }) => {
    await page.goto('/');
    const panel = page.locator('section#request-invite');
    await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Ready to get started?');
    await expect(panel).toContainText('Send a request and Vienne will reply personally.');
    await expect(panel).toContainText('Have a code? Create your account');
    await expect(panel.getByRole('link', { name: 'Create your account' })).toHaveAttribute('href', '/sign-in');
    expect(await css(panel.locator('div').first(), 'background-color')).toBe('rgb(16, 24, 40)');

    const form = panel.getByRole('form', { name: 'Request an invite' });
    await expect(form.locator('input[name=website]')).toHaveAttribute('tabindex', '-1');
    await form.getByLabel('Parent name').fill('Lena Park');
    await form.getByLabel('Email').fill('lena.park@example.com');
    await form.getByLabel(/Child.s grade \(K–6\)/).selectOption({ label: 'Grade 3' });
    await form.getByLabel('Message').fill('Help with fractions, please.');
    await form.getByRole('button', { name: 'Send request' }).click();
    await expect(panel.getByRole('status')).toHaveText(THANKS);
    await expect(form).toHaveCount(0);
    await expect.poll(() => db.inviteRequest.count({ where: { email: 'lena.park@example.com' } })).toBe(1);

    await panel.getByRole('link', { name: 'Create your account' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('the footer: Privacy and Sign in work, and the copyright line', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    await expect(footer).toContainText('Mentoring Minds Academy');
    await expect(footer).toContainText('© Mentoring Minds Academy');
    await expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    await expect(footer.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/sign-in');
    await footer.getByRole('link', { name: 'Privacy' }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy');
    await page.goto('/');
    await footer.getByRole('link', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  });

  test('@phone hero padding 48px, trust tiles 2 per row, services 1 per row, full-width buttons, no sideways scroll', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADLINE);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const vw = page.viewportSize()!.width;
    if (vw >= 640) return; // the phone project only

    const hero = page.locator('[data-hero]');
    expect(await css(hero, 'padding-top')).toBe('48px');
    expect(await css(hero, 'padding-bottom')).toBe('48px');

    const tiles = page.getByRole('list', { name: 'At a glance' }).getByRole('listitem');
    const t = await Promise.all([0, 1, 2, 3].map(async (i) => box(tiles.nth(i))));
    expect(Math.round(t[0].y)).toBe(Math.round(t[1].y));
    expect(t[1].x).toBeGreaterThan(t[0].x);
    expect(Math.round(t[2].y)).toBe(Math.round(t[3].y));
    expect(t[2].y).toBeGreaterThan(t[0].y);

    const services = page.locator('section#services').getByRole('listitem');
    for (let i = 1; i < 4; i++) {
      const [a, b] = [await box(services.nth(i - 1)), await box(services.nth(i))];
      expect(b.y).toBeGreaterThan(a.y + a.height - 1);
      expect(Math.round(b.x)).toBe(Math.round(a.x));
    }

    // Buttons fill their column.
    const fullWidth = async (l: Locator) => l.evaluate((el) => Math.abs(el.getBoundingClientRect().width - el.parentElement!.clientWidth) < 1);
    const heroLinks = hero.getByRole('link');
    await expect(heroLinks).toHaveCount(2);
    for (let i = 0; i < 2; i++) expect(await fullWidth(heroLinks.nth(i))).toBe(true);
    const send = page.getByRole('form', { name: 'Request an invite' }).getByRole('button', { name: 'Send request' });
    expect(await fullWidth(send)).toBe(true);
    expect((await box(send)).width).toBeGreaterThan(vw - 120);

    // Everything stays on the screen.
    for (const l of [page.getByRole('heading', { level: 1 }), page.locator('figure[data-sample-screen]'), page.locator('[data-rates-panel]'), page.locator('footer')]) {
      const b = await box(l);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(vw);
    }
  });
});

test('colors are --landing-* tokens in globals.css, used only by the landing page; no gradient in globals.css', () => {
  const root = process.cwd();
  const globals = readFileSync(path.join(root, 'src/app/globals.css'), 'utf8');
  const start = globals.indexOf('.landing {');
  expect(start).toBeGreaterThan(0);
  const block = globals.slice(start, globals.indexOf('\n}', start));
  for (const token of ['accent', 'hero', 'grid', 'highlight', 'blue', 'yellow', 'green', 'purple', 'night'])
    expect(block, token).toMatch(new RegExp(`--landing-${token}: #[0-9a-f]{6};`));
  expect(globals).not.toMatch(/linear-gradient|radial-gradient/);
  expect(globals).not.toMatch(/Jakarta|fonts\.googleapis/);

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : /\.(jsx?|tsx?|css)$/.test(f) ? [p] : [];
    });
  const users = walk(path.join(root, 'src'))
    .filter((f) => /landing-[a-z]/.test(readFileSync(f, 'utf8').replace(/components\/landing/g, '')))
    .map((f) => path.relative(root, f))
    .sort();
  expect(users).toEqual([path.join('src', 'app', 'globals.css'), path.join('src', 'components', 'landing', 'Landing.tsx'), path.join('src', 'components', 'landing', 'RequestInvite.tsx')]);
  // The landing page draws no hex colors of its own: all of them are tokens.
  for (const f of ['Landing.tsx', 'RequestInvite.tsx']) expect(readFileSync(path.join(root, 'src/components/landing', f), 'utf8'), f).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
});
