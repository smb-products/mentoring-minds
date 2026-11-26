/**
 * Web push on this device: the browser calls behind "Turn on notifications" (Alerts) and Sign out.
 * No imports, and the browser, key and server calls come in as arguments, so the logic can be tested.
 * Push only works with a service worker (registered in production), a VAPID key and PushManager;
 * on iPhone, PushManager only exists once the app is opened from the Home Screen.
 */

/** iPhone or iPad Safari outside the Home Screen app: push isn't available there yet. */
export function needsHomeScreen(win = /** @type {any} */ (globalThis)) {
  const nav = win.navigator;
  if (!nav) return false;
  const ios = /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const standalone = nav.standalone === true || win.matchMedia?.('(display-mode: standalone)').matches === true;
  return ios && !standalone && !('PushManager' in win);
}

/**
 * Whether to offer the button on this device: 'offer', or 'hidden' (no key, no PushManager,
 * no service worker yet, or already subscribed). Never asks for permission.
 */
export async function pushOffer({ key, win = /** @type {any} */ (globalThis) }) {
  try {
    if (!key || !('PushManager' in win) || !win.navigator?.serviceWorker) return 'hidden';
    const reg = await win.navigator.serviceWorker.getRegistration();
    if (!reg?.pushManager) return 'hidden';
    return (await reg.pushManager.getSubscription()) ? 'hidden' : 'offer';
  } catch {
    return 'hidden';
  }
}

/** The VAPID public key (base64url) as the bytes PushManager.subscribe wants. */
export function keyBytes(key) {
  const b64 = (key + '='.repeat((4 - (key.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const BLOCKED = 'Notifications are blocked for this app. Turn them on in your browser’s settings, then try again.';
const FAILED = 'We couldn’t turn on notifications on this device. Try again in a moment.';

/**
 * After a tap: subscribe (the browser asks for permission now), then save the subscription with
 * notifications.savePushSubscription. Returns a Result. If saving fails, the device unsubscribes
 * again so the button is still offered next time.
 */
export async function turnOnPush({ key, save, win = /** @type {any} */ (globalThis) }) {
  let sub;
  try {
    const reg = await win.navigator.serviceWorker.ready;
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  } catch (e) {
    return { ok: false, error: e?.name === 'NotAllowedError' ? BLOCKED : FAILED, code: 'PUSH' };
  }
  const result = await save({ ...sub.toJSON(), userAgent: String(win.navigator.userAgent ?? '').slice(0, 300) });
  if (!result?.ok) await sub.unsubscribe().catch(() => {});
  return result ?? { ok: false, error: FAILED, code: 'PUSH' };
}

/**
 * Before Sign out: forget this device's subscription (server and browser), so a shared family
 * phone stops getting the last parent's alerts. Never throws, and gives up after `timeoutMs`.
 */
export async function forgetPush({ remove, win = /** @type {any} */ (globalThis), timeoutMs = 3000 }) {
  const work = (async () => {
    const reg = await win.navigator?.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    if (!sub) return;
    // Unsubscribe in the browser even if the server call fails: the push service then drops the address.
    await Promise.resolve()
      .then(() => remove({ endpoint: sub.endpoint }))
      .catch(() => {});
    await sub.unsubscribe();
  })().catch(() => {});
  let timer;
  await Promise.race([work, new Promise((resolve) => (timer = setTimeout(resolve, timeoutMs)))]);
  clearTimeout(timer);
}
