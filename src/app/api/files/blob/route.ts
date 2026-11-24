import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { auth } from '@/lib/auth';
import { authorizeBlobUpload } from '@/lib/blob-upload';

/**
 * POST /api/files/blob — Vercel Blob client uploads. The browser asks here for a
 * one-file upload token (lib/blob-upload.ts decides), then sends the bytes straight
 * to the private store. Blob also calls this route when an upload completes; nothing
 * is saved then — content.finishUpload checks the file's size and real type.
 */
export async function POST(request: Request) {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: 'Bad request' }, { status: 400 });
  }
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const session = await auth();
        return authorizeBlobUpload(session?.user?.id, pathname, clientPayload);
      },
      onUploadCompleted: async () => {
        // Intentionally empty: finishUpload is the checkpoint (it also works locally,
        // where Blob can't call back).
      },
    });
    return Response.json(result);
  } catch (e) {
    // 400: Blob doesn't retry. The message is shown to the person uploading.
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
