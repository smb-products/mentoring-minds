# Changes to the spec

Any change to `docs/WIRING.md`, `docs/CONTRACT.md`, a locked test or a check in `plan/features.json` that alters
behaviour: date, feature id, what changed, why, who approved. Newest first. Add entries; never edit others.

## 2026-11-26: first plan (plan/features.json: W0, WA, W1–W7, WC, W8)

Folds in Zero's touches review and OSA's wiring review (both 2026-11-26). Approved: Axis (plan); Zero reviews
and merges the plan PR.

- **W0 switches `dashboard` on; W6 is `scheduling` only; W7 is `reports`, `ai`.** Why: `dashboard` is read-only,
  and every parent page and the shell's badges read it. The w2 spec (a new sign-up the mock doesn't know) and the
  w4 spec ("We have it" reads `hasBookAt`) fail without it, and the w6 spec requires it. With it live, the w0 spec
  also runs, so W0 proves itself without a merged W0+W1 ticket, and W1–W4 stay parallel.
- **WIRING Step 1:** the shell takes the user from AppRoot, not the mock's `auth()`. Text size and change password
  go through `live.families` while `families` is on the mock. Why: OSA found `ShellContext.jsx` reads the mock's
  `auth()` (null for real sign-ups), and `AccountMenu.jsx` saved text size to the mock.
- **Step 2 form:** `src/ui/api/index.js` has one area per line under a `// Wn` header. Why: every ticket edits it,
  and one line per area with a header between tickets merges cleanly in parallel (tested on three branches).
- **New WA (adapter):** reads and writes return a plain error (`NETWORK`, `STALE`) instead of an unhandled
  rejection. `useQuery` keeps the last data when a refetch fails. `uploadFile` keeps the caller's mimeType.
  Why: OSA found `live.js` asRead/asWrite have no try/catch, and `live-hooks.js` throws away data on any refetch
  error, which blanks the app (a paused parent hits it every time).
- **New WC (contract writes):** adds mock-vs-real cases for 13 writes the screens call, stops skipping null and
  empty fields, and takes `runDailyReminders` out of READS. It runs after W7 so its `src/server` fixes never
  collide with a ticket in flight.
- **W3:** the push button is hidden silently without a VAPID key, and Sign out removes this device's push
  subscription (shared family phones). **W4, W5:** files open with `window.open` straight in the tap handler
  (iPhone blocks a popup opened after an await). **W6:** reschedule dropped from the click-through, since no
  screen calls `rescheduleSession`.
- **W8:** "delete `src/mock`" moves what's still used instead of losing it: B.E.S.T. data to `src/ui/api/best.js`,
  the demo seed to `prisma/demo/` (same ids), and a frozen copy of the mock to `tests/contract/mock/`, so
  `npm run test:contract` keeps checking the shapes the screens were built on.
- **Kit:** `SHARED_TOUCHES` (`src/ui/api/index.js`) no longer blocks a parallel claim. `PROTECT_MERGE` adds
  `src/server/*`, `src/lib/*` and `src/app/api/*`, so every endpoint change waits for Zero (Zero's request).
