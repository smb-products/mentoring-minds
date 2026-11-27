import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Locator } from '@playwright/test';
import { expect, freshData, test } from './support/fixtures';

/**
 * L5: a photo across the top of each service card in "Ways to learn with Vienne" instead of the line icon
 * ("people, not symbols", Javaris for Vienne, 2026-11-27), signed out on a production build.
 */
freshData();

const PHOTOS: { name: string; file: string; alt: string }[] = [
  { name: '1-on-1 Tutoring', file: 'one-on-one', alt: 'A tutor helping a student with a worksheet' },
  { name: 'Small Groups', file: 'small-groups', alt: 'A tutor working with a small group of students' },
  { name: 'In-Home Tutoring', file: 'in-home', alt: 'A tutor and a student working at a kitchen table' },
  { name: 'Online Tutoring', file: 'online', alt: 'A student in an online session with a tutor on a laptop' },
];
/** next/image of a static import: /_next/image?url=/_next/static/media/<file>.<hash>.jpg */
const src = (file: string) => new RegExp(`^/_next/image\\?url=%2F_next%2Fstatic%2Fmedia%2F${file}\\.[\\w-]+\\.jpg&`);

const css = (l: Locator, prop: string) => l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
const box = async (l: Locator) => (await l.boundingBox())!;
const loaded = (img: Locator) => img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth);

test.describe('signed out', () => {
  test('each service card has its photo across the top, 2:1 and cover, under the 24px corners, then the title and line', async ({ page }) => {
    await page.goto('/');
    const cards = page.locator('section#services').getByRole('listitem');
    await expect(cards).toHaveCount(4);
    await expect(cards.getByRole('heading', { level: 3 })).toHaveText(PHOTOS.map((p) => p.name));

    for (let i = 0; i < 4; i++) {
      const { name, file, alt } = PHOTOS[i];
      const card = cards.nth(i);
      const img = card.locator('img');
      await expect(img, name).toHaveCount(1);
      await expect(img, name).toHaveAttribute('src', src(file));
      await expect(img, name).toHaveAttribute('alt', alt);
      await expect(img, name).toHaveAttribute('loading', 'lazy');
      expect((await img.getAttribute('sizes')) ?? '', name).not.toBe('');
      expect(await img.getAttribute('fetchpriority'), name).toBeNull();

      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => loaded(img), { message: name }).toBeGreaterThan(0);

      const [p, c] = [await box(img), await box(card)];
      expect(Math.abs(p.width / p.height - 2), name).toBeLessThanOrEqual(0.05);
      expect(Math.abs(p.width - c.width), name).toBeLessThan(1);
      expect(Math.abs(p.y - c.y), name).toBeLessThan(1);
      expect(Math.abs(p.x - c.x), name).toBeLessThan(1);
      expect(await css(img, 'object-fit'), name).toBe('cover');

      // The card's top corners stay rounded, and the photo is clipped to them.
      expect(parseFloat(await css(card, 'border-top-left-radius')), name).toBe(24);
      expect(parseFloat(await css(card, 'border-top-right-radius')), name).toBe(24);
      expect(await css(card, 'overflow'), name).toBe('hidden');

      // Below the photo: the title and the line, on the card's pastel body.
      const title = await box(card.getByRole('heading', { level: 3 }));
      expect(title.y, name).toBeGreaterThanOrEqual(p.y + p.height);
      expect(await css(card, 'background-color'), name).not.toBe('rgba(0, 0, 0, 0)');
    }

    // The service cards have no svg any more; the trust tiles keep their icons.
    await expect(page.locator('section#services svg')).toHaveCount(0);
    const trust = page.getByRole('list', { name: 'At a glance' }).getByRole('listitem');
    for (let i = 0; i < 4; i++) await expect(trust.nth(i).locator('svg')).toHaveCount(1);
  });

  test('the photos are next/images with the grid’s sizes, imported statically, and each URL returns 200 image/* signed out', async ({ page, request }) => {
    await page.goto('/');
    const imgs = page.locator('section#services img');
    await expect(imgs).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      const img = imgs.nth(i);
      await expect(img).toHaveAttribute('sizes', '(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw');
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => loaded(img), { message: PHOTOS[i].name }).toBeGreaterThan(0);
      const url = await img.evaluate((el) => (el as HTMLImageElement).currentSrc);
      expect(new URL(url).pathname).toBe('/_next/image');
      // A fresh request context: no cookies, so this is a signed-out visitor.
      const res = await request.get(url, { maxRedirects: 0 });
      expect(res.status(), PHOTOS[i].name).toBe(200);
      expect(res.headers()['content-type'], PHOTOS[i].name).toMatch(/^image\//);
      // The original under /_next/static too.
      const original = decodeURIComponent(new URL(url).searchParams.get('url')!);
      expect(original).toMatch(new RegExp(`^/_next/static/media/${PHOTOS[i].file}\\.`));
      const raw = await request.get(original, { maxRedirects: 0 });
      expect(raw.status()).toBe(200);
      expect(raw.headers()['content-type']).toMatch(/^image\//);
    }

    const source = readFileSync(path.join(process.cwd(), 'src/components/landing/Landing.tsx'), 'utf8');
    for (const { file } of PHOTOS) expect(source).toContain(`from '../../../public/landing/services/${file}.jpg'`);
    expect(source).toMatch(/from 'next\/image'/);
    expect(source).not.toMatch(/\bpriority\b|\bpreload\b|loading=["{']?eager/);
    // The unused service icons are gone from the lucide import.
    const lucide = source.match(/import \{([^}]*)\} from 'lucide-react'/)![1];
    for (const icon of ['Home', 'Laptop', 'User', 'Users']) expect(lucide).not.toMatch(new RegExp(`\\b${icon}\\b`));
  });

  test('@phone services 1 per row, each photo the card’s full width, no sideways scroll', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const vw = page.viewportSize()!.width;
    if (vw >= 640) return; // the phone project only

    const cards = page.locator('section#services').getByRole('listitem');
    await expect(cards).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      const card = cards.nth(i);
      const img = card.locator('img');
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => loaded(img), { message: PHOTOS[i].name }).toBeGreaterThan(0);
      const [p, c] = [await box(img), await box(card)];
      expect(Math.abs(p.width - c.width), PHOTOS[i].name).toBeLessThan(1);
      expect(Math.abs(p.width / p.height - 2), PHOTOS[i].name).toBeLessThanOrEqual(0.05);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x + c.width).toBeLessThanOrEqual(vw);
      if (i > 0) {
        const prev = await box(cards.nth(i - 1));
        expect(c.y).toBeGreaterThan(prev.y + prev.height - 1);
        expect(Math.round(c.x)).toBe(Math.round(prev.x));
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
