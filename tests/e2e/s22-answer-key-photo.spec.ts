import type { Page, Request } from '@playwright/test';
import { expect, requires, test } from './support/fixtures';
import { expectToast, toasts } from './support/ui';

/**
 * S22: "Set up from photos" sends the answer-key photo as base64 in a server action, and next.config.ts caps a
 * server action's body at 4 MB. A normal phone photo is shrunk on the device first, so it goes through. One
 * that's still too big gets a plain message, and isn't sent (so Claude is never called for it).
 */
requires('books', 'ai');

const LIMIT = 4 * 1024 * 1024; // serverActions.bodySizeLimit: '4mb'
const TOO_BIG = 'That photo is too big to send. Take it a little closer to the page, or use a smaller photo.';
const AI_DOWN = 'The AI helper isn’t available right now. Type it in instead, or try again in a minute.';
const NETWORK = 'We couldn’t reach the server. Check your connection and try again.';

/** The readAnswerKeyPage calls the page makes (server actions carrying a photo). */
function photoSends(page: Page) {
  const sent: Request[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.headers()['next-action'] && (r.postData() ?? '').includes('"mediaType"')) sent.push(r);
  });
  return sent;
}

async function openPhotoSetup(page: Page) {
  await page.goto('/admin/content/book/book_g4/T1');
  await page.getByRole('button', { name: 'Set up from photos' }).click();
  return page.getByRole('region', { name: 'Set up from photos' });
}

/** A 12 MP (4032×3024) camera-style JPEG, made in the browser: light paper, ink-like stripes, sensor noise. */
async function phonePhoto(page: Page) {
  const b64 = await page.evaluate(async () => {
    const w = 4032;
    const h = 3024;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 8) / 16777216;
    for (let y = 0; y < h; y++) {
      const ink = y % 90 < 6;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const base = ink && x % 700 < 500 ? 40 : 225 - (x + y) / 140;
        const n = (rand() - 0.5) * 70;
        img.data[i] = base + n;
        img.data[i + 1] = base + n * 0.9;
        img.data[i + 2] = base - 10 + n * 0.8;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.92));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  });
  return Buffer.from(b64, 'base64');
}

test('a normal phone photo is shrunk on the device and goes through', async ({ page, as }) => {
  test.skip(Boolean(process.env.ANTHROPIC_API_KEY), 'An API key is set: this would cost a Claude call.');
  await as('vienne');
  const sent = photoSends(page);
  const setup = await openPhotoSetup(page);
  const photo = await phonePhoto(page);
  // As taken, its base64 is over the 4 MB limit: sent unshrunk, it would fail.
  expect(Math.ceil(photo.length / 3) * 4).toBeGreaterThan(LIMIT);

  await setup.locator('input[type=file]').setInputFiles({ name: 'IMG_0412.jpg', mimeType: 'image/jpeg', buffer: photo });
  // It reached the server and passed every check: with no API key, the next step is the "not available" message.
  await expectToast(page, AI_DOWN);
  expect(sent).toHaveLength(1);
  expect(sent[0].postData()!.length).toBeLessThan(LIMIT);
  await expect(toasts(page).getByText(NETWORK)).toHaveCount(0);
  await expect(toasts(page).getByText(TOO_BIG)).toHaveCount(0);
});

test('a photo still too big after shrinking gets a plain message and isn’t sent', async ({ page, as, db }) => {
  await as('vienne');
  const sent = photoSends(page);
  const drafts = await db.aiDraft.count({ where: { kind: 'BOOK_PAGE' } });
  const setup = await openPhotoSetup(page);
  // 5 MB the browser can't decode, so it can't be shrunk (like a large HEIC on a computer).
  const buffer = Buffer.alloc(5_000_000, 0x5a);
  await setup.locator('input[type=file]').setInputFiles({ name: 'IMG_0413.heic', mimeType: 'image/heic', buffer });

  await expectToast(page, TOO_BIG);
  await page.waitForLoadState('networkidle');
  expect(sent).toHaveLength(0);
  expect(await db.aiDraft.count({ where: { kind: 'BOOK_PAGE' } })).toBe(drafts);
  await expect(toasts(page).getByText(NETWORK)).toHaveCount(0);
  await expect(setup.getByText('Take or choose a photo')).toBeVisible(); // she can pick another one
});

test('the server refuses a photo too big for Claude with the same plain message, before any call', async ({ page, as, db }) => {
  await as('vienne');
  const drafts = await db.aiDraft.count({ where: { kind: 'BOOK_PAGE' } });
  // Swap the photo in the real request for one just over the server's own limit (still under the 4 MB body cap).
  await page.route('**/*', async (route) => {
    const r = route.request();
    const body = r.postData() ?? '';
    if (r.method() !== 'POST' || !r.headers()['next-action'] || !body.includes('"mediaType"')) return route.fallback();
    await route.continue({ postData: body.replace(/"base64":"[^"]*"/, `"base64":"${'A'.repeat(4_050_000)}"`) });
  });
  const setup = await openPhotoSetup(page);
  await setup.locator('input[type=file]').setInputFiles('tests/e2e/files/page.png');

  await expectToast(page, TOO_BIG);
  expect(await db.aiDraft.count({ where: { kind: 'BOOK_PAGE' } })).toBe(drafts);
  await expect(toasts(page).getByText(NETWORK)).toHaveCount(0);
});
