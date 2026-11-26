/**
 * S25 holdouts: Vienne's real reset closes both file routes to that family only. The refusal is the same
 * whatever is asked for (their own file, someone else's, one that doesn't exist, a cached copy), carries no
 * file bytes or upload token, and leaves the other family and signed-out visitors as before.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, fails, freshDemo, localTarget, ok } from '../integration/helpers';
import * as content from '@/server/content';
import * as families from '@/server/families';
import { GET as download } from '@/app/api/files/[id]/route';
import { POST as tokenRoute } from '@/app/api/files/blob/route';
import { PUT as uploadRoute } from '@/app/api/files/upload/[id]/route';

freshDemo();

const MARK = 's25-holdout-private-bytes';
const PDF = new TextEncoder().encode(`%PDF-1.7\n% ${MARK}\n%%EOF\n`);
const had = process.env.BLOB_READ_WRITE_TOKEN;

const get = (id: string, headers: Record<string, string> = {}) =>
  download(new Request(`http://localhost/api/files/${id}`, { headers }), { params: Promise.resolve({ id }) } as never);

async function askToken(pathname: string, clientPayload: string | null) {
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_teststore123_abcdefghijklmnopqrstuvwxyz';
  try {
    const res = await tokenRoute(
      new Request('http://localhost/api/files/blob', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'blob.generate-client-token', payload: { pathname, clientPayload, multipart: false } }),
      }),
    );
    return { status: res.status, text: await res.text() };
  } finally {
    if (had === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = had;
  }
}

const reserve = async () => ok(await content.createUpload({ filename: 'Work.pdf', mimeType: 'application/pdf', sizeBytes: PDF.byteLength }));

/** A real, finished upload by whoever is signed in. */
async function uploadedFile() {
  const { file, upload } = await reserve();
  const target = localTarget(upload);
  const res = await uploadRoute(new Request(new URL(target.url, 'http://localhost'), { method: 'PUT', headers: target.headers, body: PDF as unknown as BodyInit }), { params: Promise.resolve({ id: file.id }) } as never);
  expect(res.status).toBe(204);
  return ok(await content.finishUpload({ fileId: file.id }));
}

describe('S25 holdouts', () => {
  const f = {} as Record<'grace' | 'ana', { id: string; etag: string; reserved: { id: string; storageKey: string } }>;
  beforeAll(async () => {
    for (const who of ['grace', 'ana'] as const) {
      as(`u_${who}`);
      const { id } = await uploadedFile();
      const res = await get(id);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain(MARK);
      f[who] = { id, etag: res.headers.get('etag') ?? '"x"', reserved: (await reserve()).file as never };
    }
    as('u_admin');
    ok(await families.resetParentPassword({ parentId: 'u_grace' }));
  });
  afterAll(() => as(null));

  it('Grace gets the same plain 403 for every file, and no token for any reservation', async () => {
    as('u_grace');
    const guard = await content.createUpload({ filename: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 10 });
    fails(guard, 'MUST_CHANGE_PASSWORD');
    const message = guard.ok ? '' : guard.error;
    const asks: [string, Record<string, string>][] = [
      [f.grace.id, {}],
      [f.grace.id, { 'if-none-match': f.grace.etag }],
      [f.grace.id, { range: 'bytes=0-100' }],
      [f.ana.id, {}],
      ['does-not-exist', {}],
    ];
    for (const [id, headers] of asks) {
      const res = await get(id, headers);
      expect(res.status, id).toBe(403);
      expect(await res.text(), id).toBe(message);
      expect(res.headers.get('content-disposition'), id).toBeNull();
      expect(res.headers.get('etag'), id).toBeNull();
    }
    const tokens: [string, string | null][] = [
      [f.grace.reserved.storageKey, f.grace.reserved.id],
      [f.ana.reserved.storageKey, f.ana.reserved.id],
      ['files/made-up.pdf', null],
    ];
    for (const [pathname, payload] of tokens) {
      const res = await askToken(pathname, payload);
      expect(res.status).toBe(400);
      expect(JSON.parse(res.text)).toEqual({ error: message });
    }
  });

  it('Ana still opens and uploads her own, never Grace’s; signed out gets neither', async () => {
    as('u_ana');
    expect((await get(f.ana.id)).status).toBe(200);
    const mine = await askToken(f.ana.reserved.storageKey, f.ana.reserved.id);
    expect(mine.status).toBe(200);
    expect(mine.text).toContain('vercel_blob_client_');
    const theirs = await get(f.grace.id);
    expect(theirs.status).toBe(403);
    expect(await theirs.text()).not.toContain(MARK);
    const stolen = await askToken(f.grace.reserved.storageKey, f.grace.reserved.id);
    expect(stolen.status).toBe(400);
    expect(stolen.text).not.toContain('vercel_blob_client_');

    as(null);
    const res = await get(f.ana.id);
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain(MARK);
    const anon = await askToken(f.ana.reserved.storageKey, f.ana.reserved.id);
    expect(anon.status).toBe(400);
    expect(anon.text).not.toContain('vercel_blob_client_');
  });
});
