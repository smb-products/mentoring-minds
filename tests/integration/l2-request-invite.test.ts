/**
 * L2: "Request an invite" on the landing page (src/server/requests.ts → requestInvite). Signed out, no account,
 * rate-limited, with a honeypot; the request reaches Vienne's alerts, and the daily job deletes it after
 * REQUEST_KEEP_DAYS. The IP is mocked here (lib/client-ip reads the request's headers); it isn't a guard.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';
import { requestInvite } from '@/server/requests';
import * as notifications from '@/server/notifications';
import { cleanUp, REQUEST_KEEP_DAYS as JOB_KEEP_DAYS } from '@/lib/jobs';

const ip = vi.hoisted(() => ({ current: '203.0.113.1' as string | null }));
vi.mock('@/lib/client-ip', () => ({ clientIp: async () => ip.current }));
/** Only web-push is a fake, so the test reads what Vienne's phone would get (as in s26-push-tag). */
const sendNotification = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-public';
  process.env.VAPID_PRIVATE_KEY = 'test-private';
  return vi.fn(async (_sub: { endpoint: string }, _body: string) => ({}));
});
vi.mock('web-push', () => ({ sendNotification, setVapidDetails: vi.fn() }));

freshDemo();

const SRC = readFileSync(path.join(process.cwd(), 'src/server/requests.ts'), 'utf8');
const constant = (name: string) => {
  const m = SRC.match(new RegExp(`^const ${name} = (\\d+);`, 'm'));
  if (!m) throw new Error(`${name} moved or changed shape in src/server/requests.ts`);
  return Number(m[1]);
};
const PER_IP = constant('REQUESTS_PER_IP_PER_HOUR');
const PER_HOUR = constant('REQUESTS_PER_HOUR');
const DUPLICATE_HOURS = constant('DUPLICATE_EMAIL_HOURS');
const KEEP_DAYS = constant('REQUEST_KEEP_DAYS');
const LIMITED = 'You’ve sent a few requests already. Vienne will reply by email; try again later if you need to.';
const HOUR = 3600000;

let n = 0;
const nextIp = () => `198.51.100.${(n += 1)}`;
const valid = (over: Record<string, unknown> = {}) => ({
  parentName: 'Marisol Ortega',
  email: `marisol.${(n += 1)}@example.com`,
  phone: '(305) 555-0142',
  grade: 2,
  message: 'My son needs help with fractions.\nWeekday afternoons work best.',
  ...over,
});
const send = (input: unknown) => requestInvite(input as never);
const hashOf = (value: string | null) => createHash('sha256').update(`${value ?? 'unknown'}:${process.env.INVITE_PEPPER}`).digest('hex');
const alerts = (type = 'INVITE_REQUEST') => db.notification.findMany({ where: { type } });
const fill = (count: number, at = new Date(Date.now() - 60000)) =>
  db.inviteRequest.createMany({ data: Array.from({ length: count }, (_, i) => ({ parentName: 'Filler', email: `filler.${(n += 1)}.${i}@example.com`, grade: 1, message: '', ipHash: `filler-${n}-${i}`, createdAt: at })) });

beforeEach(async () => {
  as(null);
  ip.current = nextIp();
  await db.inviteRequest.deleteMany();
  await db.notification.deleteMany({ where: { type: { in: ['INVITE_REQUEST', 'INVITE_REQUESTS_PAUSED'] } } });
});

describe('a request, signed out', () => {
  it('returns { received: true }, stores one request and gives each admin one alert with its details', async () => {
    const input = valid({ email: '  Marisol.Ortega@Example.COM ' });
    const r = await send(input);
    expect(r).toEqual({ ok: true, data: { received: true } });

    const rows = await db.inviteRequest.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ parentName: 'Marisol Ortega', email: 'marisol.ortega@example.com', phone: '(305) 555-0142', grade: 2, message: input.message });
    expect(rows[0].ipHash).toBe(hashOf(ip.current));
    expect(rows[0].ipHash).not.toContain(ip.current!);

    const admins = await db.user.findMany({ where: { role: 'ADMIN' } });
    expect(admins.length).toBeGreaterThan(0);
    const got = await alerts();
    expect(got.map((a) => a.userId).sort()).toEqual(admins.map((a) => a.id).sort());
    for (const a of got) {
      expect(a).toMatchObject({ audience: 'ADMIN', inviteRequestId: rows[0].id, href: '/admin/families', title: 'Invite request from Marisol Ortega' });
      for (const part of ['Grade 2', 'marisol.ortega@example.com', '(305) 555-0142', 'My son needs help with fractions.', 'Weekday afternoons work best.']) expect(a.body).toContain(part);
    }
  });

  it('the push carries only the title, tagged INVITE_REQUEST:<id>', async () => {
    as('u_admin');
    ok(await notifications.savePushSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/l2-vienne', keys: { p256dh: 'p', auth: 'a' } }));
    as(null);
    sendNotification.mockClear();
    ok(await send(valid()));
    const row = await db.inviteRequest.findFirstOrThrow();
    await vi.waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(sendNotification.mock.calls[0][1]) as Record<string, string>;
    expect(payload).toEqual({ title: 'Invite request from Marisol Ortega', body: '', href: '/admin/families', tag: `INVITE_REQUEST:${row.id}` });
  });

  it('a parent gets no alert, and can’t see Vienne’s (permissions)', async () => {
    ok(await send(valid()));
    const parents = await db.user.findMany({ where: { role: 'PARENT' }, select: { id: true } });
    expect(await db.notification.count({ where: { type: 'INVITE_REQUEST', userId: { in: parents.map((p) => p.id) } } })).toBe(0);
    as('u_ana');
    const feed = ok(await notifications.listForUser()) as unknown;
    expect(JSON.stringify(feed)).not.toContain('Invite request from');
    as('u_admin');
    expect(JSON.stringify(ok(await notifications.listForUser()))).toContain('Invite request from Marisol Ortega');
  });

  it('works the same for a signed-in caller, and a kindergartner without a phone or message reads cleanly', async () => {
    as('u_ana');
    expect(await send(valid({ grade: 0, phone: '', message: '' }))).toEqual({ ok: true, data: { received: true } });
    const [a] = await alerts();
    expect(a.body).toMatch(/^Kindergarten · marisol\.\d+@example\.com$/);
    expect((await db.inviteRequest.findFirstOrThrow()).phone).toBeNull();
  });
});

describe('the honeypot and a repeat email: the same answer, nothing stored, nobody told', () => {
  it('a filled website field', async () => {
    expect(await send(valid({ website: 'https://spam.example.com' }))).toEqual({ ok: true, data: { received: true } });
    expect(await db.inviteRequest.count()).toBe(0);
    expect(await alerts()).toEqual([]);
  });

  it(`the same email again within DUPLICATE_EMAIL_HOURS (${DUPLICATE_HOURS}), in any case, then again after it`, async () => {
    const email = 'repeat@example.com';
    ok(await send(valid({ email })));
    ip.current = nextIp();
    expect(await send(valid({ email: 'REPEAT@example.com', message: 'Did you get my last one?' }))).toEqual({ ok: true, data: { received: true } });
    expect(await db.inviteRequest.count()).toBe(1);
    expect(await alerts()).toHaveLength((await db.user.count({ where: { role: 'ADMIN' } })) * 1);

    await db.inviteRequest.updateMany({ data: { createdAt: new Date(Date.now() - (DUPLICATE_HOURS + 1) * HOUR) } });
    ok(await send(valid({ email })));
    expect(await db.inviteRequest.count()).toBe(2);
  });
});

describe('wrong input is INVALID, names the field, never echoes it, and stores nothing', () => {
  const long = (len: number) => 'Q'.repeat(len);
  const cases: [string, Record<string, unknown>, RegExp][] = [
    ['parentName missing', { parentName: undefined }, /name/i],
    ['parentName too short', { parentName: 'Z' }, /name/i],
    ['parentName too long', { parentName: long(81) }, /name/i],
    ['parentName wrong type', { parentName: 42 }, /name/i],
    ['parentName with a line break', { parentName: 'Zelda\nQuint' }, /name/i],
    ['parentName with a control character', { parentName: 'Zelda\u0007Quint' }, /name/i],
    ['email missing', { email: undefined }, /email/i],
    ['email bad', { email: 'zelda.quint.example.com' }, /email/i],
    ['email bad (no domain)', { email: 'zeldaquint@' }, /email/i],
    ['email too long', { email: `${long(250)}@example.com` }, /email/i],
    ['email wrong type', { email: ['zelda@example.com'] }, /email/i],
    ['email with a control character', { email: 'zelda\u0000@example.com' }, /email/i],
    ['phone too long', { phone: '1'.repeat(31) }, /phone/i],
    ['phone with letters', { phone: '305-QUINT-12' }, /phone/i],
    ['phone wrong type', { phone: 3055550142 }, /phone/i],
    ['phone with a control character', { phone: '305\t555 0142' }, /phone/i],
    ['grade missing', { grade: undefined }, /grade/i],
    ['grade 7', { grade: 7 }, /grade/i],
    ['grade −1', { grade: -1 }, /grade/i],
    ['grade not whole', { grade: 2.5 }, /grade/i],
    ['grade as text', { grade: '3' }, /grade/i],
    ['message missing', { message: undefined }, /message/i],
    ['message too long', { message: long(1001) }, /message/i],
    ['message wrong type', { message: { text: 'hi' } }, /message/i],
    ['message with a control character', { message: 'Zelda\u001bQuint' }, /message/i],
    ['message with a tab', { message: 'Zelda\tQuint' }, /message/i],
  ];

  for (const [label, over, field] of cases) {
    it(label, async () => {
      const input = valid(over);
      const r = await send(input);
      fails(r, 'INVALID', field);
      if (!r.ok) {
        for (const v of Object.values(over)) if (typeof v === 'string' && v.length > 2) expect(r.error).not.toContain(v);
        expect(r.error).not.toMatch(/Zelda|Quint|QQQ|example\.com/);
      }
      expect(await db.inviteRequest.count()).toBe(0);
      expect(await alerts()).toEqual([]);
    });
  }

  it('a wrong-typed input as a whole, and a line break in the message is fine', async () => {
    for (const bad of [42, 'x', [], true, null]) fails(await send(bad), 'INVALID');
    expect(await db.inviteRequest.count()).toBe(0);
    ok(await send(valid({ message: 'Line one\nLine two\n\nLine four' })));
  });

  it('the limits are inclusive: a 2-letter name, 80 letters, a 254-character email, 30-character phone, 1000-character message', async () => {
    ok(await send(valid({ parentName: 'Al' })));
    ok(await send(valid({ parentName: 'A'.repeat(80), phone: '+1 (305) 555-0142 x'.slice(0, -1).padEnd(30, '0') })));
    ok(await send(valid({ email: `${'a'.repeat(242)}@example.com`, message: 'm'.repeat(1000) })));
    expect(await db.inviteRequest.count()).toBe(3);
  });
});

describe('limits', () => {
  it(`the (REQUESTS_PER_IP_PER_HOUR + 1)th (${PER_IP + 1}th) from one IP in an hour is LIMIT; another IP still gets through`, async () => {
    for (let i = 0; i < PER_IP; i++) ok(await send(valid()));
    const r = await send(valid());
    fails(r, 'LIMIT');
    if (!r.ok) expect(r.error).toBe(LIMITED);
    expect(await db.inviteRequest.count()).toBe(PER_IP);
    ip.current = nextIp();
    ok(await send(valid()));
    // An hour later the first IP's requests no longer count.
    await db.inviteRequest.updateMany({ data: { createdAt: new Date(Date.now() - HOUR - 60000) } });
    ip.current = '198.51.100.250';
    ok(await send(valid()));
  });

  it('a missing IP shares one bucket', async () => {
    ip.current = null;
    for (let i = 0; i < PER_IP; i++) ok(await send(valid()));
    fails(await send(valid()), 'LIMIT');
    const hashes = new Set((await db.inviteRequest.findMany()).map((r) => r.ipHash));
    expect([...hashes]).toEqual([hashOf(null)]);
  });

  it(`past REQUESTS_PER_HOUR (${PER_HOUR}) everyone gets LIMIT, and Vienne gets one pause alert per hour`, async () => {
    await fill(PER_HOUR);
    for (let i = 0; i < 3; i++) {
      ip.current = nextIp();
      const r = await send(valid());
      fails(r, 'LIMIT');
      if (!r.ok) expect(r.error).toBe(LIMITED);
    }
    expect(await db.inviteRequest.count()).toBe(PER_HOUR);
    const admins = await db.user.count({ where: { role: 'ADMIN' } });
    const paused = await alerts('INVITE_REQUESTS_PAUSED');
    expect(paused).toHaveLength(admins);
    expect(paused[0].title).toBe('Invite requests are paused for an hour');
    expect(await alerts()).toEqual([]);
    // Refusals at once still tell her once.
    await Promise.all(Array.from({ length: 4 }, () => send(valid())));
    expect(await alerts('INVITE_REQUESTS_PAUSED')).toHaveLength(admins);
  });

  it('a pause alert from over an hour ago doesn’t stop a new one', async () => {
    await fill(PER_HOUR);
    fails(await send(valid()), 'LIMIT');
    await db.notification.updateMany({ where: { type: 'INVITE_REQUESTS_PAUSED' }, data: { createdAt: new Date(Date.now() - HOUR - 60000) } });
    fails(await send(valid()), 'LIMIT');
    expect(await alerts('INVITE_REQUESTS_PAUSED')).toHaveLength(2 * (await db.user.count({ where: { role: 'ADMIN' } })));
  });

  it('two at once on the last slot: exactly one is stored', async () => {
    await fill(PER_HOUR - 1);
    const ips = [nextIp(), nextIp()];
    const results = await Promise.all(
      ips.map(async (address) => {
        ip.current = address;
        return send(valid());
      }),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === 'LIMIT')).toHaveLength(1);
    expect(await db.inviteRequest.count()).toBe(PER_HOUR);
  });

  it('two at once on one IP’s last slot: exactly one is stored', async () => {
    for (let i = 0; i < PER_IP - 1; i++) ok(await send(valid()));
    const results = await Promise.all([send(valid()), send(valid())]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.inviteRequest.count()).toBe(PER_IP);
  });

  it('counting and inserting run in one transaction under pg_advisory_xact_lock, one query at a time', () => {
    const body = SRC.slice(SRC.indexOf('export const requestInvite'));
    expect(body).toMatch(/db\.\$transaction\(async \(tx\) => \{\s+await tx\.\$executeRaw`SELECT pg_advisory_xact_lock\(\$\{REQUESTS_LOCK\}\)`/);
    expect(body).not.toMatch(/Promise\.all/);
    expect(SRC).toMatch(/^import \{ clientIp \} from '@\/lib\/client-ip';$/m);
    expect(readFileSync(path.join(process.cwd(), 'src/lib/client-ip.ts'), 'utf8')).toMatch(/^import 'server-only';/);
  });
});

describe('what the answer carries', () => {
  it('only { received: true }: no id, no input, no ipHash, nothing that says the email asked before', async () => {
    const email = 'leak.check@example.com';
    const first = await send(valid({ email }));
    const again = await send(valid({ email }));
    const honey = await send(valid({ website: 'x' }));
    for (const r of [first, again, honey]) expect(JSON.stringify(r)).toBe('{"ok":true,"data":{"received":true}}');
    const row = await db.inviteRequest.findFirstOrThrow();
    for (const r of [first, again, honey]) for (const secret of [row.id, row.ipHash, email, 'Marisol']) expect(JSON.stringify(r)).not.toContain(secret);
  });
});

describe(`the daily job keeps requests REQUEST_KEEP_DAYS (${KEEP_DAYS})`, () => {
  it('lib/jobs.ts uses the same value', () => {
    expect(JOB_KEEP_DAYS).toBe(KEEP_DAYS);
  });

  it('deletes one 91 days old and its alerts by inviteRequestId, keeps one 89 days old, and nothing else', async () => {
    const day = 86400000;
    const make = (days: number) => db.inviteRequest.create({ data: { parentName: `Aged ${days}`, email: `aged.${days}@example.com`, grade: 3, message: '', ipHash: 'x', createdAt: new Date(Date.now() - days * day) } });
    const kept = await make(KEEP_DAYS - 1);
    const gone = await make(KEEP_DAYS + 1);
    const alert = (inviteRequestId: string | null, title: string) =>
      db.notification.create({ data: { userId: 'u_admin', audience: 'ADMIN', type: 'INVITE_REQUEST', title, inviteRequestId, createdAt: new Date(Date.now() - 100 * day) } });
    const keptAlert = await alert(kept.id, 'Invite request from Aged 89');
    const goneAlert = await alert(gone.id, 'Invite request from Aged 91');
    // Same words, no id: never deleted by text.
    const lookalike = await alert(null, 'Invite request from Aged 91');
    const others = await db.notification.count({ where: { inviteRequestId: null } });

    await cleanUp();
    expect((await db.inviteRequest.findMany()).map((r) => r.id)).toEqual([kept.id]);
    expect(await db.notification.findUnique({ where: { id: goneAlert.id } })).toBeNull();
    expect(await db.notification.findUnique({ where: { id: keptAlert.id } })).not.toBeNull();
    expect(await db.notification.findUnique({ where: { id: lookalike.id } })).not.toBeNull();
    expect(await db.notification.count({ where: { inviteRequestId: null } })).toBe(others);
    await cleanUp(); // safe to run twice
    expect(await db.inviteRequest.count()).toBe(1);
  });
});
