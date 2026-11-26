# Changes to the spec

Any change to `docs/WIRING.md`, `docs/CONTRACT.md`, a locked test or a check in `plan/features.json` that alters
behaviour: date, feature id, what changed, why, who approved. Newest first. Add entries; never edit others.

## 2026-11-26: S5 lock rows, WC touches, held PRs

- **S5:** a refusal while locked (global or per-account) adds no `RedeemFailure` row, and
  `RedeemFailure.userId` references `User` with `onDelete: Cascade`. Why: without the first, one locked account
  keeps the global count up and holds every family out; without the second, deleting a user fails. Needed before
  W2 merges, since S5 is claimable after that. Approved: Zero.
- **WC:** touches add `src/ui/api/live.js` (its READS check edits that line). Approved: Zero.
- **Every feature:** a `held` field names the lead who merges it when its touches hit `PROTECT_MERGE`, and
  `kit/plan.py lint` enforces it. Why: WA's PR was held for Zero without warning. Approved: Axis; Zero reviews.
- **RULES, Ownership:** a held PR merges only when its author marks it final (leads' PRs open as drafts), at the
  reviewed head. Why: PR #1 merged before its author's last push. Approved: Axis; Zero reviews.

## 2026-11-26: server fixes S1–S5 (plan/features.json)

From OSA's wiring review, specified by Zero. Each one waits for its area's wiring ticket so its touches never
overlap a build in progress.

- **S1:** `scheduling.listTimeOff` is admin-only; a parent gets `FORBIDDEN`. Why: it returned raw rows with
  Vienne's reasons to any signed-in family. Approved: Zero.
- **S2:** a FAST edit keeps `enteredById`/`enteredAt`, so a result Ana entered still says "Entered by Ana" after
  Vienne edits it, and Ana can still edit it. `deleteResult` guards first. Approved: Zero.
- **S3, S4:** `saveAnswerDraft`, `submitAnswerSheet`, `markPracticeDone` and `getReport` guard before any lookup,
  and another family's id gets the same `NOT_FOUND` as a missing one. Approved: Zero.
- **S5, new limit:** `GLOBAL_REDEEM_FAILURES_PER_HOUR = 30` (`src/server/invites.ts`). Past it, every redeem
  returns `LOCKED`: "Too many tries right now. Try again in an hour, or ask Vienne to check the code." Vienne
  gets one alert. Failures are logged in a new `RedeemFailure` table. Why: with ~1.05M codes, free accounts and only
  a per-account lock, 1,000 accounts could try 3M+ codes in a code's 14 days. `MAX_FAILURES`, `LOCK_MS` and the
  MM-XXXX shape don't change. Approved: Zero.

## 2026-11-26: plan revised after review (plan/features.json: W0, WA, W1–W7, WC, W8)

Folds in Zero's touches review and OSA's wiring review (both 2026-11-26). PR #1 merged the first version; these
changes replace it. Approved: Axis (plan); Zero reviews and merges the plan PR.

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

## 2026-11-26: first plan (plan/features.json, W0–W8)

- **W6, W7:** `dashboard` goes live in W6, not W7. Why: `w6-scheduling.spec.ts` requires `dashboard` (confirm
  from Today, Join call from Home), and W7's spec requires `scheduling`, so the old split couldn't pass in order.
  W7 is now `reports`, `ai`. WIRING table updated. Approved: Axis (plan), Zero reviews in the plan PR.
- **W0, Step 2:** W0 writes `src/ui/api/index.js` with every area on its own commented line under a `// Wn`
  header, and ships with none live. Why: every ticket edits this file; one line per area, with a header between
  tickets, lets parallel tickets merge cleanly. The w0 spec skips with none live, so W0 is proven with one area
  uncommented locally. Approved: Axis, Zero reviews.
- **W8:** "delete `src/mock`" moves what's still used instead of losing it: B.E.S.T. data to `src/ui/api/best.js`,
  the demo seed to `prisma/demo/` (same ids), and a frozen copy of the mock to `tests/contract/mock/` so
  `npm run test:contract` keeps checking the shapes the screens were built on. Approved: Axis, Zero reviews.
- **Kit:** `SHARED_TOUCHES` in `kit/project.env` (`src/ui/api/index.js`) no longer blocks a parallel claim, so
  W1–W4 can run on three lanes at once. Approved: Axis, Zero reviews.
