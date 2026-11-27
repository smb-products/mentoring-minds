/**
 * L5 holdouts: the service photos hold their box and the rounded corners at every grid width, every size a
 * signed-out browser may pick loads, and the public files are the committed ones with no hidden camera,
 * place or author data and no real name beside them.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Locator } from '@playwright/test';
import { expect, freshData, test } from '../e2e/support/fixtures';

freshData();

const FILES = ['one-on-one', 'small-groups', 'in-home', 'online'];

const loaded = (img: Locator) => img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth);

test('at each grid width every photo fills its card at 2:1, and the rounded top corners clip it', async ({ page }) => {
  const grid: [number, number][] = [[320, 1], [639, 1], [640, 2], [1023, 2], [1024, 4], [1920, 4]];
  for (const [width, across] of grid) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const cards = page.locator('section#services').getByRole('listitem');
    await expect(cards).toHaveCount(4);
    const tops: number[] = [];
    for (let i = 0; i < 4; i++) {
      const at = `${width}px ${FILES[i]}`;
      const card = cards.nth(i);
      const img = card.getByRole('img');
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => loaded(img), { message: at }).toBeGreaterThan(0);
      // Put the card's top in view, then measure and hit-test in the same frame.
      const m = await card.evaluate((li) => {
        li.scrollIntoView({ block: 'start', behavior: 'instant' });
        const el = li.querySelector('img')!;
        const [c, p] = [li.getBoundingClientRect(), el.getBoundingClientRect()];
        const isPhoto = (x: number, y: number) => document.elementFromPoint(x, y) === el;
        return {
          card: { x: c.x, width: c.width, top: c.top, docTop: c.top + window.scrollY },
          photo: { x: p.x, width: p.width, height: p.height, top: p.top },
          fit: getComputedStyle(el).objectFit,
          corners: [isPhoto(c.left + 2, c.top + 2), isPhoto(c.right - 2, c.top + 2)],
          inside: isPhoto(c.left + c.width / 2, c.top + 2),
        };
      });
      expect(Math.abs(m.photo.width - m.card.width), at).toBeLessThan(1);
      expect(Math.abs(m.photo.x - m.card.x), at).toBeLessThan(1);
      expect(Math.abs(m.photo.top - m.card.top), at).toBeLessThan(1);
      expect(Math.abs(m.photo.width / m.photo.height - 2), at).toBeLessThanOrEqual(0.05);
      expect(m.fit, at).toBe('cover');
      expect(m.inside, `${at}: the photo reaches the card's top edge`).toBe(true);
      expect(m.corners, `${at}: the photo pokes out of a rounded corner`).toEqual([false, false]);
      tops.push(Math.round(m.card.docTop));
    }
    expect(tops.filter((t) => t === tops[0]).length, `${width}px: cards in the first row`).toBe(across);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px`).toBeLessThanOrEqual(width);
  }
});

test('signed out, every offered size loads, and the files are the committed ones with no hidden data or real names', async ({ page, request, context, db }) => {
  await page.goto('/');
  expect(await context.cookies().then((all) => all.filter((c) => /session-token/.test(c.name)))).toEqual([]);
  const imgs = page.locator('section#services').getByRole('img');
  await expect(imgs).toHaveCount(4);

  // No photo is preloaded ahead of its turn.
  const preloads = await page.locator('link[rel=preload][as=image]').evaluateAll((links) => links.map((l) => `${l.getAttribute('href')} ${l.getAttribute('imagesrcset')}`));
  expect(preloads.join(' ')).not.toMatch(new RegExp(FILES.join('|')));

  const [students, users] = [await db.student.findMany(), await db.user.findMany()];
  const names = [...students.flatMap((s) => [s.firstName, s.lastName]), ...users.flatMap((u) => (u.name ?? '').split(' '))]
    .filter((n): n is string => Boolean(n) && n!.length > 2);
  expect(names.length).toBeGreaterThan(0);

  for (let i = 0; i < 4; i++) {
    const img = imgs.nth(i);
    const alt = (await img.getAttribute('alt'))!;
    for (const name of [...names, 'Miami', 'Dade', 'Florida']) expect(alt, FILES[i]).not.toMatch(new RegExp(`\\b${name}\\b`, 'i'));
    // No tooltip or caption adds words beside the scene.
    expect(await img.getAttribute('title'), FILES[i]).toBeNull();

    const srcset = (await img.getAttribute('srcset'))!;
    const urls = srcset.split(',').map((part) => part.trim().split(/\s+/)[0]);
    expect(urls.length, FILES[i]).toBeGreaterThan(1);
    for (const url of [...urls, (await img.getAttribute('src'))!]) {
      const res = await request.get(url, { maxRedirects: 0 });
      expect(res.status(), url).toBe(200);
      expect(res.headers()['content-type'], url).toMatch(/^image\//);
    }

    const original = new URL(urls[0], page.url()).searchParams.get('url')!;
    const served = await (await request.get(original, { maxRedirects: 0 })).body();
    const committed = readFileSync(path.join(process.cwd(), 'public/landing/services', `${FILES[i]}.jpg`));
    expect(served.equals(committed), `${FILES[i]}: served as committed, not re-encoded`).toBe(true);
    // The repo and the page are public: no EXIF (GPS, camera), XMP/IPTC (author, place) or comment blocks.
    expect(jpegSegments(served).filter((marker) => [0xe1, 0xed, 0xfe].includes(marker)), FILES[i]).toEqual([]);
  }
});

/** The markers of a JPEG's header segments, up to where the picture data starts. */
function jpegSegments(file: Buffer) {
  expect(file.readUInt16BE(0), 'a JPEG').toBe(0xffd8);
  const markers: number[] = [];
  for (let at = 2; at + 4 <= file.length && file[at] === 0xff && file[at + 1] !== 0xda; at += 2 + file.readUInt16BE(at + 2)) {
    markers.push(file[at + 1]);
  }
  return markers;
}
