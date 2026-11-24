/**
 * Vercel Blob (the production storage driver). The store itself is replaced by an
 * in-memory stand-in for @vercel/blob; the client-upload token exchange runs through
 * the real @vercel/blob/client handleUpload (it signs tokens locally).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';

const store = vi.hoisted(() => new Map<string, { bytes: Uint8Array; contentType: string; etag: string }>());
vi.mock('@vercel/blob', () => ({
  head: async (key: string) => {
    const o = store.get(key);
    if (!o) throw Object.assign(new Error('BlobNotFoundError'), { name: 'BlobNotFoundError' });
    return { size: o.bytes.byteLength, contentType: o.contentType, pathname: key, etag: o.etag };
  },
  get: async (key: string, opts: { access: string; ifNoneMatch?: string }) => {
    if (opts.access !== 'private') throw new Error('expected private access');
    const o = store.get(key);
    if (!o) return null;
    if (opts.ifNoneMatch && opts.ifNoneMatch === o.etag) return { statusCode: 304, stream: null, blob: { etag: o.etag } };
    return { statusCode: 200, stream: new Blob([o.bytes as BlobPart]).stream(), blob: { etag: o.etag, contentType: o.contentType } };
  },
  del: async (key: string) => void store.delete(key),
}));

import * as content from '@/server/content';
import { authorizeBlobUpload } from '@/lib/blob-upload';
import { GET as download } from '@/app/api/files/[id]/route';
import { POST as tokenRoute } from '@/app/api/files/blob/route';

freshDemo();

const PDF = new TextEncoder().encode('%PDF-1.7\n%%EOF\n');
const before = process.env.BLOB_READ_WRITE_TOKEN;
beforeAll(() => {
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_teststore123_abcdefghijklmnopqrstuvwxyz';
});
afterAll(() => {
  if (before === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = before;
});

/** What the browser does: reserve, then "upload" to the store at the reserved pathname. */
async function reserve(bytes: Uint8Array, mimeType = 'application/pdf') {
  const r = ok(await content.createUpload({ filename: 'Fraction strips.pdf', mimeType, sizeBytes: bytes.byteLength }));
  if (r.upload.kind !== 'blob') throw new Error('expected the Blob driver');
  return r as typeof r & { upload: Extract<typeof r.upload, { kind: 'blob' }> };
}

describe('uploads to Vercel Blob', () => {
  it('reserve gives a private, random pathname to upload to', async () => {
    as('u_admin');
    const { file, upload } = await reserve(PDF);
    expect(upload).toEqual({ kind: 'blob', pathname: file.storageKey, handleUploadUrl: '/api/files/blob', clientPayload: file.id, contentType: 'application/pdf' });
    expect(file.storageKey).toMatch(/^files\/[0-9a-f-]{36}\.pdf$/);
    expect(file.storageKey).not.toContain('Fraction');
  });

  it('a token is only issued for your own reservation, at its exact path, type and size', async () => {
    as('u_ana');
    const { file } = await reserve(PDF);
    const rules = await authorizeBlobUpload('u_ana', file.storageKey, file.id);
    expect(rules).toMatchObject({ allowedContentTypes: ['application/pdf'], maximumSizeInBytes: PDF.byteLength, allowOverwrite: false, addRandomSuffix: false, tokenPayload: file.id });
    await expect(authorizeBlobUpload(null, file.storageKey, file.id)).rejects.toThrow(/sign in/);
    await expect(authorizeBlobUpload('u_daniel', file.storageKey, file.id)).rejects.toThrow(/reserved/);
    await expect(authorizeBlobUpload('u_ana', 'files/somewhere-else.pdf', file.id)).rejects.toThrow(/reserved/);
    await expect(authorizeBlobUpload('u_ana', file.storageKey, null)).rejects.toThrow(/reserved/);
    await expect(authorizeBlobUpload('u_tom', file.storageKey, file.id)).rejects.toThrow(/can’t upload/); // preview account
    await db.fileAsset.update({ where: { id: file.id }, data: { createdAt: new Date(Date.now() - 2 * 3600000) } });
    await expect(authorizeBlobUpload('u_ana', file.storageKey, file.id)).rejects.toThrow(/expired/);
  });

  it('the token route hands the browser a client token (real @vercel/blob/client)', async () => {
    as('u_ana');
    const { file } = await reserve(PDF);
    const call = (pathname: string, clientPayload: string) =>
      tokenRoute(
        new Request('http://localhost/api/files/blob', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'blob.generate-client-token', payload: { pathname, clientPayload, multipart: false } }),
        }),
      );
    const good = await call(file.storageKey, file.id);
    expect(good.status).toBe(200);
    expect(await good.json()).toMatchObject({ type: 'blob.generate-client-token', clientToken: expect.stringMatching(/^vercel_blob_client_/) });
    const bad = await call('files/elsewhere.pdf', file.id);
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/reserved/);
    as(null);
    expect((await call(file.storageKey, file.id)).status).toBe(400);
  });

  it('finishing checks the stored size and real type; a fake file is deleted from the store', async () => {
    as('u_admin');
    const good = await reserve(PDF);
    store.set(good.upload.pathname, { bytes: PDF, contentType: 'application/pdf', etag: '"e1"' });
    expect(ok(await content.finishUpload({ fileId: good.file.id })).uploadedAt).toBeTruthy();

    const fakeBytes = new TextEncoder().encode('MZ this is not a pdf');
    const fake = await reserve(fakeBytes);
    store.set(fake.upload.pathname, { bytes: fakeBytes, contentType: 'application/pdf', etag: '"e2"' });
    fails(await content.finishUpload({ fileId: fake.file.id }), 'INVALID', /isn’t a real PDF/);
    expect(store.has(fake.upload.pathname)).toBe(false);
    expect(await db.fileAsset.findUnique({ where: { id: fake.file.id } })).toBeNull();

    const missing = await reserve(PDF);
    fails(await content.finishUpload({ fileId: missing.file.id }), 'INVALID', /didn’t finish/);
  });

  it('downloads stream from the private store after the permission check, with 304s', async () => {
    as('u_admin');
    const { file, upload } = await reserve(PDF);
    store.set(upload.pathname, { bytes: PDF, contentType: 'application/pdf', etag: '"v1"' });
    ok(await content.finishUpload({ fileId: file.id }));
    ok(await content.createResource({ title: 'Strips', kind: 'WORKSHEET', fileId: file.id, status: 'PUBLISHED' }));

    as('u_ana');
    const get = (etag?: string) => download(new Request(`http://localhost/api/files/${file.id}`, { headers: etag ? { 'if-none-match': etag } : {} }), { params: Promise.resolve({ id: file.id }) } as never);
    const res = await get();
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);
    expect(res.headers.get('cache-control')).toBe('private, no-cache');
    expect(res.headers.get('content-disposition')).toContain('Fraction strips.pdf');
    expect(res.headers.get('etag')).toBe('"v1"');
    expect((await get('"v1"')).status).toBe(304);

    as('u_tom'); // preview account: no access, and no bytes leave the store
    expect((await get()).status).toBe(403);
  });
});
