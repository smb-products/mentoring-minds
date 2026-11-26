'use client';
import { upload as blobUpload } from '@vercel/blob/client';
import { createUpload, finishUpload } from '@/server/content';
import type { Result } from './result';

const FAILED = 'The upload didn’t finish. Check your connection and try again.';

/**
 * The screens' `api.content.uploadFile` when live (docs/WIRING.md). Uploads a File in
 * three steps — reserve, send the bytes straight to storage, confirm — and returns the
 * same Result shape as the mock: { ok: true, data: FileAsset }. `mimeType` is the caller's
 * type, used when the browser leaves file.type blank (some phones do).
 */
export async function uploadFile(file: File, mimeType?: string): Promise<Result<Awaited<ReturnType<typeof finishUpload>> extends Result<infer T> ? T : never>> {
  const reserved = await createUpload({ filename: file.name, mimeType: file.type || mimeType || '', sizeBytes: file.size });
  if (!reserved.ok) return reserved;
  const { upload, file: asset } = reserved.data;
  try {
    if (upload.kind === 'blob') {
      await blobUpload(upload.pathname, file, { access: 'private', handleUploadUrl: upload.handleUploadUrl, clientPayload: upload.clientPayload, contentType: upload.contentType });
    } else {
      const res = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: file });
      if (!res.ok) return { ok: false, error: FAILED, code: 'UPLOAD' };
    }
  } catch (e) {
    const message = (e as Error).message;
    return { ok: false, error: /reserved|expired|sign in|can’t upload/.test(message) ? message : FAILED, code: 'UPLOAD' };
  }
  return finishUpload({ fileId: asset.id });
}
