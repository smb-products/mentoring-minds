# Wiring the screens to the real backend

The screens run on the mock today. The real backend is finished and tested: `src/server` and `npm run test:contract`. Wiring means switching each area of `api` from the mock to the real functions. **The screens themselves don't change.**

## How it fits together

```
screen ──► src/ui/api/index.js ──► src/mock         (today)
                     │
                     └──────────► src/ui/api/live.js ──► src/server/*.ts ──► Postgres
                                  (written, tested, switched off)
```

`live.js` gives the screens exactly what the mock gives them:
- **Reads** return data, or throw an error with `.code` and the server's plain-language message.
- **Writes** return `{ ok, data | error, code }`, and after a successful write every `useQuery` on screen re-runs (`live-hooks.js`).
- **`content.uploadFile({ file, … })`** does the real three-step upload. Both call sites already pass `file`.

**Each ticket has a browser test** in `tests/e2e` (`tests/e2e/README.md`). It skips until the ticket's areas are listed in `LIVE`, then has to pass. Every spec was run against a throwaway copy with all of this wiring done (Step 1 plus every area): all 55 pass. So they test the target behaviour, not the mock.

## Step 0: once

```bash
createdb mm_dev
cp .env.example .env              # set DATABASE_URL / DIRECT_URL to mm_dev, AUTH_SECRET, INVITE_PEPPER
npx prisma migrate deploy
npm run db:seed:demo              # the prototype's families, with the same ids
createdb mm_e2e_test              # for the browser tests (tests/e2e/README.md)
npx playwright install chromium
```

Demo sign-in: `vienne@example.com` or any demo parent (for example `ana.mendoza@example.com`, `grace.kim@example.com`), password `mentoring-demo-2026`.

## Step 1: turn on sign-in (once)

1. Remove `DEMO_MODE="true"` from `.env` (unset means sign-in is on). It's read at build time; `npm run dev` picks it up on restart.
2. In `src/ui/AppRoot.jsx`, take the user from the session instead of the demo persona:
   - **The layouts:** both group layouts (`src/app/(admin|parent)/*/layout.tsx`) already call `auth()` when demo mode is off. Pass `session.user` into `<AppRoot user={…}>`.
   - **AppRoot:** call `setSessionUser(user.id)` only while some areas are still on the mock. Use `user.role` instead of reading it from the URL, and `user.textSize` for the text size.
   - **Account menu:** remove the "Demo account" switcher in `components/shell/AccountMenu.jsx`. "Sign out" calls `signOutNow()` from `src/app/(auth)/sign-in/actions.ts`; it replaces the placeholder toast. After "Text size" saves, call `router.refresh()` so the layout passes the new size down.
   - **New password after a reset:** when `session.user.mustChangePassword` is true (Vienne used "Reset password"), ask for a new one before anything else. Call `families.changePassword({ currentPassword, newPassword })`; it needs the temporary password as `currentPassword`. It signs the parent out on their other devices and keeps this one signed in; if it returns `signInAgain: true`, send them to `/sign-in`. Any parent can also use it from the account panel (a "Change password" row there is part of this step).
3. **Preview parents** (`status: 'PREVIEW'`) see `InviteCodeForm` (`src/components/family`) until they redeem a code. `invites.redeemInvite` does the rest, and the form reloads the app so every screen fetches the unlocked data.

Test: `npm run test:e2e -- w0` (runs once any area is live).

## Step 2: switch areas, one at a time

Replace `src/ui/api/index.js` with:

```js
import { api as mock } from '../../mock';
import { live } from './live';

/** Areas running on the real backend. Add one, test it, commit. */
const LIVE = new Set(['fast']);

export const api = Object.fromEntries(Object.entries(mock).map(([k, v]) => [k, LIVE.has(k) ? live[k] : v]));
export { useQuery, useAction } from './live-hooks';
export { auth, setSessionUser } from '../../mock';
```

A suggested order, from least to most connected. Each is one ticket:

| # | Area | Screens to click through | Notes |
|---|---|---|---|
| W1 | `taxonomy`, `fast` | Content → Skills; Family page → FAST Math results; parent Progress | |
| W2 | `families`, `invites` | Families list and Family page; invite a family; redeem as a new parent | `resetParentPassword` returns a password to show once |
| W3 | `messages`, `notifications` | Messages both sides; Alerts | Push: add a "Turn on notifications" button that calls `PushManager.subscribe` with `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and sends `subscription.toJSON()` (plus `navigator.userAgent`) to `notifications.savePushSubscription`. On iPhone it only works once the app is added to the Home Screen. |
| W4 | `books`, `content` | Content → Book → Answer key; Library; upload a worksheet; parent opens it | Vercel Blob (`BLOB_READ_WRITE_TOKEN` via `vercel env pull`), or the local `./uploads` folder in dev. **Opening a file:** in `ResourceViewer` (`pages/parent/LearningPage.jsx`), replace the "File viewing isn’t part of the prototype" toast with `` window.open(`/api/files/${r.file.id}`, '_blank', 'noopener') ``. |
| W5 | `assignments` | New assignment; parent answer sheet with a photo; Work → check written answers | **Opening a photo:** in `pages/admin/AssignmentPage.jsx`, replace the "Photo viewing isn’t part of the prototype" toast with `` window.open(`/api/files/${photo.file.id}`, '_blank', 'noopener') ``. |
| W6 | `scheduling` | Request, confirm, decline, cancel, reschedule; Join call; complete with a note | |
| W7 | `reports`, `dashboard`, `ai` | Report page; Today; parent Home; "Talk about it" and "Set up from photos" | Needs `ANTHROPIC_API_KEY` |
| W8 | delete `src/mock` | Everything | Then `LIVE` goes away and `index.js` exports `live` directly |

**Done for each area means:**
- [ ] Its browser test passes: `npm run build:e2e && npm run test:e2e -- w4` (W1 → `w1`, and so on), and so do the earlier tickets' tests.
- [ ] `npm run test:contract` is green.
- [ ] Each listed screen works as Vienne and as two parents (Ana: book work; Grace: video calls), with no console errors.
- [ ] A write on one screen shows up on another without a reload, e.g. confirming a request updates Today.
- [ ] An error shows the server's message, e.g. request an already-taken slot → "That time was just booked."

## Things that differ from the mock (all on purpose)

- **Real ids:** new rows get real ids (cuid), not `ses_…`.
- **Vienne's time zone:** "Today" and slot times are computed in Miami time. The mock used the browser's time zone.
- **Privacy:** parents never receive `adminNotes`, private session notes, or Vienne's video room link outside the join window.
- **"Not found" errors** have the code `NOT_FOUND` (the mock said `INVALID`).
- **Practice homework** also notifies the family (the mock didn't).
- **Answer-key photo:** `readAnswerKeyPage` needs `image: { mediaType, base64 }`. `AnswerKeyPage` already sends it, using `shrinkPhoto()`.

## If something doesn't match

`npm run test:contract` names the function and the field, e.g. `scheduling.listSessions (u_ana): missing in real: [].note.skills`. Fix the server function (`src/server`), not the screen. Add a contract case for anything new.
