# Build plan: from prototype to production

Three pieces:

| Piece | What it is | Where |
|---|---|---|
| Prototype | The finished UI and behaviour, running on a mock API | `mm-proto/` (published artifact) |
| Contract | Every server function, its inputs, outputs and rules | `mm-proto/CONTRACT.md` |
| Scaffold | Next.js 16 app: every screen ported and running on the mock; schema, auth, guards, PWA and the core rules built and tested but not yet wired to the screens | `mm-app/` |

Work goes milestone by milestone. Each ticket is done when its acceptance checks pass **on a phone and on desktop**, and the screen matches the prototype at the same route.

**Definition of done (every ticket)**
- Same layout, copy and states as the prototype route (loading, empty, error, success).
- The server function has its guard, validates input and returns the contract shape.
- No answer key, private note or other family's data reaches a family's device (check the network tab).
- Tap targets are at least 40 px on phones, axe shows no violations, and it works at Large and Extra large text.
- Destructive actions run and offer Undo. No "are you sure?" dialogs.

From M2 on, the screens already exist in `src/ui/pages`. "Port X" means finishing the server module in `src/server`, then switching that namespace in `src/ui/api` from the mock to the server. Fix a screen only where real data needs it.

---

## M0 · Scaffold (done)

Already in `mm-app/`. Check it on your machine:

- [ ] `npm install && npm run dev` → `http://localhost:3000` opens Vienne's Today screen with demo data (no `.env` or database).
- [ ] Every route in the prototype opens at the same path (`/admin/families/u_ana`, `/parent/learning/sb_mateo_t1`, …); Account menu switches Vienne / Ana / Grace / Monique.
- [ ] `npm test` (grading + slots, 9 tests), `npm run typecheck`, `npm run build` all pass.
- [ ] Production build (`npm run build && npm start`): installs from Chrome on Android and "Add to Home Screen" on iPhone; offline shows the branded offline page.

## M1 · Backend (done) and wiring

The backend is done:
- **Code:** all server functions, DTOs, private Vercel Blob storage, push, the daily cron, the seed, and migrations.
- **Tests:** 155 tests, including the mock-vs-real contract check.
- **Infrastructure:** CI, the Vercel config, and an end-to-end check in a production build.

What's left is wiring the screens, area by area (W1–W8 in **`docs/WIRING.md`**), plus turning on sign-in (WIRING step 1).

| # | Ticket | Acceptance |
|---|---|---|
| 1.1 | ~~Database, migrations, full demo seed~~ | Done: `npx prisma migrate deploy && npm run db:seed:demo` |
| 1.2 | ~~Live adapter~~ | Done: `src/ui/api/live.js` + `live-hooks.js` (switched off) |
| 1.3 | ~~DTO layer~~ | Done: `src/lib/dto.ts`; leak tests in `tests/integration/leaks.test.ts` |
| 1.4 | **Sign-in on** (WIRING step 1) | `/sign-in` → create account → invite code unlocks; Vienne → `/admin/today`; a parent opening `/admin/*` is sent to `/parent/home` |
| 1.5 | **Wire W1–W8** | Each area's "Done" checklist in WIRING.md |

## M2 · Families and access

| # | Ticket | Acceptance |
|---|---|---|
| 2.1 | Port `families.*` and `/admin/families` (filters: Everyone / K–2 / Grades 3–6 / Needs the book). | Cards show the "No book yet" flag and FAST level badge. |
| 2.2 | Port `invites.*` (list, revoke + **restore**, regenerate) and the invite drawer (with school field). | The code is shown once; revoking shows Undo; the stored row has only a hash and hint. |
| 2.3 | `/admin/families/[parentId]` with StudentCard: school, book status ("They have it"), FAST panel, book work by area, redo count. | Pause shows Undo; private notes are never in a parent's payload. |
| 2.4 | Preview lock: PREVIEW parents see teasers only (`listResourcesForStudent`), can't book or open files. | `/api/files/[id]` returns 403 for PREVIEW. |

## M3 · Scheduling and video

| # | Ticket | Acceptance |
|---|---|---|
| 3.1 | Settings: weekly hours with **In person / Video call** per block, booking rules, **video link + join minutes**, **FAST testing dates**, locations. | Saving hours with neither mode is refused. |
| 3.2 | `getOpenSlots` + parent booking drawer with the **How** step (In person / Video call). Use `lib/slots.ts` (already tested). | Video only appears in blocks that offer it; times are Miami time on any device. |
| 3.3 | Request → confirm/decline → cancel (24 h cutoff for parents) → reschedule → add session (admin, with mode). | Two families can't take the same slot (re-check on request and confirm). |
| 3.4 | **Join call**: `joinCall`, the Today "Up next" button, the parent's Home banner and the session drawer; "Use a different link". | The link isn't in the parent payload before the window; `callStartedAt` is set; the parent's history shows call times. |
| 3.5 | Schedule week grid and phone day agenda (in person vs video colours), Today page (FAST countdown, "Waiting on the book", To check). | Matches prototype; the 1024-wide request rows stack actions (AUDIT.md). |

## M4 · The book (core of the product)

| # | Ticket | Acceptance |
|---|---|---|
| 4.1 | `books.listBooks` + Content → **Book** tab (tests with "Answer key ready" / progress / "Set up"). | Counts match the database. |
| 4.2 | **Answer key page** `/admin/content/book/[bookId]/[test]` (type, answer, standard, area per row; save changed rows). `books.saveAnswerKey` is built in the starter. | Bad answers are refused per row ("#7: the answer should be one letter, A to D"). |
| 4.3 | **"Set up from photos"** (`ai.readAnswerKeyPage`, built in the starter): camera/file input → draft table, unsure rows yellow → "Save this page" → next page. | Photo is never written to storage; the draft is `ACCEPTED` on save; tested on Vienne's real pages (see M9). |
| 4.4 | **New assignment** (book: grade → test → range → students in grade; or practice link). `createBookAssignment` is built. | A range without a full key shows "Set up the answer key". |
| 4.5 | **Kid answer sheet** (`components/learning/AnswerSheet.jsx`): one number per screen, letters, multi-select, number pad with fraction/decimal/minus/space, photo for written answers, review grid, hand in, stars. `saveAnswerDraft` and `submitAnswerSheet` are built. | Closing and reopening keeps answers; hand-in is refused with blanks; the network never contains `answer`. |
| 4.6 | **Assignment detail**: by area, by question grid, students; **Check written answers** drawer (`gradeSubmission`, built). | Marking all OPEN items moves it to GRADED and notifies the parent. |
| 4.7 | **Redo list**: `listRedo`, `addRedo`, `clearRedo`; parent Learning → Redo tab; session drawer list; "got these right today" in Complete. | A miss appears once; clearing removes it from both sides. |
| 4.8 | **Get the book** step (parent Home + Learning) and `setHasBook`; grade change resets it. | Vienne sees who still needs it on Today and Families. |

## M5 · FAST results and progress

| # | Ticket | Acceptance |
|---|---|---|
| 5.1 | `fast.listResults` / `saveResult` (built) / `deleteResult` + `FastResults` component (both roles). | A parent can't edit a row Vienne entered; Star Math (K–2) asks for percentile, not level. |
| 5.2 | Reports: ratings grouped by area, "Book work this period", test results; publish flow. | Area names match `lib/best.ts`; K–2 grouped by strand. |
| 5.3 | Parent Progress: report by area, school test results (add form), book homework by area. | — |

## M6 · "Talk about it" (AI session notes)

| # | Ticket | Acceptance |
|---|---|---|
| 6.1 | Complete-session form: big **Tap to talk** (Web Speech API via `useDictation`), editable text, **Write my note** → DraftCard (**Use this and finish / Change / No thanks**). `ai.draftSessionNote` is built. | Works without speech support (keyboard mic); nothing saves before "Use this"; redo questions not in the key are listed as "Check this". |
| 6.2 | `completeSession` with `source: 'VOICE'`, `aiDraftId`, `redoItemIds`, `clearRedoIds`. | Draft row becomes ACCEPTED; note shows on the parent's Home. |

## M7 · Library, messages, notifications

| # | Ticket | Acceptance |
|---|---|---|
| 7.1 | Library list/editor (no subject field), upload via `lib/storage.ts`, delete → bin + Undo. | Parents only open files they're allowed (`/api/files/[id]`). |
| 7.2 | Messages (threads, quick replies, unread). | — |
| 7.3 | Notifications feed (admin: everything; parents: confirmations, returned/graded work, reports, new homework). | — |

## M8 · PWA, deploy, privacy

| # | Ticket | Acceptance |
|---|---|---|
| 8.1 | PWA: manifest, icons, `sw.js`, offline page and install prompt are in the starter. Add the install card to Vienne's Today too. | Lighthouse "Installable"; offline page appears with no network. |
| 8.2 | **Push notifications (phase 2)**: `PushSubscription` model exists; add opt-in in Settings/Account, `web-push` sender in `lib/notify.ts`, VAPID keys. iPhone only after "Add to Home Screen" (iOS 16.4+). | Only for the notification types above; one tap opens the right screen. |
| 8.3 | Deploy: Postgres (`provider = "postgresql"`), Vercel Blob storage, `AUTH_URL`, Google OAuth redirect, daily reminder cron. | `prisma migrate deploy` in CI; secrets only in the host's env. |
| 8.4 | Privacy: parent-facing note (children's data, AI use with a provider whose business terms don't train on it, photos not stored, video not recorded), data export/delete on request. | Linked from Account. |

## M9 · QA before Vienne uses it

- [ ] Port `mm-proto/scratch/audit.py` (Playwright + axe at 7 widths, 13 overlays) to run against the real app; same zero-issue bar as AUDIT.md.
- [ ] Real iPhone + iPad (Safari) pass: sheets, camera capture, dictation, Add to Home Screen, Join call.
- [ ] **AI evals:** 10 of Vienne's real answer-key photos and 10 real voice recaps. Measure answers read correctly, rows flagged unsure, and notes she'd accept unedited. Stay on Haiku 5.5 / high; only revisit the model if a measured step fails.
- [ ] Walk Vienne through it once at Large text with her real data, and note every hesitation.

---

## Still to decide with Vienne

1. **Waiting on Vienne:** the book's access code, which unlocks the book's online content. When it arrives, see what it opens (practice tests, answer keys, digital pages), then decide whether "Set up from photos" stays the main way to load answer keys.

Decided:
- **FAST dates 2026–27** are in the seed, from the Miami-Dade testing calendar the School Board approved on Aug 11, 2026. The district calls it tentative.
  - PM1: Aug 13 – Sep 25
  - PM2: Nov 30 – Jan 22
  - PM3: May 3 – 28
  - K–2 Star Math PM3 opens Apr 12.
  - Vienne updates them each year in Settings → FAST testing dates.
- **No travel time.** The app only counts session time. A video call is just the call. An in-person session means Vienne drives, but the app doesn't add or block any driving time. She leaves gaps herself if she wants them.
