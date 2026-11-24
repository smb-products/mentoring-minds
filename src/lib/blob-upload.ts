import 'server-only';
import { db } from './db';

/**
 * The rule for issuing a Vercel Blob client-upload token (used by /api/files/blob).
 * A token is only given for a reservation made by content.createUpload: the same
 * signed-in user, the exact reserved pathname, not yet uploaded, and it only allows
 * that file's type and declared size. The browser can't choose where a file goes.
 */
export async function authorizeBlobUpload(userId: string | null | undefined, pathname: string, clientPayload: string | null) {
  if (!userId) throw new Error('Please sign in.');
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, status: true } });
  if (!user || (user.role !== 'ADMIN' && user.status !== 'ACTIVE')) throw new Error('Your account can’t upload files.');
  const file = clientPayload ? await db.fileAsset.findUnique({ where: { id: clientPayload } }) : null;
  if (!file || file.uploadedById !== userId || file.uploadedAt || file.storageKey !== pathname) throw new Error('That upload wasn’t reserved.');
  if (Date.now() - file.createdAt.getTime() > 60 * 60 * 1000) throw new Error('That upload expired. Try again.');
  return {
    allowedContentTypes: [file.mimeType],
    maximumSizeInBytes: file.sizeBytes,
    addRandomSuffix: false,
    allowOverwrite: false,
    validUntil: Date.now() + 10 * 60 * 1000,
    tokenPayload: file.id,
  };
}
