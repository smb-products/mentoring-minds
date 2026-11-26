/**
 * S25: someone who must choose a new password (S21) can't open files or get a Blob upload token until
 * they do. The two routes under src/app/api/files aren't server functions, so S21's guard didn't reach
 * them. Each case calls the route handlers directly, as the S17 holdout calls the upload route.
 */
import bcrypt from 'bcryptjs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { as, db, freshDemo, ok } from './helpers';

// The Blob store is an in-memory stand-in, as in blob.test.ts; the token exchange is the real @vercel/blob/client.
const store = vi.hoisted(() => new Map<string, Uint8Array>());
vi.mock('@vercel/blob', () => ({
  get: async (key: string) => {
    const bytes = store.get(key);
    return bytes ? { statusCode: 200, stream: new Blob([bytes as BlobPart]).stream(), blob: { etag: '"s25"', contentType: 'application/pdf' } } : null;
  },
  head: async () => {
    throw Object.assign(new Error('BlobNotFoundError'), { name: 'BlobNotFoundError' });
  },
  del: async (key: string) => void store.delete(key),
}));

import * as content from '@/server/content';
import * as families from '@/server/families';
import { authorizeBlobUpload } from '@/lib/blob-upload';
import { GET as download } from '@/app/api/files/[id]/route';
import { POST as tokenRoute } from '@/app/api/files/blob/route';

freshDemo();

const FILE = 'fa_lucia_work'; // Ana's child's work: Vienne and Ana may open it, Daniel may not.
const PDF = new TextEncoder().encode('%PDF-1.7\n%%EOF\n');
const ADMIN_PASSWORD = 'vienne-temporary-1';

const before = process.env.BLOB_READ_WRITE_TOKEN;
beforeAll(async () => {
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_teststore123_abcdefghijklmnopqrstuvwxyz';
  const { storageKey } = await db.fileAsset.findUniqueOrThrow({ where: { id: FILE } });
  store.set(storageKey, PDF);
});
afterAll(() => {
  if (before === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = before;
});
afterEach(async () => {
  await db.user.updateMany({ where: { id: { in: ['u_admin', 'u_ana'] } }, data: { mustChangePassword: false, failedLogins: 0, lockedUntil: null } });
});

const getFile = (id = FILE) => download(new Request(`http://localhost/api/files/${id}`), { params: Promise.resolve({ id }) } as never);

/** The browser's token request for a reservation made by content.createUpload. */
const askToken = (file: { id: string; storageKey: string }) =>
  tokenRoute(
    new Request('http://localhost/api/files/blob', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'blob.generate-client-token', payload: { pathname: file.storageKey, clientPayload: file.id, multipart: false } }),
    }),
  );

/** Reserve an upload while allowed to (createUpload itself refuses a pending password change). */
async function reserve() {
  const r = ok(await content.createUpload({ filename: 'Work.pdf', mimeType: 'application/pdf', sizeBytes: PDF.byteLength }));
  if (r.upload.kind !== 'blob') throw new Error('expected the Blob driver');
  return r.file;
}

/** The plain message the guards give for MUST_CHANGE_PASSWORD, read from a server function. */
async function guardMessage() {
  const r = await content.createUpload({ filename: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 10 });
  expect(r.ok).toBe(false);
  if (r.ok) throw new Error('unreachable');
  expect(r.code).toBe('MUST_CHANGE_PASSWORD');
  return r.error;
}

async function expectOpen(file: { id: string; storageKey: string }) {
  expect((await getFile()).status).toBe(200);
  const res = await askToken(file);
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ clientToken: expect.stringMatching(/^vercel_blob_client_/) });
}

async function expectRefused(file: { id: string; storageKey: string }, userId: string) {
  const message = await guardMessage();
  expect(message).toMatch(/choose a new password/i);

  const res = await getFile();
  expect(res.status).toBe(403);
  expect(await res.text()).toBe(message);

  const token = await askToken(file);
  expect(token.status).toBe(400);
  const body = await token.json();
  expect(body).toEqual({ error: message });
  expect(JSON.stringify(body)).not.toContain('vercel_blob_client_');

  // The token rule itself holds too, for any caller.
  await expect(authorizeBlobUpload(userId, file.storageKey, file.id)).rejects.toThrow();
}

describe('a parent who must change their password', () => {
  it('can’t open a file or get an upload token until they choose one; then both work, still signed in', async () => {
    as('u_ana');
    const file = await reserve();
    await expectOpen(file);

    as('u_admin');
    const { temporaryPassword } = ok(await families.resetParentPassword({ parentId: 'u_ana' }));

    as('u_ana');
    await expectRefused(file, 'u_ana');

    // No new sign-in: the same session, right after changing the password.
    ok(await families.changePassword({ currentPassword: temporaryPassword as string, newPassword: 'ana-own-password-1' }));
    await expectOpen(file);
  });

  it('others without the flag see no change while it is set', async () => {
    as('u_admin');
    const vienne = await reserve();
    ok(await families.resetParentPassword({ parentId: 'u_ana' }));

    await expectOpen(vienne); // Vienne
    as('u_daniel');
    expect((await getFile()).status).toBe(403); // still not his family's file
    expect(await (await getFile()).text()).toBe('Forbidden');
    as(null);
    expect((await getFile()).status).toBe(401);
    const anon = await askToken(vienne);
    expect(anon.status).toBe(400);
    expect((await anon.json()).error).toMatch(/sign in/);
  });
});

describe('Vienne, when she must change her password', () => {
  it('can’t open a file or get an upload token until she chooses one; then both work, still signed in', async () => {
    as('u_admin');
    const file = await reserve();
    await expectOpen(file);

    await db.user.update({ where: { id: 'u_admin' }, data: { passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4), mustChangePassword: true } });
    await expectRefused(file, 'u_admin');

    ok(await families.changePassword({ currentPassword: ADMIN_PASSWORD, newPassword: 'vienne-own-password-1' }));
    await expectOpen(file);
  });
});
