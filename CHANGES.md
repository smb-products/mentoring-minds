# Changes to the spec

Any change to `docs/WIRING.md`, `docs/CONTRACT.md`, a locked test or a check in `plan/features.json` that alters
behaviour: date, feature id, what changed, why, who approved. Newest first. Add entries; never edit others.

## 2026-11-26: P-review: report, S15–S23, Javaris's decisions

- **P-review (OSA):** the report is `plan/reports/P-review.md`. Approved: OSA's review; Axis committed it.
- **S15 (launch blocker), S16, S17, S18, S19, S20, S21, S22 (new, held zero):** the review's findings 1, 3, 4, 5, 6,
  8, 10 and 9: the family library's DTO, push links, file clean-up and an upload cap, practice visibility, the
  admin seed, the AI cap counting failures, `mustChangePassword` on the server, and a large answer-key photo.
  Why: P-review. Approved: Axis; Zero reviews.
- **S23 (new, held zero):** Vienne can delete a family or a child on request, with their records and files,
  and asks twice. Why and approved: Javaris, 2026-11-26.
- **Not tickets, Javaris 2026-11-26:** locations wait for his decision, and the production seed is on hold until
  then. Preview accounts keep seeing locations and open times. The Firewall rate limit comes after launch, an
  accepted risk. DEPLOY → Before launch lists all three.
- **S13 check 4 (amend in S13's report), and S15 check 3 the same way:** the contract exception goes in
  `ALLOWED_MISSING`, because the real DTO drops keys the frozen mock has. It isn't an extra key like `.url`.
  Approved: Axis; Zero reviews.

## 2026-11-26: docs after S6, S12 touches

- **Docs after S6 (#57):** README, AGENTS, WIRING, `tests/e2e/README.md` and DEPLOY no longer describe
  `DEMO_MODE` or the in-browser demo. Local work signs in with the demo accounts after `npm run db:seed:demo`.
  DEPLOY's environment table and Before launch item say the app ignores the variable, instead of "the server
  refuses to start with it", which S6 made untrue. README's status and layout describe the app after W8.
  Approved: Axis; Zero reviews.
- **S12 (#58), touches:** add `tests/engines.test.ts`. It fails if `engines.node` stops matching the Node
  major in CI. Why: the amend line in S12's report. Approved after the fact: Axis; Zero reviews.

## 2026-11-26: P-sec's "only a guard before parse()" reads the guard list from guards.ts

- **P-sec, `tests/integration/p-sec.test.ts`:** the check that only a guard runs before `parse()` takes the guard
  names from `src/lib/guards.ts`, not a fixed list of three. Why: S9's new `requireCanMessage` is a guard, and the
  fixed list failed S9 in the merge queue (#56). Nothing else in the test changes. Approved: Zero (the test's
  author); Axis reviews.

## 2026-11-26: the guard skips PRs already in the merge queue

- **Kit, `kit/watch.py`:** a green held PR that's already in the merge queue no longer wakes a lead. Why: a
  queued PR's `autoMergeRequest` is null, so #39 and #40 pinged Axis while they waited on the queue's own CI.
  The queue is read with one GraphQL query (`gh pr list` can't show it). It also skips a PR that conflicts
  with main: its green check is stale and it waits on its author's merge, not a lead (Zero, on #46).
  Approved: Axis; Zero reviews.

## 2026-11-26: S13 and S14 from the P-sec audit

- **S13 (new, held zero):** `content.getFileForUser` checks the account before the lookup and returns a file
  DTO, not the `FileAsset` row. Why: finding S-sec1 (P-sec, #54): a raw row breaks AGENTS rule 3, and NOT_FOUND
  before NOT_ACTIVE let a locked account probe file ids. Approved: Axis; Zero reviews.
- **S14 (new, after S6, held zero):** sign-up caps the password at `MAX_PASSWORD` (200, one constant in
  `src/lib/auth-rules.ts`), as sign-in and change-password do. Why: finding S-sec2 (P-sec, #54):
  a longer one made an account that could never sign in by password. Approved: Axis; Zero reviews.

## 2026-11-26: D5, production migrations are manual (P-ops)

- **Deploy (`scripts/vercel-build.mjs`, `docs/DEPLOY.md` → Releasing, `docs/PRODUCTION_SETUP.md`):** production
  builds no longer run `prisma migrate deploy`. They run `prisma migrate status` and warn. Previews still
  migrate their own database. Auto-assignment of production domains is off, so merges build Staged
  deployments, and Javaris migrates production and then promotes. Why: RULES.md (production migrations are
  Javaris's); finding S-ops1. Approved: Javaris (D5, via OSA).

## 2026-11-26: Javaris's decisions (S6, S9, D5) and new S10, S11, S12

- **S6 (new, held zero):** retire `DEMO_MODE`. Sign-in is always on, and dev signs in with the demo accounts
  after `npm run db:seed:demo`. Why: since W8 removed `src/mock`, demo mode is a persona with no data (Zero's
  spec). Approved: Javaris, 2026-11-26.
- **S9 (new, held zero):** a paused parent can open Messages and message Vienne. Everything else stays locked,
  and preview parents are unchanged. Why: the paused wording says "Message Vienne to turn it back on", and
  `getThread` and `sendMessage` refused them (P-product audit). Approved: Javaris, 2026-11-26.
- **P-ops, D5:** production migrations are manual. Production builds don't migrate, merges build Staged
  deployments, and Javaris migrates and then promotes. Atlas implements it in the P-ops audit. P-ops gets a
  check for it and touches `scripts/vercel-build.mjs`, `tests/vercel-build.test.ts` and
  `docs/PRODUCTION_SETUP.md`. Why: RULES (production migrate is Javaris's); finding S-ops1. Approved: Javaris,
  2026-11-26.
- **`.claude/settings.json` (#52):** leads can read their worktrees in `.wt/`. Logged with #52. Approved:
  Javaris, 2026-11-26.
- **S10 (new, after S6 and S9):** a parent paused while signed in sees the paused screen on the next
  navigation, without a reload. Why: Rigg's FYI on S8 (#50). Approved: Axis; Zero reviews.
- **S11 (new, held zero):** the demo seed refuses a database that doesn't look like dev, test or preview,
  unless `--force`. Why: finding S-ops2 (P-ops, #42); dev uses the demo seed after S6. Approved: Axis; Zero
  reviews.
- **S12 (new, held zero):** `engines.node` is pinned to `22.x`, the version CI tests on. Why: finding S-ops3
  (P-ops, #42). Approved: Axis; Zero reviews.

## 2026-11-26: leads can read their worktrees in `.wt/`

- **Kit, `.claude/settings.json`:** the `Read(./.wt/**)` deny is narrowed to the `.env` files, `node_modules`
  and `.next` inside each worktree, the same things the main checkout denies. Why: RULES say leads work in
  `.wt/`, but the deny (which beats any allow) blocked reading, diffing and editing there, and P-sec and both
  lead seats were stuck on it. Approved: Javaris (via OSA), 2026-11-26; Zero reviews.

## 2026-11-26: S8 from the P-product audit

- **S8 (new, after P-product, lanes):** preview and paused parents get their screen on every parent route, not
  an endless loading skeleton or an uncaught page error. It's done when the two `test.fixme`s in
  `tests/e2e/p-product.spec.ts` pass. Why: the P-product audit (#43). Home never finishes loading for either
  parent, and a preview parent's shell throws "Enter your invite code to unlock this." outside the page's error
  boundary (also Rigg's #23 FYI). No server guard changes. Approved: Axis; Zero reviews.

## 2026-11-26: S1 touches, new S7 and C1, after-the-fact edits in WC, W8 and S5b, AGENTS after W8

- **S1, touches and check 4:** add `src/server/families.ts`. `getFamily` sends a parent who isn't ACTIVE
  `meetingUrl` as null too. Why: Rigg's S1 holdout (#37) found a PAUSED parent getting the video link from
  `getFamily`, which the parent shell calls. The S1 rebuild (fantem) was told before its PR. Approved: Axis; Zero
  reviews.
- **S7 (new, after S1):** `cancelSession` guards first and gives the same `FORBIDDEN` for a missing session id as
  for another family's, as S2–S4 do. Why: Rigg's FYI on #37 (ids could be probed: NOT_FOUND vs FORBIDDEN).
  Approved: Axis; Zero reviews.
- **C1 (new, after S1 and S7):** comments in `src/server`, `src/lib` and the page files stop naming the deleted
  `src/mock`, and `tests/live-adapter.test.ts` stops mocking `../src/mock/core`. No behaviour change. Why: Zero,
  after W8. Approved: Zero.
- **WC (#29), outside its narrowed touches:** fixed one gap in `src/server/ai.ts`: `discardDraft` returns the
  draft, is admin-only, and selects its fields explicitly. It was built under WC's old touches (all of
  `src/server/`). Approved after the fact: Zero.
- **W8 (#36):** deleted the retired `tests/integration/w2-families-invites.test.ts`, outside W8's touches.
  **S5b (#35):** a one-line edit to `tests/integration/jobs-ai.test.ts`,
  outside its touches. Approved after the fact: Zero.
- **AGENTS.md:** State of the repo, the contract command and the Where table describe the app after W8 (every
  area live, the frozen mock in `tests/contract/mock/`, the seed in `prisma/demo/`). Why: agents read it first,
  and it still said the screens ran on the mock. Approved: Axis; Zero reviews.

## 2026-11-26: production-readiness phase after W8

- **Production-readiness phase (new P-sec, P-product, P-ops, P-review):** after W8, an audit in three parts,
  each run by its owner and not a lane (`"role": "audit"`, `"owner"`). P-sec (Zero): guards and `parse()` on
  every export, leak sweep, file access, the named limits, migrations, `npm audit --omit=dev`. P-product (Axis):
  every screen live on a production build with a clean console, PREVIEW and PAUSED parents, phone uploads, the
  DEPLOY Before launch list. P-ops (Atlas): env check, cron and `CRON_SECRET` (plus whether to move
  `vercel.json` from legacy `crons` to Vercel Schedules), private Blob, a Neon restore, spend caps, a rollback
  rehearsed on a preview. P-review (OSA) reviews independently after all three. An audit writes tests, docs and
  its report; a finding that needs app code becomes an S ticket. Production setup waits until W8, and Javaris
  does the clicks. Why: Javaris's decision, via OSA. Approved: Javaris.
- **Kit, `kit/plan.py`:** the checker takes only lane builds (`role` build) for holdouts, so an audit or ops
  ticket marked merged isn't handed to Rigg. Approved: Axis; Zero reviews.

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
