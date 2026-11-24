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

This was checked in a real production build: email sign-in, the FAST area live, a result read from Postgres and a new result saved through the screen.

## Step 0: once

```bash
createdb mm_dev
cp .env.example .env              # set DATABASE_URL / DIRECT_URL to mm_dev, AUTH_SECRET, INVITE_PEPPER
npx prisma migrate deploy
npm run db:seed:demo              # the prototype's families, with the same ids
```

Demo sign-in: `vienne@example.com` or any demo parent (for example `ana.mendoza@example.com`, `grace.kim@example.com`), password `mentoring-demo-2026`.

## Step 1: turn on sign-in (once)

1. Set `DEMO_MODE=false` in `.env`. It's read at build time; `npm run dev` picks it up on restart.
2. In `src/ui/AppRoot.jsx`, take the user from the session instead of the demo persona:
   - **The layouts:** both group layouts (`src/app/(admin|parent)/*/layout.tsx`) already call `auth()` when demo mode is off. Pass `session.user` into `<AppRoot user={…}>`.
   - **AppRoot:** call `setSessionUser(user.id)` only while some areas are still on the mock. Use `user.role` instead of reading it from the URL, and `user.textSize` for the text size.
   - **Account menu:** remove the "Demo account" switcher in `components/shell/AccountMenu.jsx`.
3. **Preview parents** (`status: 'PREVIEW'`) see `InviteCodeForm` (`src/components/family`) until they redeem a code. `invites.redeemInvite` does the rest.

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
| W1 | `taxonomy`, `fast` | Settings → Skills; Family page → School test results; parent Progress | |
| W2 | `families`, `invites` | Families list and Family page; invite a family; redeem as a new parent | `resetParentPassword` returns a password to show once |
| W3 | `messages`, `notifications` | Messages both sides; Alerts | Push: add a "Turn on notifications" button that calls `PushManager.subscribe` with `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and sends `subscription.toJSON()` (plus `navigator.userAgent`) to `notifications.savePushSubscription`. On iPhone it only works once the app is added to the Home Screen. |
| W4 | `books`, `content` | Content → Book → Answer key; Library; upload a worksheet | Vercel Blob (`BLOB_READ_WRITE_TOKEN` via `vercel env pull`), or the local `./uploads` folder in dev |
| W5 | `assignments` | New assignment; parent answer sheet with a photo; Work → check written answers | |
| W6 | `scheduling` | Request, confirm, decline, cancel, reschedule; Join call; complete with a note | |
| W7 | `reports`, `dashboard`, `ai` | Report page; Today; parent Home; "Talk about it" and "Set up from photos" | Needs `ANTHROPIC_API_KEY` |
| W8 | delete `src/mock` | Everything | Then `LIVE` goes away and `index.js` exports `live` directly |

**Done for each area means:**
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
