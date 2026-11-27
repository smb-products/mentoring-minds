# Changes to the spec

Any change to `docs/WIRING.md`, `docs/CONTRACT.md`, a locked test or a check in `plan/features.json` that alters
behaviour: date, feature id, what changed, why, who approved. Newest first. Add entries; never edit others.

## 2026-11-27: L4's header under 480px (lead amend)

- **L4 (#160), lead amend on f/L4:** under 480px the landing header shows only the logo, the name and **Sign in**.
  Services, Rates and Get started are hidden, because the hero already has the call to action. The name has
  `min-width: 0` with an ellipsis, and the header stays on one row. Nothing else changes.
- Why: holdout `tests/holdout/L3.spec.ts` (320px: Sign in must clear the name) failed on #160, because the
  header's nav overlapped the name. L4 had used its two attempts. Approved: Javaris (2026-11-27, via OSA),
  option A, a lead amend.

## 2026-11-27: L4 lead edits on #160; the L2 holdout's real cause

- **L4, check 3 (Fantem's amend):** the sample card's child is "Ella, grade 3", a name that's in no family's data,
  not even the demo seed's. It replaces the mockup's Mateo, so the five holdouts that ban seed names on `/` (L1,
  L3, R3, W8 ×2) hold as written. An earlier pick, Emma, turned out to be a planned student in the demo seed;
  Zero caught it.
- **Lead edits to holdouts:** `tests/holdout/L1.spec.ts` and `tests/holdout/L3.spec.ts` read Landing C's hero and
  subhead instead of L3's.
- **The L2 holdout's failure was not a timeout:**
  - Since R1, the Alerts rail button's accessible name starts with its unread count ("1 Alerts"), and
    `openAlerts` in `tests/e2e/support/ui.ts` matched only `^Alerts`, so the test failed whenever the parent had
    an unread alert.
  - The helper now allows the count in front. #158's `test.slow()` is harmless, but it wasn't the fix.
- Why: L4's report and OSA's mockup approval, with Javaris waiting to launch. Approved: Axis (lead), OSA (L4's look),
  Zero (review).

## 2026-11-27: L2 reopened, the limits count every request

- **L2 (check 6, new):** the per-IP and overall limits count every request that passes validation, repeats of
  an earlier email included. They're recorded in a new `InviteAttempt` table (hashed IP and time only, deleted
  after a day). Stored requests and their alerts don't change. The pause alert says "20 … in the last hour",
  since it trips at the limit.
- **docs/DEPLOY.md → Limits:** the two rows say how requests are counted.
- Why: Rigg's L2 holdout (`plan/holdouts/L2.test.ts`) shows checks 4 and 5 can't both hold while repeats go
  uncounted. Details are in the test. Approved: Zero (lead; L2 is held for Zero).
## 2026-11-27: Landing C (L4 rewritten)

- **L4 becomes "Landing C":** the page Javaris picked from OSA's mockups, "Bright and clear".
  - The mockup is committed as `docs/design/landing-c.html`, and L4 matches it section by section.
  - On top of it: Inter, weight 700 for titles, line icons on the trust and service tiles, and the 32px logo mark
    in the header. On phones, 2 trust tiles per row, 1 service per row and full-width buttons.
  - The progress card is labelled as demo data, and L2's real form sits in the dark panel, restyled.
  - L4 may update the L1 and L3 specs where C replaces what they check. L2's spec must still pass.
  - It ends blocked, so OSA can compare it to the mockup before it queues.
- **docs/DESIGN.md:** a Landing C section, replacing L3's. Only the landing page may use 700, 24–32px corners,
  the graph-paper and highlight patterns, and its own pastel tokens. The app keeps its rules.
- **L2:** its touches drop `src/components/landing/`, because its redo is server-only, so L4 can run now.
- Why: Javaris picked direction C (2026-11-27, via OSA). Approved: Javaris.
## 2026-11-27: S35 reopened, not found only when final; a refused id is not found

- **S35 (needs_checks, new check 3):**
  - The "couldn't find" message waits until every read the page depends on has come back, so a slow connection
    never shows it for a real assignment.
  - An id the server refuses as INVALID (garbled or too long) gets the same message and link as NOT_FOUND, with
    no console error.
  - S35 may change src/ui/api/live-hooks.js only to stop logging INVALID and NOT_FOUND reads.
  - Why: Rigg's S35 holdout (`plan/holdouts/S35.spec.ts`). Approved: Axis (lead).

## 2026-11-27: /privacy accuracy updates; L3 amend; L4 landing copy; R1 check 4 says text-field

- **/privacy (accuracy, not new policy):**
  - The invite-request item also names the child's grade, and the hashed internet address used only to stop
    spam. Both are deleted after 90 days (L2 stores both).
  - "Who else handles it" adds the phone's notification service (Apple or Google), which delivers alerts when
    notifications are on, since push is being turned on.
  - Why: Zero's review of #148. These are accuracy updates under Javaris's approval of the wording
    (2026-11-27, via OSA).
- **L3 amend (#151, Soap):** check 4 also lets L3 drop `|Elliott` from the L1 spec's no-bio regex, because the
  approved subhead names Vienne Elliott. Her full name is already public in the README and DEPLOY. The email,
  phone and photo checks stay. Approved: Axis (lead).
- **L4 (new, not held, after L3), "Landing copy":**
  - The payment methods are capitalized, with no leading "the" ("Step Up For Students scholarship").
  - On desktop, the Rates panel sits beside "In person or online"; on phones they stack.
  - L4 may update the payment strings in the L1 and L3 specs.
  - Why: OSA's taste note on L3 (#151). It doesn't block launch.
- **R1 check 4:** the scale's token list says `text-field`, not `text-input`, to match check 2's rename. This
  is Fantem's amend on #147, accepted by Zero.

## 2026-11-27: /privacy wording approved

- **L1's /privacy page:** Javaris approved the wording with two edits.
  - The account item names the phone number (User.phone). Google shares only name and email.
  - The invite-request item lists name, email, phone and message.
  - A new section after "Who sees it", titled "Who else handles it", says it's never sold or shared, and only
    Vercel, Neon and Google (with Google sign-in) handle it.

  It's a lead edit of the approved copy, outside any ticket. The L1 spec's headings and phrases still hold.
  Approved: Javaris (2026-11-27, via OSA).

## 2026-11-27: S35, unknown ids say so; band height with tabs; docs tidy

- **S35 (new, not held):** a detail page opened with an unknown id, or a parent opening another family's
  assignment, shows "We couldn’t find that …" with a link back, instead of loading forever. Why: Rigg's
  holdout batch (#144) found `/parent/learning/<unknown id>` stuck on the skeleton. Nothing leaked. Approved:
  Axis (lead).
- **L2 amends (#145, Fantem; accepted by Zero):**
  - Check 6: REQUEST_KEEP_DAYS is mirrored in src/lib/jobs.ts, because the daily job can't import from a
    'use server' file, and a test keeps the two equal. DEPLOY → Limits says so.
  - Touches add src/server/notifications.ts (the feed omits inviteRequestId), s21's ALLOWED list and the s33
    migration test.
- **docs/DESIGN.md:** a band with tabs may be about 150px. The ~120px figure is for bands without tabs. Why:
  R3's band measured 149px with tabs, and Rigg's holdout caps only bands without tabs (#144).
- **Docs only:**
  - WIRING drops the commented `'ai'` line and the answer-key photo bullet, which S33 removed (Rigg's nit,
    via Zero).
  - PRODUCTION_SETUP Part 7 step 3 now expects the landing page at `PROD_URL`, since L1.

## 2026-11-27: R1 reopened, fields are 15px on phones

- **R1 (needs_checks, then ready after R2 and L1 merge):** new check 2.
  - At 390px every field computes 16px, and at 1280px 14px.
  - The type token becomes `text-field`, renamed everywhere, because `text-input` collided with
    `--color-input`. Tailwind set only a gray color and no size, so iOS zoomed on focus.
  - The design source test now fails on any type token that shares a name with a color token.
- **docs/DESIGN.md:** the field token is renamed and the rule is written down. Other tickets' checks say
  `text-field`.
- Why: Rigg's R1 holdout (#140, `plan/holdouts/R1.spec.ts`). The old source test only read class names.
  Approved: Axis (lead), Zero reviews.

## 2026-11-27: L3 landing polish; holdouts S6 and S29 let / be the landing page

- **L3 (new, not held, after L2):** a landing polish pass.
  - The hero becomes 'K–6' with an en dash, at a new text-display size (30/40px), with a subhead naming Vienne,
    on a light-gray band.
  - A 44px logo, and a Sign in link at top right.
  - Rates become one bordered panel with $50 large.
  - Numbered how-it-works steps, 'In person or online' on a gray band, and no <hr>.
  - L3 may change only the hero string in tests/e2e/l1-landing.spec.ts.
  - Why: OSA's taste review of L1 (#136), under Javaris's landing approval. Approved: OSA.
- **Lead edit to holdouts (on #136, commit 6c3d58c):**
  - `tests/holdout/S6.spec.ts` (its signed-out route list and its after-sign-out list) and
    `tests/holdout/S29.spec.ts` no longer include `/`.
  - Why: L1 makes `/` the public landing page, as already done for `auth.spec.ts`. Builders can't edit
    holdouts. Approved: Axis (lead).

## 2026-11-27: R2, R3 and L1 take OSA's taste review of R1

- **docs/DESIGN.md:**
  - No 700 weight: 600 for headings, 500 for labels.
  - The band holds only back, title, subtitle and actions, about 120px. Stat rows and child chips sit below it,
    and on phone Home the band ends above the chips.
  - Date tiles are light gray with navy text, and child chips are 6px.
- **R2:**
  - The same, on the parent screens.
  - It now also owns the shared components (ui/, shell/, SessionParts, Thread, FastResults) for these fixes,
    since R1 is done.
  - Its spec measures the band.
- **R3:** the weights, and the stat rows moved out of the band on Vienne's screens.
- **L1:** the sign-in card has 8px corners.
- Why: OSA's review of R1 (#133) from production screenshots; R1 merges as is. Approved: OSA (taste review,
  under Javaris's restyle approval of 2026-11-27).

## 2026-11-27: the restyle and the landing page (R1–R3, L1, L2)

- **docs/DESIGN.md (new)** is the spec for how the app looks:
  - Inter instead of Fredoka and Nunito, and a smaller named type scale (body 14px on desktop, 15px on phone;
    page titles about 24px).
  - 6–8px corners, no pills, flat solid buttons with no gradients or glows.
  - One blue accent on navy, white and grays, with neutral level badges.
  - No brain line-art in the header, and a slimmer band.
  - A text wordmark in the app; the brain logo only on the landing page and sign-in.
  - Stars off the parent Home and Progress stats.

  **AGENTS.md rule 10** changes from "don't change the look while wiring" to "the look follows docs/DESIGN.md".
  Layouts, wording and every label a test reads stay.
- **R1 (held for Zero; after S33):** tokens, the Inter font, and the shared components and shell.
- **R2, R3 and L1 (after R1, in parallel):**
  - R2 restyles the parent screens, including the phone Home with the next session in view.
  - R3 restyles Vienne's screens, after S33 too.
  - L1 is the public landing page at / for signed-out visitors, on https://mentoringmindsacademy.org with
    canonical, Open Graph and a text-only next/og image. It also adds a plain-language /privacy page, linked
    from the footer and sign-in, a restyled sign-in, and the installed app now starts at /sign-in.
- **L2 (held for Zero; after L1 and S33), from Zero's spec:** a "Request an invite" form that reaches Vienne's
  alerts.
  - It's the one guardless export (p-sec PUBLIC, plus a sentence in AGENTS rule 1).
  - It has a honeypot, and the same { received: true } answer every time.
  - Limits: REQUESTS_PER_IP_PER_HOUR 3 (hashed IP), REQUESTS_PER_HOUR 20, DUPLICATE_EMAIL_HOURS 24.
  - Requests are deleted after REQUEST_KEEP_DAYS 90.
  - There's an add-only InviteRequest table, and no account is created.
- **P-ops check 8 (new):** the domain and its redirects, from Atlas's #130.
- **S34 is dropped (#127 closed):** its rates and services move to the landing page.
- **Lead edit to a locked test:** `tests/e2e/auth.spec.ts`'s "signed out, every screen goes to sign-in" no
  longer lists `/`, which becomes the landing page. L1's spec checks `/` instead.
- Why: Javaris wants a professional look and a public page before launch. Approved: Javaris (2026-11-27, via OSA).

## 2026-11-27: S33, no AI for launch

- **S33 (new, held for Zero):** the voice session-note draft ("Talk about it") and the answer-key photo read
  ("Set up from photos") are removed, not hidden. That covers the UI, src/server/ai.ts, src/lib/ai/, the Claude
  SDK, the AiDraft table and its enums, the VOICE and PHOTO values (NoteSource and KeySource are recreated without
  them; the source columns stay, always TYPED), AGENTS.md rule 9 and the microphone permission in next.config.ts. Typing is the only way to
  write a note or an answer key. Why: Javaris doesn't want AI at launch. Production is empty and not migrated
  yet, so the drop migration loses nothing. Approved: Javaris (2026-11-27, via OSA).
- **Retired:** W7 checks 4–6, S20 and S22 (the AI helpers, the AI daily cap and the photo size limit), and
  AI_DAILY_LIMIT in P-sec check 4. P-ops check 5 now asks for the Vercel and Neon caps and no
  `ANTHROPIC_API_KEY`, instead of a Claude Console limit.
- **Lead edits to locked tests**, so main stays green before S33 lands:
  - deleted `tests/holdout/S20.test.ts`, `tests/holdout/S22.test.ts`, `tests/holdout/S22.spec.ts` and
    `tests/e2e/s22-answer-key-photo.spec.ts`;
  - removed the AI cases from `tests/holdout/W7.test.ts`, `tests/holdout/WC.test.ts` (the `discardDraft`
    refusals and the draft in the snapshot) and `tests/e2e/w7-reports-dashboard-ai.spec.ts` (both AI tests,
    and `ai` from its `requires`).
  S33's new tests check that the controls are gone and typing still works.
- **Docs:** PRODUCTION_SETUP no longer asks for a Claude key (Part 5) or a Claude Console limit (Part 8).
  DEPLOY and COSTS drop the Claude rows, and Before launch tracks S33. DEPLOY's `AI_DAILY_LIMIT` row under Limits
  stays until S33, because `p-sec.test.ts` reads it while the constant exists.

## 2026-11-26: S23 closed, delete runbook by id

- **S23 (closed):** marked `superseded` in the plan. S23b replaced its name and email matching with ids, and S23b
  is merged and checked. Why: OSA's handoff asked for it to be closed. Approved: Axis (lead), Zero reviews.
- **DEPLOY, Deleting a family or a child:** the "Not available yet" note is gone, and step 5 now says what S23b
  does: only the code the parent used is touched, codes they never used stay (Vienne revokes an active one), and
  alerts go by their link, never by name. Why: S23b merged. Docs only, no check changes.

## 2026-11-26: S30, the joined alert stops naming children

- **S30 (new, held for Zero):** an alert linked only to a family never names a child. The joined alert says
  "Invite code used. 2 children added." Why: Rigg (#112) found that deleting one child left the family's joined
  alert naming that child. Removing it by name would break S23b's ids-only rule, so the alert stops naming
  children. Approved: Zero (decision), Axis.
  MESSAGE_RECEIVED is family-only too. Its body, the family's own words, is exempt, and its title names only
  the parent (Zero's review).
- **Accepted, no ticket:** what a family wrote themselves, such as a message that mentions a child, stays after
  that child alone is deleted. It goes when the family is deleted, as S23b intends. Approved: Zero, Axis.
- **S31 (new, not held):** any `?error=` code on /sign-in gets a plain message. An inherited name such as
  `constructor` or `__proto__` returned a 500. From Rigg's #119 note. Approved: Axis, Zero.
- **S32 (new, held for Zero):** the locations file refuses control characters before anything is saved. A NUL
  passed validation, then the database refused it after the day-one data was already written. From Rigg's #119
  note. Approved: Axis, Zero.
## 2026-11-26: S28 reopened, two cases

- **S28 check 1:** a path whose folder or file name starts with two dots (`..places/…`) inside the checkout
  is still inside, and is refused. **Check 3:** a refusal never prints anything the file holds, field names
  and unknown keys included. It names only the entry number and the problem. **Check 4** adds the holdout
  `plan/holdouts/S28.test.ts`. Why: Rigg's holdout reopened S28 on both cases. The second could print a real
  place into a log. Approved: Axis; Zero reviews.

## 2026-11-26: AGENTS.md keeps Next's agent-rules block; S29

- **AGENTS.md:** commits the `nextjs-agent-rules` block that `next dev` 16.4 appends on every start. It tells
  agents to read `node_modules/next/dist/docs/`, as CLAUDE.md already does. Committing it keeps the main checkout
  clean, so lane pulls never stop on a dirty AGENTS.md. Turning it off instead would mean a config option in
  next.config.ts, which isn't the plan's file. Why: OSA found the main checkout dirtied by it. Approved: Axis;
  Zero reviews.
- **S29 (new, not held):** the sign-in screen hydrates without a mismatch. First it reproduces the warning in a
  clean browser, on dev and on a production build, and fixes it only if it shows. Why: OSA's dev screenshots
  showed a mismatch on /sign-in. Approved: Axis.
## 2026-11-26: two S27 holdout cases retired by S23b

- **`tests/holdout/S27.spec.ts`, first two cases (lead edit):** now `test.skip`, with a comment. They assert
  that Vienne's family page has no Delete button, while S23b check 7 brings Delete family and Delete child back.
  They failed S23b (#107) in the merge queue. The third case (other people never reach her family page) stays.
  Why: S23b replaces S27, which was only an interim. Approved: Javaris (S23b and S27, 2026-11-26); Zero made the
  edit; Axis reviews.

## 2026-11-26: S28, locations at seed time; an S23 holdout case retired

- **S28 (new, held for Zero):** the production seed adds no demo location. It reads the real ones from a JSON
  file outside the repo, named by `SEED_LOCATIONS_FILE`, with entries `{ name, kind, address? }`. It validates
  them first and refuses an empty list. A re-run skips names that are already there and never overwrites
  them. The demo seed keeps its demo locations. Why: the P-review hold on the production seed. Real places
  must never be in the repo, docs, tests or messages. **Approved by Javaris, 2026-11-26.**
- **Lead edit, `tests/holdout/S23.test.ts`:** its revoked-code case ("an earlier code Vienne revoked for the
  same parent" loses the deleted child) is retired. It contradicts S23b checks 3 and 6, which Javaris
  approved: a code nobody redeemed stays as it is. S23b's check 8 says so. Why: Fantem flagged the conflict
  while building S23b. Approved: Axis, as a lead.

## 2026-11-26: S23b, delete by id only; S27 hides Delete until then

- **S23b (new, held for Zero):** deleting a family or a child matches only by id. That means the parent's and
  child's ids, `Invite.usedById`, a student id stored on each planned entry at redemption, and an add-only id
  link on alerts. Nothing is matched by name, email or text pattern. The checks list what each delete removes,
  and they name three holdout cases: the underscore email, lower-case names, and same-first-name alerts.
  Unredeemed codes stay, and a lower-case name on one stays too, which retires the second case of
  `plan/holdouts/S23.test.ts`. Why: S23 was reopened twice. Round 2 found that an email match acting as a
  wildcard let a family delete remove another family's code. The name and email matching came from the S23
  checks I wrote in #93, and that was the plan's error. Zero wrote the data rules.
  The code that creates an alert passes its child or family id, so the touches add those files (Zero's review).
  **Approved by Javaris, 2026-11-26.**
- **S27 (new, not held):** hides Delete family and Delete child on main until S23b lands. It runs ahead of
  S23b. **Approved by Javaris, 2026-11-26.**
- **Lead edit to locked tests:** the four S23 browser tests (two in `tests/e2e/s23-delete-on-request.spec.ts`,
  two in Rigg's `tests/holdout/S23.spec.ts`) are now `test.fixme`, with a comment, because the buttons they
  click are hidden. S23b removes only those `.fixme`s. Approved: Axis, as a lead (RULES: changing a merged
  test needs a lead).
- **S23:** stays parked. S23b replaces it.
- **DEPLOY:** the runbook says delete isn't available until S23b, and the Before launch item blocks the
  production seed on S23b.

## 2026-11-26: amend lines

- **S26 check 1 (#94's amend):** a push other than a message is tagged by its type, its href and its title, not
  only its type and href. Why: every session request opens `/admin/schedule`, and two families' work on one
  assignment opens the same page. With type and href alone, one family's push would still replace another's.
  The title names the family or child. Approved after the fact: Axis; Zero reviewed #94.
- **S26 reopened, check 1 rewritten:** the tag names the record a push is about (the thread, or the type and the
  submission, session, report or invite id, passed by the caller), never the title. Check 3 adds the holdout
  `plan/holdouts/S26.test.ts`. The touches add the callers (`assignments`, `scheduling`, `reports`, `invites`,
  `messages`, `jobs`). Why: Rigg's holdout reopened S26 because two families' children called Mateo produce the
  same title, so type, href and title still collide. This replaces the amend above. Approved: Axis; Zero reviews.

## 2026-11-26: S23 reopened, invite codes; reopen notices go to both leads

- **S23 check 1:** names the family's invite codes. They are the codes the parent used, the codes addressed to
  the parent's email (any case), and unused codes with no email whose parent name is the parent's full name, in
  any state. Deleting a family deletes them. Deleting a child takes the child out of every one of them.
  **Check 3** adds Invite codes to "every screen". **Check 4** adds the holdout `plan/holdouts/S23.test.ts`.
  Why: Rigg's holdout reopened S23. A deleted child stayed listed on an earlier, revoked code for the same
  parent, and OSA asked for a decision on expired, unused and email-less codes. Unused codes with no email
  are matched by name, because nothing else ties them to the account, and a wrong match only costs Vienne a
  new code. DEPLOY's runbook says what happens to the codes.
- **Kit:** `plan.py reopen` tells `leads`, not only the feature's held lead, because the checks are Axis's.
  This is Zero's nit on #90.

Approved: Axis; Zero reviews.

## 2026-11-26: follow-ups after P-review, and reopens wait for their checks

- **S24 (new), signing out never shows or logs an error:** from Rigg's flake in the S10 batch (the S6 holdout
  logs a failed read at sign-out). RULES gives a flake a lead ticket. Not held.
- **S25 (new), the file routes refuse a must-change password:** from S21's report. `/api/files/[id]` and
  `/api/files/blob` check only the session, so S21's rule stops at server functions. Held for Zero, after S23.
- **S26 (new), push tags by subject:** from Rigg's S16 note. One tag per type means a second family's message
  replaces the first one on Vienne's phone. Held for Zero.
- **Kit, reopen waits for its checks:** `plan.py reopen` now sets `needs_checks`, which no lane claims, and
  tells the feature's lead. The lead writes the failing case into its checks, then runs `plan.py set <id> ready`.
  A redo's build prompt names its holdout in `plan/holdouts/`. Why: S19 and then S17 were rebuilt before their
  failing case was in the checks (OSA's suggestion). Kit tests cover it.
- **DEPLOY, S23 runbook:** a new section, **Deleting a family or a child on request**. The Before launch item
  points to it.

Approved: Axis; Zero reviews.

## 2026-11-26: S17 reopened, the rejected-upload case

- **S17 check 3:** every reservation counts toward the day, including one whose bytes `finishUpload` rejects
  (INVALID) and one never finished. Removing a rejected upload never gives the slot back. Check 4 adds the
  holdout `plan/holdouts/S17.test.ts`, and a hint names the cause and one way to fix it. Why: Rigg's holdout
  reopened S17 because `finishUpload` deletes a rejected file's row and the cap counts rows, so a parent at the
  cap could keep reserving by sending files that fail the check. The case goes into the checks before attempt 2
  is built. Approved: Axis; Zero reviews.

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
- **S15 touches and check 1, S18 deps (Zero, on #72):** S15 also covers `assignments.listForStudent`, which sends
  families the raw Resource row, so it touches `src/server/assignments.ts`, and S18 waits for it. Approved: Zero.
- **S10 check 1 (amend in S10's report, after the fact):** the paused screen comes on the next *refused* read or
  write. Sessions isn't refused, on purpose (`listSessions` never sends a paused family the video link), so
  there it's the next refused write. Approved: Zero (no S ticket); Axis.

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
