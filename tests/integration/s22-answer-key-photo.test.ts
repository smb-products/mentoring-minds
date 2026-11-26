/**
 * S22: an answer-key photo too big to send gets a plain message from readAnswerKeyPage, and Claude isn't called.
 * The limit sits under serverActions.bodySizeLimit (4 MB), so the message is what comes back, not a failed send.
 * Claude is stubbed as in the other AI tests; sign-in goes through as(), never a mocked auth().
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';

const claude = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async () => {
        claude.calls++;
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ test: 'T4', items: [{ number: 1, answer: 'B', format: 'MC', benchmarkCode: null, confident: true }] }) }] };
      },
    };
  },
}));

import * as ai from '@/server/ai';

freshDemo();

const LIMIT = 4 * 1024 * 1024; // next.config.ts serverActions.bodySizeLimit
const TOO_BIG = /That photo is too big to send\. Take it a little closer to the page, or use a smaller photo\./;
const photo = (chars: number) => ({ mediaType: 'image/jpeg' as const, base64: 'A'.repeat(chars) });
const read = (chars: number) => ai.readAnswerKeyPage({ bookId: 'book_g5', test: 'T4', fromNumber: 1, image: photo(chars) });
const pageDrafts = () => db.aiDraft.count({ where: { kind: 'BOOK_PAGE' } });

describe('S22: answer-key photo size', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    claude.calls = 0;
  });

  it('a photo over the limit gets the plain message; Claude isn’t called and nothing is counted', async () => {
    as('u_admin');
    const before = await pageDrafts();
    fails(await read(4_000_001), 'INVALID', TOO_BIG);
    fails(await read(LIMIT + 1000), 'INVALID', TOO_BIG);
    expect(claude.calls).toBe(0);
    expect(await pageDrafts()).toBe(before);
  });

  it('a shrunk phone photo (about 1 MB of base64) is read', async () => {
    as('u_admin');
    const r = ok(await read(1_200_000));
    expect(r.items).toHaveLength(1);
    expect(claude.calls).toBe(1);
  });

  it('the limit leaves room for the rest of the request under the 4 MB body cap', async () => {
    as('u_admin');
    ok(await read(4_000_000));
    const body = JSON.stringify([{ bookId: 'book_g5', test: 'T4', fromNumber: 1, photoName: 'IMG_0412.jpg', image: photo(4_000_000) }]);
    expect(body.length).toBeLessThan(LIMIT);
  });

  it('a parent can’t send a photo, big or small, and Claude isn’t called', async () => {
    as('u_ana');
    fails(await read(400), 'FORBIDDEN');
    fails(await read(4_000_001), 'FORBIDDEN');
    as(null);
    fails(await read(400), 'UNAUTHENTICATED');
    expect(claude.calls).toBe(0);
  });
});
