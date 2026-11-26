import { db } from '@/lib/db';
import { canReadFile } from '@/lib/files';
import { requireUser } from '@/lib/guards';
import { ApiError } from '@/lib/result';
import { contentDisposition, openForDownload } from '@/lib/storage';

/**
 * GET /api/files/[id] — the only way files leave storage. Permission is checked on
 * every request, right next to the read (lib/files.ts): Vienne sees everything; an
 * active parent sees published resources visible to one of their children, and their
 * own children's work. Private Blob files are streamed through here; nothing is cached
 * anywhere shared. Someone who must choose a new password first (S21) is refused until
 * they do (S25), with the guard's message.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: RouteContext<'/api/files/[id]'>) {
  const { id } = await ctx.params;
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    if (e.code === 'MUST_CHANGE_PASSWORD') return new Response(e.message, { status: 403 });
    return new Response('Please sign in', { status: 401 });
  }

  const { file, allowed } = await canReadFile(user, id);
  if (!file) return new Response('Not found', { status: 404 });
  if (!allowed) return new Response('Forbidden', { status: 403 });

  // Worksheets: kept by the browser, re-checked with the server every time (304s).
  // Photos of children's work: never stored on the device (shared family phones).
  const isResource = (await db.resource.count({ where: { fileId: file.id } })) > 0;
  const headers: Record<string, string> = { 'Cache-Control': isResource ? 'private, no-cache' : 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  const obj = await openForDownload(file.storageKey, isResource ? req.headers.get('if-none-match') : null);
  if (!obj) return new Response('Not found', { status: 404 });
  if (obj.notModified) return new Response(null, { status: 304, headers: { ...headers, ETag: obj.etag } });
  return new Response(obj.body as BodyInit, {
    headers: { ...headers, 'Content-Type': file.mimeType, 'Content-Disposition': contentDisposition(file.filename), ...(obj.etag && { ETag: obj.etag }) },
  });
}
