# Data contract: UI ↔ backend (v3)

The prototype's mock layer (`src/api/`) is the contract. Every function lives in the namespace of its `server/` module, takes one object argument and returns Prisma-shaped records (dates as ISO strings). The Next.js starter (`mm-app/`) has the same modules in `src/server/`, with the same names and inputs.

- **Reads** resolve to data. In Next.js, server components call them directly.
- **Writes** resolve to `{ ok: true, data } | { ok: false, error, code }` (`lib/result.ts` `action()`).
- **Guards** run first in every function: `requireUser`, `requireActive`, `requireAdmin`, `requireStudentAccess(studentId)`.
- **Every export of a `'use server'` file is a public endpoint.** Internal helpers (`notify`, `notifyAdmins`, grading, slot maths) live in `src/lib/`, never in `src/server/`.
- Return shapes are built in `src/api/dto.js` (prototype). The real server returns the same fields.

v2 covers the math-only, Miami-Dade, book, FAST, video and AI changes (ADDITIONS.md). The data model is `mm-app/prisma/schema.prisma`.

## The real backend (v3, `src/server/`)

Every function above exists in `src/server/<module>.ts` with the same name, input and result shape. `npm run test:contract` proves it, function by function, on identical data.

- **Reads return a Result too:** `{ ok, data } | { ok: false, error, code }`. In production, Next.js hides the message of an error thrown from a server function, so throwing would lose the plain-language text. The live adapter (`src/ui/api/live.js`) unwraps reads, so screens see exactly what the mock gives them: data, or a thrown error with `.code`.
- **Error codes:** `UNAUTHENTICATED`, `NOT_ACTIVE`, `FORBIDDEN`, `NOT_FOUND`, `INVALID`, `INVALID_CODE`, `LOCKED`, `SLOT_TAKEN`, `PAST_CUTOFF`, `NO_KEY`, `LIMIT`, `AI_FAILED`, `SERVER`. The mock says `INVALID` where the real backend says `NOT_FOUND`.
- **Uploads** go in three steps, so large files go straight to storage:
  1. `content.createUpload` reserves the file.
  2. The bytes go straight to the private Vercel Blob store, using a token from `/api/files/blob` (or a local PUT in development).
  3. `content.finishUpload` checks the size and the real file type.

   The screens keep calling `content.uploadFile({ file, … })`, and the adapter runs the three steps (`src/lib/upload-client.ts`).
- **Added:** `notifications.savePushSubscription` and `removePushSubscription` (PWA push).
- **Tighter than the mock, on purpose:**
  - `adminNotes` (Vienne's private note on a student) is never sent to parents.
  - `getSettings` gives parents `defaultMeetingUrl: null`.
  - `getFamily` gives parents sessions in the parent form: no private notes, and a link only inside the join window.
  - Answer-sheet photos must be finished uploads by that family.
- **Extra safety:**
  - API routes are outside the sign-in redirect and check access themselves.
  - Paused accounts can't be unpaused with an invite code.
  - Push endpoints must belong to a real browser push service.
  - Requests must start on one of Vienne's start times.
  - Children's work photos are never cached on the device.
  - All booking writes take one calendar lock, so two families can't get the same time.
  - Handing in a sheet and redeeming a code are protected against double taps and races.
  - Invite codes lock after 10 wrong tries (1 hour).
  - Password sign-in locks after 5 wrong tries (15 minutes).
  - AI drafts are capped at 150 a day.

## Functions the UI calls

| Module | Reads | Writes |
|---|---|---|
| `families` | `listFamilies({ status? })`: students add `hasBook` (null if no book for the grade) and `latestLevel`. `getFamily({ parentId })`: students add `school`, `hasBook`, `latestResult`, `bookAreas`, `stats.redoCount` | `updateParent`, `setParentStatus`, `resetParentPassword → { temporaryPassword }`, `addStudent({ parentId, firstName, lastName, grade, school?, goals? })`, `updateStudent({ studentId, ...patch })`: a grade change clears `hasBookAt`. `archiveStudent`, `setTextSize({ textSize })` |
| `invites` | `listInvites()` | `createInvite({ parentName, parentEmail?, plannedStudents: [{ firstName, lastName, grade, school? }] }) → { invite, code }`, `revokeInvite`, **`restoreInvite`** (Undo), `regenerateInvite → { code }`, `redeemInvite({ code })` |
| `taxonomy` | `listSubjects()`: returns Math only, with `skills[]`, each with `strand` and `benchmarkCodes` | `upsertSkill({ id?, name, strand, gradeMin, gradeMax, benchmarkCodes? })`, `archiveSkill({ skillId, archived })` |
| `scheduling` | `getSettings()`: adds `defaultMeetingUrl`, `joinOpensMin`, `fastWindows`, `timezone: America/New_York`. `getAvailability()`: rows add `modes[]`. `listTimeOff()`, `listLocations()`, `getOpenSlots({ durationMin, mode, locationId?, address?, from, to })`, `listSessions(...)` | `updateSettings(patch)`, `setAvailability({ rows: [{ weekday, startMin, endMin, modes }] })`, `addTimeOff`, `removeTimeOff`, `requestSession({ studentId, mode, locationId?, address?, startsAt, durationMin, parentNote? })`, `confirmSession` (sets `meetingUrl` for video), `declineSession`, `cancelSession`, `rescheduleSession`, `createSessionAsAdmin({ …, mode, meetingUrl? })`, `completeSession({ …, redoItemIds?, clearRedoIds?, source?: 'TYPED' \| 'VOICE', aiDraftId? })`, `markNoShow`, **`joinCall({ sessionId }) → { meetingUrl }`**, **`setMeetingUrl({ sessionId, meetingUrl })`** |
| `content` | `listResources(...)`, `listResourcesForStudent({ studentId })`, `getFileForUser({ fileId })`: also allows the family's own work photos | `uploadFile`, `createResource`, `updateResource`, `deleteResource` (moves it to the bin), **`restoreResource`** (Undo) |
| **`books`** | `listBooks()`: per test, adds `keyed` count and how many students have the book. `getAnswerKey({ bookId, test })` (admin). `bookForGrade({ grade })`. `listRedo({ studentId })` | `saveAnswerKey({ bookId, test, rows, source?, aiDraftId? })`, `setHasBook({ studentId, hasBook })`, `addRedo({ studentId, test, numbers })`, `clearRedo({ redoIds })` |
| `assignments` | `listAssignments()`, **`getAssignment({ assignmentId })`**: adds `items[]` (per-number right, wrong and pending) and `areas[]`. `listForStudent({ studentId })`: `assignment.slots[]` **without `answer`**. `gradingQueue()` | **`createBookAssignment({ bookId, test, from?, to?, dueAt?, instructions?, studentIds })`**, **`createPracticeAssignment(...)`**, **`saveAnswerDraft({ submissionId, answers })`**, **`submitAnswerSheet({ submissionId, answers: [{ number, value }], photos: [{ number, fileId }] })`**, `gradeSubmission({ submissionId, results: [{ number, correct }], feedback? })`, `returnSubmission`, **`markPracticeDone`** |
| **`fast`** | `listResults({ studentId }) → { testType, categories, results[] }`: each result has `enteredBy`. `nextWindow()` | `saveResult({ id?, studentId, schoolYear, window, scaleScore, level?, percentile?, categories? })` (Vienne or the parent), `deleteResult({ id })` |
| **`ai`** | — | `draftSessionNote({ sessionId, transcript }) → { draftId, note, homework, skills[], redo[], unsure[] }`, `readAnswerKeyPage({ bookId, test, fromNumber, image }) → { draftId, from, to, expected, items[] }`, `discardDraft({ draftId })` |
| `reports` | `getReport({ reportId })`: ratings add `area`. The result adds `bookWork { done, assigned, questions }` and `bookAreas[]`. `listForStudent({ studentId })` | `createDraft`, `updateReport`, `setRatings`, `publishReport` |
| `messages` | `listThreads()`, `getThread(...)`, `unreadCount()` | `sendMessage`, `markThreadRead` |
| `notifications` | `listForUser()` | `markRead`, `markAllRead` (internal: `lib/notify.ts`) |
| `dashboard` | `getAdminToday()`: adds `fastWindow`, `fastStudents`, `needBook[]`. `getParentOverview({ studentId })`: adds `book`, `hasBookAt`, `redoCount`, `fastWindow` (grades 3–6), `latestResult`, `joinOpensMin` | — |

**Removed:** `questions.*`, `assignments.createAssignment`, `assignToStudents`, `submitQuiz` and `submitUpload`. The book replaces the authored question bank.

## Shapes that matter

```ts
// A book question, as Vienne sees it. Families get the same object WITHOUT `answer`.
BookItem = { id, bookId, test: 'M1'|'M2'|'T1'..'T4', number, format: 'MC'|'MULTI'|'NUMERIC'|'OPEN', choiceCount, answer, benchmarkCode, points, area: { id, name, fullName } }

// Submission.answers after hand-in. correct = null means "Vienne will check" (OPEN).
answers = [{ number, value, correct: true | false | null }]

// Session for a parent: meetingUrl is null outside [startsAt − joinOpensMin, endsAt]; joinOpensAt is always set.
Session = { …, mode: 'IN_PERSON' | 'VIDEO', locationId: string | null, meetingUrl: string | null, callStartedAt, callEndedAt, joinOpensAt? }

// Area = FAST reporting category (grades 3–6) or B.E.S.T. strand (K–2), from lib/best.ts areaFor() / skillArea().
Area = { id: 'rc_5_frac' | 'strand_NSO' | …, name: 'Fractions and decimals', fullName: 'Number Sense and Operations with Fractions and Decimals' }
```

## Business rules (keep server-side)

- **Open slots** = weekly hours offering that mode − time off − held sessions, with 24 h notice, a 4-week horizon and 15-minute steps, all in America/New_York.
- **No travel time.** A session holds only its own minutes, video or in person. Vienne plans her own driving; she can leave gaps by blocking time off.
- `requestSession` and `confirmSession` re-check the slot. `requestSession` also checks that the block offers that mode.
- **Video:** confirming needs a link (session or `Settings.defaultMeetingUrl`). Parents only get the link inside the join window. `joinCall` records `callStartedAt`, and completing the session records `callEndedAt`.
- **Answer sheets** are graded on the server (`lib/grading.ts`). Equivalent numbers count (3/4 = 0.75 = 6/8). Letter order doesn't matter. OPEN items wait for Vienne (`SUBMITTED`). Misses go on the redo list once, not again while still open.
- **Answer key** rows must match their format. Benchmark codes must belong to the book's grade. `createBookAssignment` refuses a range without a full key (`NO_KEY`).
- **FAST results:** one per student, school year and window. A parent can only edit the rows they entered. Vienne can edit any.
- **AI drafts** never write data. "Use this" calls the normal save action with `aiDraftId`, which marks the draft `ACCEPTED`. Anything that doesn't exist in her data is dropped and listed in `unsure`. Photos aren't stored.
- **Undo**, not confirm: revoke code, remove time off, delete resource, archive skill and pause account all run straight away and offer Undo for 7 seconds.
- Stars: ≥ 90 % = 3, ≥ 70 % = 2, any finished sheet = 1.
- Invite codes: single use, 14 days, stored as a peppered SHA-256, and only the last two characters stay readable.
