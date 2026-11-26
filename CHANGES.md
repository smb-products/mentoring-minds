# Changes to the spec

Any change to `docs/WIRING.md`, `docs/CONTRACT.md`, a locked test or a check in `plan/features.json` that alters
behaviour: date, feature id, what changed, why, who approved. Newest first. Add entries; never edit others.

## 2026-11-26: S1 widened, new S5b, same FORBIDDEN for S3 and S4, WC narrowed, W6 and W7 outside touches

- **S1, checks 4 and 5 (new):** `listSessions` sends `meetingUrl` as null to a family whose status isn't ACTIVE
  (its sessions are still listed). `joinCall` calls `requireActive` before any lookup, and gives the same
  `FORBIDDEN` for a missing session id as for another family's. Why: Rigg's W6 holdout review (#23), confirmed
  by Zero. A paused parent could get the video link inside the join window, and `joinCall` looked the session
  up before its guard. Approved: Zero.
- **S5b (new lead ticket, after S5):** `redeemInvite` reads the account's failure count again inside the
  advisory lock, and a right code is checked against `GLOBAL_REDEEM_FAILURES_PER_HOUR` under the same lock.
  The daily `cleanUp` deletes `RedeemFailure` rows older than a day. Why: parallel tries from one account
  undercount `MAX_FAILURES` (Zero, older than S5). S5's global check runs outside the lock, so a burst could
  let a right code through past the limit (Rigg's S5 review). No limit changes. Approved: Zero.
- **S3, check 2:** another family's submission id gets the same `FORBIDDEN` (not `NOT_FOUND`) as a missing one.
  Why: `tests/integration/permissions.test.ts` (locked) expects `FORBIDDEN`, as in S2. From the amend on #22;
  the plan text now matches what merged. Approved: Zero.
- **S4, checks 1 and 2:** `getReport` calls `requireActive` first. A missing report id and another family's
  report (draft or published) get the same `FORBIDDEN`. A family's own report that isn't published yet still gets
  `NOT_FOUND`, and so does Vienne for a missing id. Why: Rigg's W7 holdout (#26, merged) and
  `permissions.test.ts` lock `FORBIDDEN` for another family's report, so the old `NOT_FOUND` wording couldn't pass.
  Soap was told before S4's PR. Approved: Axis; Zero reviews.
- **WC, touches and check 4:** touches are `tests/contract/`, `src/ui/api/live.js` and the report, not all of
  `src/server/`, and WC is no longer held. A gap a new case finds is marked `it.skip` with a `// GAP:` line
  and listed in the report, and a lead adds an S ticket for the server fix. Why: `src/server/` overlapped every
  S ticket, so no lane could claim WC (OSA). Approved: Axis; Zero reviews.
- **W6 r1 (#25), outside W6's touches:** `src/ui/lib/format.js` and the scheduling screens show dates and times in
  Settings.timezone (Miami), not the device's zone, plus `tests/format-zone.test.ts`. The plan's W6 touches now
  list them. Why: W6 check 8 (Rigg's holdout, #23) can't pass from `src/server` alone. `format.js` writes in the
  zone by hand, matching the schema default; it has to read it if the timezone ever becomes editable. Approved
  after the fact: Axis.
- **W7 (#24), `tests/integration/w2-families-invites.test.ts` (merged):** two switch tests now assert every area
  is live, since from W7 none is left on the mock. Guard tests unchanged. Approved after the fact: Zero.
- **Kit, `kit/watch.py`:** a green held PR wakes the seat in its `owner:<seat>` label first, then the plan's
  `held`, then `HELD_OWNER`. Why: Zero was woken for #12, #14 and #17, which Axis had already claimed.
  Approved: Axis; Zero reviews.

## 2026-11-26: W3 spec amend, W4 browser, holdout specs, lane drafts

- **S2, check 2:** a family gets the same `FORBIDDEN` (not `NOT_FOUND`) for another family's result id as
  for a missing one. Why: `tests/integration/permissions.test.ts` (locked) expects `FORBIDDEN`, and one
  uniform answer still hides which results exist. Vienne keeps `NOT_FOUND` for a missing id. From the amend on
  #15. Approved: Zero.

- **W3, `tests/e2e/w3-messages-notifications.spec.ts` (locked):** test 1's two lookups in Vienne's thread are
  scoped to the thread (`getByRole('log', { name: 'Messages' })`), not all of `main`. Why: on desktop the inbox
  row beside the open thread previews the same message, so the lookup matched 2 elements (strict mode). PR #11's
  CI shows it at line 23, flaky and passing only on retry. Same behaviour checked, narrower locator. From
  Soap's amend on #11. Approved: Axis.
- **W4, `playwright.config.ts`:** without `E2E_CHROME_PATH`, the browser tests run full Chromium
  (`channel: 'chromium'`), not the headless shell. Why: the shell has no PDF viewer and downloads PDFs, so W4
  check 4 (a worksheet opens in a new tab) can't pass. It merged in #10 outside W4's touches; approved after the
  fact: Axis.
- **Holdouts, `playwright.config.ts`:** the `holdout` project matches `**/*.spec.ts` only. Why: it also loaded
  the vitest files in `tests/holdout/`, which broke the whole browser run (0 tests listed). Found by Rigg on #14.
  Approved: Axis.
- **RULES, Ownership; `kit/lane.py`:** lanes never open drafts, and the lane marks its PR ready before queuing.
  A lane PR that mustn't merge yet ends `status: blocked` and says why. Why: Rigg's #14 opened as a draft, so
  auto-merge failed. Approved: Axis; Zero reviews.

## 2026-11-26: W2 real sign-ups, red builder PRs

- **W2, WIRING Step 2:** while areas are on the mock, a signed-in user the mock doesn't know gets every area
  from the real backend (`src/ui/api/index.js` export line, decided per call). Why: W2's PR #9 failed in CI
  because Rosa, a real sign-up, lands on parent Home, which mounts `RequestSessionDrawer` and reads
  `scheduling.listLocations` from the mock, and the mock throws "Please sign in." for her. The spec is right; the
  plan had a gap. Approved: Axis; Zero reviews.
- **W2 attempt 1 doesn't count.** Its failure came from the plan gap, and its local green from lanes sharing e2e
  port 3200 and the test databases. W2 is reopened from main once the lane isolation and this plan merge.
  Approved: Axis (W2's owner, per OSA).
- **Kit:** `kit/plan.py refresh` tells OSA and the feature's `held` lead when a builder's PR is red in CI, once
  per head commit. Why: PR #9 sat in `review` with nobody told. Approved: Axis; Zero reviews.
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
