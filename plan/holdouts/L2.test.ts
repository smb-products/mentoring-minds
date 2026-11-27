/**
 * L2 holdout, checks 4 and 5 together. Parked until a lead writes this case into L2's checks.
 * Outside a request there's no IP, so everything sent here is one visitor's.
 */
import { expect, it } from 'vitest';
import { as, db, freshDemo } from '../../tests/integration/helpers';
import { requestInvite } from '@/server/requests';

freshDemo();

const send = (email: string) => requestInvite({ parentName: 'Pat Example', email, grade: 2, message: '' });

/** What a stranger is told: two requests of their own, then one with a family's email, then one more of their own. */
async function strangersAnswers(familyAskedEarlier: boolean) {
  as(null);
  await db.inviteRequest.deleteMany();
  if (familyAskedEarlier) {
    await send('family@example.com');
    // The family asked from their own connection, not the stranger's.
    await db.inviteRequest.updateMany({ data: { ipHash: 'the-familys-own-connection' } });
  }
  const answers: string[] = [];
  for (const email of ['own.1@example.com', 'own.2@example.com', 'family@example.com', 'own.3@example.com']) {
    const r = await send(email);
    answers.push(r.ok ? JSON.stringify(r.data) : String(r.code));
  }
  return answers;
}

it('checks 4 and 5: one visitor’s answers are the same in both cases', async () => {
  const asked = await strangersAnswers(true);
  const neverAsked = await strangersAnswers(false);
  expect({ asked, neverAsked }).toEqual({ asked: neverAsked, neverAsked });
  expect(asked[3]).toBe('LIMIT');
});
