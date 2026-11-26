/** S22 holdouts: only Vienne gets as far as the "too big" message, and a refused photo is never counted as an AI call. */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo } from '../integration/helpers';
import * as ai from '@/server/ai';

freshDemo();

const send = (chars: number) => ai.readAnswerKeyPage({ bookId: 'book_g4', test: 'T1', image: { mediaType: 'image/jpeg', base64: 'A'.repeat(chars) } });

describe('S22 holdouts', () => {
  it('a parent, a preview parent and a signed-out visitor are refused, big photo or small', async () => {
    const preview = await db.user.create({ data: { email: 's22.preview@example.com', name: 'Preview', status: 'PREVIEW' } });
    const drafts = await db.aiDraft.count();
    for (const chars of [500, 4_100_000]) {
      for (const who of ['u_ana', 'u_grace', preview.id]) {
        as(who);
        fails(await send(chars), 'FORBIDDEN');
      }
      as(null);
      fails(await send(chars), 'UNAUTHENTICATED');
    }
    expect(await db.aiDraft.count()).toBe(drafts);
  });

  it('Vienne gets the plain message for a refused photo, and nothing is counted against the AI limit', async () => {
    as('u_admin');
    const drafts = await db.aiDraft.count();
    for (const chars of [4_000_004, 6_000_000]) fails(await send(chars), 'INVALID', /too big to send.*closer.*smaller photo/i);
    expect(await db.aiDraft.count()).toBe(drafts);
  });
});
