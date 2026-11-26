import 'server-only';
import { sendNotification, setVapidDetails } from 'web-push';
import { db } from './db';

/**
 * Web push (PWA). Sends to every device the user allowed notifications on.
 * Off until the VAPID keys are set (npx web-push generate-vapid-keys).
 * Devices whose subscription has expired (404/410) are removed.
 */
let configured: boolean | undefined;
function ready() {
  if (configured !== undefined) return configured;
  const { NEXT_PUBLIC_VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv, VAPID_SUBJECT: subject } = process.env;
  configured = Boolean(pub && priv);
  if (configured) setVapidDetails(subject || 'mailto:admin@example.com', pub!, priv!);
  return configured;
}

export type PushInput = { title: string; body?: string | null; href?: string | null; tag?: string };

/** What public/sw.js reads: `title`, `body`, `href` (opened on tap) and `tag` (a newer push with the same tag replaces the older one). */
export function pushPayload(payload: PushInput) {
  return { title: payload.title, body: payload.body ?? '', href: payload.href || '/', ...(payload.tag ? { tag: payload.tag } : {}) };
}

export async function pushToUser(userId: string, payload: PushInput) {
  if (!ready()) return 0;
  const subs = await db.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(pushPayload(payload)), {
          TTL: 60 * 60 * 24,
          urgency: 'normal',
        });
        sent += 1;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.pushSubscription.deleteMany({ where: { id: s.id } });
        else console.error('push failed', status, (e as Error).message);
      }
    }),
  );
  return sent;
}
