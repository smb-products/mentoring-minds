import { db } from '@/lib/db';
import { checkLocalUploadToken, usingBlob, writeLocal } from '@/lib/storage';

/**
 * PUT /api/files/upload/[id]?t=… — LOCAL DEVELOPMENT ONLY. Stands in for Vercel Blob's client
 * upload URL: the token (from content.createUpload) is an HMAC that expires in 10
 * minutes. In production, browsers upload straight to Blob and this route refuses.
 */
export async function PUT(req: Request, ctx: RouteContext<'/api/files/upload/[id]'>) {
  if (usingBlob() || (process.env.NODE_ENV === 'production' && process.env.ALLOW_LOCAL_UPLOADS !== 'true')) return new Response('Not available', { status: 404 });
  const { id } = await ctx.params;
  if (!checkLocalUploadToken(id, new URL(req.url).searchParams.get('t'))) return new Response('Upload link expired', { status: 403 });
  const file = await db.fileAsset.findUnique({ where: { id } });
  if (!file || file.uploadedAt) return new Response('Not found', { status: 404 });
  if (req.headers.get('content-type') !== file.mimeType) return new Response('Wrong file type', { status: 415 });

  // Read at most the declared size (+1 to detect a body that's too big).
  const reader = req.body?.getReader();
  if (!reader) return new Response('Empty upload', { status: 400 });
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > file.sizeBytes) {
      await reader.cancel();
      return new Response('File is bigger than declared', { status: 413 });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  await writeLocal(file.storageKey, bytes);
  return new Response(null, { status: 204 });
}
