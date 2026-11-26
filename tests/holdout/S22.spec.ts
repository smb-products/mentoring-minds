/** S22 holdout: after the "too big" message, Vienne can just pick another photo and it's sent. */
import { expect, requires, test } from '../e2e/support/fixtures';
import { expectToast, toasts } from '../e2e/support/ui';

requires('books', 'ai');

const TOO_BIG = 'That photo is too big to send. Take it a little closer to the page, or use a smaller photo.';
const GENERIC = /couldn’t reach the server/i;

test('a photo that is too big is not sent, and the next, smaller one goes through', async ({ page, as }) => {
  test.skip(Boolean(process.env.ANTHROPIC_API_KEY), 'An API key is set: this would cost a Claude call.');
  await as('vienne');
  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.headers()['next-action'] && (r.postData() ?? '').includes('"mediaType"')) sent.push(r.url());
  });
  await page.goto('/admin/content/book/book_g4/T1');
  await page.getByRole('button', { name: 'Set up from photos' }).click();
  const input = page.getByRole('region', { name: 'Set up from photos' }).locator('input[type=file]');

  // A camera file with no known type, far over the limit.
  await input.setInputFiles({ name: 'IMG_9001.heic', mimeType: 'application/octet-stream', buffer: Buffer.alloc(8_000_000, 1) });
  await expectToast(page, TOO_BIG);
  expect(sent).toHaveLength(0);

  const small = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = 'black';
    ctx.font = '40px sans-serif';
    for (let n = 1; n <= 10; n++) ctx.fillText(`${n}. A`, 40, n * 52);
    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
  });
  await input.setInputFiles({ name: 'IMG_9002.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(small, 'base64') });
  await expectToast(page, 'The AI helper isn’t available right now. Type it in instead, or try again in a minute.');
  expect(sent).toHaveLength(1);
  await expect(toasts(page).getByText(GENERIC)).toHaveCount(0);
});
