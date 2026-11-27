/**
 * L2 holdouts: one visitor's answers never say whether an email has asked before (checks 4 and 5), whoever
 * sends gets nothing back but the thank-you, only Vienne reads the request, and wrong input or a bot's costs
 * a real family nothing. Outside a request there's no IP, so everything sent here is one visitor's.
 */
import { expect, it } from 'vitest';
import { as, db, freshDemo } from '../integration/helpers';
import { requestInvite } from '@/server/requests';
import { listForUser } from '@/server/notifications';

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

it('Ana, Grace and a preview parent get only the thank-you, and only Vienne reads the request', async () => {
  await db.inviteRequest.deleteMany();
  // The second and third repeat the first sender's email: nobody can tell it was asked.
  const answers: unknown[] = [];
  for (const who of ['u_ana', 'u_grace', 'u_tom']) {
    as(who);
    answers.push(await requestInvite({ parentName: 'Quill Stranger', email: 'quill@example.com', phone: '(305) 555-0199', grade: 4, message: 'Quill private words' }));
  }
  expect(answers).toEqual(Array(3).fill({ ok: true, data: { received: true } }));
  // The visitor's tries are used up. Being refused says nothing about the email or the earlier requests either.
  as(null);
  expect(await send('quill@example.com')).toEqual({
    ok: false,
    code: 'LIMIT',
    error: 'You’ve sent a few requests already. Vienne will reply by email; try again later if you need to.',
  });
  expect((await listForUser()).ok).toBe(false);

  for (const who of ['u_ana', 'u_grace', 'u_tom']) {
    as(who);
    const feed = await listForUser();
    expect(feed.ok, who).toBe(true);
    expect(JSON.stringify(feed), who).not.toMatch(/Quill|quill@|555-0199|Invite request|INVITE_REQUEST/);
  }
  as('u_admin');
  const feed = JSON.stringify(await listForUser());
  expect(feed.match(/Invite request from Quill Stranger/g)).toHaveLength(1);
  expect(feed).not.toMatch(/ipHash|inviteRequestId/);
});

it('wrong input and a bot’s filled field use up none of a family’s tries, and nothing typed is echoed', async () => {
  await db.inviteRequest.deleteMany();
  as(null);
  const good = { parentName: 'Pat Example', email: 'pat@example.com', grade: 2, message: '' };
  const bad = [
    { ...good, parentName: '   ' },
    { ...good, parentName: 'Zyx\rBcc' },
    { ...good, email: 'zyx@@example.com' },
    { ...good, phone: '<b>zyx</b>' },
    { ...good, grade: Number.NaN },
    { ...good, message: 'zyx'.repeat(400) },
    { ...good, website: 12345 as unknown as string },
    {} as typeof good,
  ];
  for (const input of bad) {
    const label = JSON.stringify(input).slice(0, 80);
    const r = await requestInvite(input);
    expect(r, label).toMatchObject({ ok: false, code: 'INVALID' });
    if (!r.ok) expect(r.error, label).not.toMatch(/zyx|expected|received|undefined|NaN|string/i);
  }
  for (let i = 0; i < 5; i++) expect(await requestInvite({ ...good, website: 'bot' })).toEqual({ ok: true, data: { received: true } });
  expect(await db.inviteRequest.count()).toBe(0);
  // All three tries are still there.
  for (const n of [1, 2, 3]) expect((await send(`real.${n}@example.com`)).ok, `try ${n}`).toBe(true);
  expect((await send('real.4@example.com')).ok).toBe(false);
});
