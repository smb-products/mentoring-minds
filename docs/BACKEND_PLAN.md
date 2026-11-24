# Mentoring Minds — Backend Plan

**Client:** Vienne Elliott · Mentoring Minds (K–6 tutoring)
**Purpose:** Demo base for an admin + parent tutoring platform (web, tablet, mobile)
**Status:** Historical. This is the plan written before the build. The backend is now built, and where they differ the code and these docs win: `AGENTS.md`, `docs/CONTRACT.md`, `docs/WIRING.md`, `docs/DEPLOY.md` (storage is private Vercel Blob, not S3; there's no travel time).

---

## 1. Decisions at a glance

| Area | Decision |
|---|---|
| Roles | **Admin** (Vienne) and **Parent**. Kids are profiles under a parent — no kid logins, no kid mode |
| Sign-in | One screen: Google OAuth **or** email + password, with an optional invite code |
| Access | Open signup → **Preview** (locked) account. Vienne's **invite code** unlocks full access |
| Grades | K–6 |
| Sessions | In person, one student, 30 / 45 / 60 min, no prices |
| Locations | Vienne's place, student's home, or a library |
| Booking | Parent requests → **Vienne approves or declines** |
| Cancelling | Parents can cancel until 24h before; after that, "Message Vienne" |
| Travel time | None (decided Nov 2026): a session holds only its own minutes |
| Notifications | In-app only. Full feed for Vienne; parents only on necessary events |
| Progress reports | Published whenever Vienne chooses |
| Content | Vienne's own teaching CMS: subjects/skills, library, question bank |
| Website | No landing page or website CMS. App opens to sign-in |
| Data | Prisma + SQLite (demo) → Postgres (production) |

---

## 2. Stack

- **Next.js** (App Router, TypeScript) — UI, server actions, route handlers
- **Prisma** — ORM; SQLite for demo, Postgres for production (config change only)
- **Auth.js (NextAuth v5)** — Google provider + Credentials provider, JWT sessions, Prisma adapter for linked accounts
- **Zod** — input validation on every write
- **bcrypt / argon2** — password hashing
- **Tiptap** — rich-text editor for notes and lessons (stored as JSON)
- **Storage adapter** — local disk (demo) → S3 or Vercel Blob (production)
- **Tailwind CSS** — styling (front end; listed for completeness)

---

## 3. Roles and access

| | Admin (Vienne) | Parent — Active | Parent — Preview | Parent — Paused |
|---|---|---|---|---|
| See all families/students | ✅ | — | — | — |
| See own children's content | ✅ | ✅ | Teasers only | ❌ |
| Book / cancel sessions | ✅ (any) | ✅ (own kids) | ❌ | ❌ |
| Take quizzes / submit work | — | ✅ (for own kids) | ❌ | ❌ |
| Message Vienne | ✅ | ✅ | ❌ | ❌ |
| Download files | ✅ | ✅ (shared with own kids) | ❌ | ❌ |
| Manage content, settings, invites | ✅ | ❌ | ❌ | ❌ |

**Kids inside the parent account:** the parent sees a child tab bar (`Ava · Grade 2 | Leo · K`). The selected child lives in the URL (`?child=<id>`), so links and the back button work. Records (submissions, stars, progress) are always stored per child, and each submission records which parent submitted it.

**Scoping rule:** every parent read/write calls `requireStudentAccess(studentId)`, which confirms the student belongs to the signed-in parent.

---

## 4. Authentication

### Single sign-in screen

```
        [ Mentoring Minds logo ]

     [ G  Continue with Google ]
              ── or ──
     Email     [______________]
     Password  [______________]
           [   Continue   ]

     ▸ Have an invite code?  [MM-____]

     (demo mode only) Sign in as: Vienne · Parent
```

- **Continue** signs in if the email exists. If not, a "Your name" field appears inline and the account is created — no separate page.
- **Invite code** (optional) works with either method. Before redirecting to Google, the code is stored in a short-lived, http-only cookie and redeemed on the callback.
- **Admin bootstrap:** the user whose email matches `ADMIN_EMAIL` gets `role = ADMIN` on first sign-in.
- **Account linking:** if a Google sign-in's email matches an existing email/password user, the Google account is linked to that user (safe because Google verifies emails).
- **Forgot password:** no email for now. Vienne can reset a parent's password from admin, or the parent can use Google.

### Invite codes

1. Vienne → **Invite family**: parent name, optional email, planned children (name, grade, subjects).
2. App generates a code like `MM-7K4Q`, **shown once** with a copy button (she texts it or shares in person).
3. Parent enters the code at signup or later from the Preview screen.
4. On redemption: user becomes `ACTIVE`, planned children are created and linked, invite is marked used.
5. Codes are single-use, expire after **14 days**, can be revoked or regenerated.
6. Stored as a hash. Redemption is rate-limited to slow guessing.

### Preview (locked) accounts

Enforced on the server, not just hidden in the UI:

- Preview users receive a **teaser DTO** for resources: title, subject, grade, kind, thumbnail — never `fileId`, `url` or `body`.
- Only resources with `showInPreview = true` appear as teasers.
- `/api/files/[id]` rejects anyone who isn't `ACTIVE` (or admin).
- Every booking, messaging and submission action calls `requireActive()` first.
- Middleware routes Preview users to locked views and the "Enter your invite code" screen.

---

## 5. Data model

> SQLite notes: Prisma supports enums and `Json` on SQLite (Prisma 6.2+). Lists are modeled as relations or grade ranges (`gradeMin`/`gradeMax`) rather than array columns, so the schema moves to Postgres unchanged. All timestamps stored in UTC; slots computed in `Settings.timezone`.

### Enums

```prisma
enum Role              { ADMIN PARENT }
enum UserStatus        { PREVIEW ACTIVE PAUSED }
enum StudentStatus     { ACTIVE PAUSED ARCHIVED }
enum LocationKind      { TUTOR HOME LIBRARY }
enum SessionStatus     { REQUESTED CONFIRMED DECLINED CANCELLED COMPLETED NO_SHOW }
enum Attendance        { PRESENT LATE ABSENT }
enum ResourceKind      { WORKSHEET VIDEO LINK NOTE IMAGE }
enum Visibility        { ALL GRADES SELECTED }
enum PublishStatus     { DRAFT PUBLISHED }
enum AssignmentKind    { QUIZ UPLOAD PRACTICE }
enum SubmissionStatus  { ASSIGNED SUBMITTED GRADED RETURNED }
enum Audience          { ADMIN PARENT }
enum Channel           { IN_APP EMAIL SMS }   // only IN_APP used for now
```

### Accounts and families

```prisma
model User {
  id            String     @id @default(cuid())
  email         String     @unique
  emailVerified DateTime?
  name          String
  phone         String?
  image         String?               // Google profile photo
  passwordHash  String?               // null for Google-only users
  role          Role       @default(PARENT)
  status        UserStatus @default(PREVIEW)
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  accounts      Account[]
  students      Student[]      @relation("ParentStudents")
  conversation  Conversation?  @relation("FamilyThread")
  messages      Message[]
  notifications Notification[]
  requested     Session[]      @relation("RequestedBy")
  cancelled     Session[]      @relation("CancelledBy")
  uploads       FileAsset[]
  submitted     Submission[]   @relation("SubmittedBy")
  inviteUsed    Invite?        @relation("InviteUsedBy")
}

model Account {                         // Auth.js linked logins (Google)
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model Invite {
  id              String    @id @default(cuid())
  codeHash        String    @unique
  codeHint        String              // e.g. "MM-••4Q" for the admin list
  parentName      String
  parentEmail     String?
  plannedStudents Json                // [{ firstName, lastName, grade, subjectIds }]
  expiresAt       DateTime
  usedAt          DateTime?
  usedById        String?   @unique
  revokedAt       DateTime?
  createdAt       DateTime  @default(now())
  usedBy          User?     @relation("InviteUsedBy", fields: [usedById], references: [id])
}

model Student {
  id          String        @id @default(cuid())
  parentId    String
  firstName   String
  lastName    String
  grade       Int                       // 0 = K, 1–6
  goals       String?
  adminNotes  String?                   // visible to Vienne only
  avatarColor String        @default("#1E3A8A")
  status      StudentStatus @default(ACTIVE)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  parent      User             @relation("ParentStudents", fields: [parentId], references: [id])
  subjects    Subject[]
  sessions    Session[]
  submissions Submission[]
  reports     ProgressReport[]
  shares      ResourceShare[]
  @@index([parentId])
}
```

### Taxonomy (Vienne's CMS)

```prisma
model Subject {
  id          String     @id @default(cuid())
  name        String     @unique          // Math, Reading, Phonics, Writing
  color       String
  order       Int        @default(0)
  archivedAt  DateTime?
  skills      Skill[]
  students    Student[]
  resources   Resource[]
  sessions    Session[]
  questions   Question[]
  assignments Assignment[]
}

model Skill {
  id          String    @id @default(cuid())
  subjectId   String
  name        String                     // e.g. "Fractions"
  gradeMin    Int                        // 0 = K
  gradeMax    Int
  order       Int       @default(0)
  archivedAt  DateTime?                  // archive, never delete (keeps history intact)
  subject     Subject        @relation(fields: [subjectId], references: [id])
  questions   Question[]
  ratings     ReportRating[]
  notes       SessionNote[]
}
```

### Scheduling

```prisma
model Location {
  id       String       @id @default(cuid())
  name     String                        // "Vienne's Studio", "Student's Home", "Central Library"
  kind     LocationKind
  address  String?                       // HOME uses Session.address instead
  active   Boolean      @default(true)
  sessions Session[]
}

model Availability {                     // weekly recurring hours
  id       String @id @default(cuid())
  weekday  Int                           // 0 = Sun … 6 = Sat
  startMin Int                           // minutes from midnight, e.g. 900 = 3:00 PM
  endMin   Int
}

model TimeOff {
  id       String   @id @default(cuid())
  startsAt DateTime
  endsAt   DateTime
  reason   String?
}

model Settings {                         // single row
  id                Int    @id @default(1)
  timezone          String @default("America/Chicago")
  sessionLengths    Json   @default("[30,45,60]")
  slotStepMin       Int    @default(15)
  minNoticeHours    Int    @default(24)
  cancelCutoffHours Int    @default(24)
  horizonWeeks      Int    @default(4)
}

model Session {
  id             String        @id @default(cuid())
  studentId      String
  subjectId      String
  locationId     String
  address        String?                 // required when location kind = HOME
  requestedById  String
  startsAt       DateTime
  endsAt         DateTime
  durationMin    Int                     // 30 | 45 | 60
  status         SessionStatus @default(REQUESTED)
  parentNote     String?
  declineReason  String?
  confirmedAt    DateTime?
  cancelledById  String?
  cancelledAt    DateTime?
  cancelReason   String?
  reminderSentAt DateTime?               // prevents duplicate reminders
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  student     Student      @relation(fields: [studentId], references: [id])
  subject     Subject      @relation(fields: [subjectId], references: [id])
  location    Location     @relation(fields: [locationId], references: [id])
  requestedBy User         @relation("RequestedBy", fields: [requestedById], references: [id])
  cancelledBy User?        @relation("CancelledBy", fields: [cancelledById], references: [id])
  note        SessionNote?
  @@index([startsAt])
  @@index([studentId, startsAt])
}

model SessionNote {
  id               String     @id @default(cuid())
  sessionId        String     @unique
  attendance       Attendance
  summary          String
  homework         String?
  sharedWithParent Boolean    @default(true)
  skills           Skill[]
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt
  session          Session    @relation(fields: [sessionId], references: [id], onDelete: Cascade)
}
```

### Content

```prisma
model FileAsset {
  id           String   @id @default(cuid())
  storageKey   String   @unique
  filename     String
  mimeType     String
  sizeBytes    Int
  uploadedById String
  createdAt    DateTime @default(now())
  uploadedBy   User     @relation(fields: [uploadedById], references: [id])
}

model Tag {
  id        String     @id @default(cuid())
  name      String     @unique
  resources Resource[]
}

model Resource {
  id            String        @id @default(cuid())
  title         String
  description   String?
  kind          ResourceKind
  subjectId     String?
  gradeMin      Int           @default(0)
  gradeMax      Int           @default(6)
  fileId        String?                  // WORKSHEET / IMAGE
  thumbnailId   String?
  url           String?                  // VIDEO (YouTube/Vimeo) / LINK
  body          Json?                    // NOTE (Tiptap JSON)
  visibility    Visibility    @default(ALL)
  status        PublishStatus @default(DRAFT)
  showInPreview Boolean       @default(false)
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  subject     Subject?        @relation(fields: [subjectId], references: [id])
  tags        Tag[]
  shares      ResourceShare[]
  assignments Assignment[]
}

model ResourceShare {                    // used when visibility = SELECTED
  resourceId String
  studentId  String
  resource   Resource @relation(fields: [resourceId], references: [id], onDelete: Cascade)
  student    Student  @relation(fields: [studentId], references: [id], onDelete: Cascade)
  @@id([resourceId, studentId])
}
```

### Assignments, quizzes and the question bank

```prisma
model Question {                         // reusable question bank
  id           String    @id @default(cuid())
  subjectId    String
  skillId      String?
  gradeMin     Int
  gradeMax     Int
  prompt       String
  imageId      String?
  choices      Json                      // ["3", "4", "5", "6"]
  correctIndex Int
  explanation  String?
  archivedAt   DateTime?
  subject      Subject   @relation(fields: [subjectId], references: [id])
  skill        Skill?    @relation(fields: [skillId], references: [id])
  usedIn       AssignmentQuestion[]
}

model Assignment {
  id           String         @id @default(cuid())
  title        String
  instructions String?
  kind         AssignmentKind
  subjectId    String?
  resourceId   String?
  dueAt        DateTime?
  createdAt    DateTime       @default(now())
  subject      Subject?       @relation(fields: [subjectId], references: [id])
  resource     Resource?      @relation(fields: [resourceId], references: [id])
  questions    AssignmentQuestion[]
  submissions  Submission[]
}

model AssignmentQuestion {
  assignmentId String
  questionId   String
  order        Int
  assignment   Assignment @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  question     Question   @relation(fields: [questionId], references: [id])
  @@id([assignmentId, questionId])
}

model Submission {                       // created on assign = the student's to-do
  id            String           @id @default(cuid())
  assignmentId  String
  studentId     String
  status        SubmissionStatus @default(ASSIGNED)
  answers       Json?                    // [{ questionId, choiceIndex, correct }] snapshotted at submit
  fileId        String?                  // photo/PDF of finished work
  autoScore     Int?
  score         Int?
  maxScore      Int?
  feedback      String?
  stars         Int              @default(0)   // 0–3
  submittedById String?
  submittedAt   DateTime?
  gradedAt      DateTime?
  assignment    Assignment @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  student       Student    @relation(fields: [studentId], references: [id])
  submittedBy   User?      @relation("SubmittedBy", fields: [submittedById], references: [id])
  @@unique([assignmentId, studentId])
}
```

### Progress reports

```prisma
model ProgressReport {
  id          String        @id @default(cuid())
  studentId   String
  periodStart DateTime                   // defaults to last report's end
  periodEnd   DateTime
  summary     String
  status      PublishStatus @default(DRAFT)
  publishedAt DateTime?
  createdAt   DateTime      @default(now())
  student     Student       @relation(fields: [studentId], references: [id])
  ratings     ReportRating[]
}

model ReportRating {
  id       String  @id @default(cuid())
  reportId String
  skillId  String
  rating   Int                           // 1–4
  comment  String?
  report   ProgressReport @relation(fields: [reportId], references: [id], onDelete: Cascade)
  skill    Skill          @relation(fields: [skillId], references: [id])
  @@unique([reportId, skillId])
}
```

### Messages and notifications

```prisma
model Conversation {                     // one thread per family
  id               String    @id @default(cuid())
  parentId         String    @unique
  lastMessageAt    DateTime  @default(now())
  adminLastReadAt  DateTime?
  parentLastReadAt DateTime?
  parent           User      @relation("FamilyThread", fields: [parentId], references: [id])
  messages         Message[]
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  senderId       String
  body           String
  createdAt      DateTime     @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender         User         @relation(fields: [senderId], references: [id])
  @@index([conversationId, createdAt])
}

model Notification {
  id        String    @id @default(cuid())
  userId    String
  audience  Audience
  type      String                       // see §8
  title     String
  body      String?
  href      String?
  channel   Channel   @default(IN_APP)
  readAt    DateTime?
  sentAt    DateTime?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, readAt])
}
```

---

## 6. Business rules

### Open slots — `getOpenSlots({ durationMin, locationId, from, to })`

1. Clamp the range to `now + minNoticeHours` … `now + horizonWeeks`.
2. Expand weekly `Availability` into concrete windows in `Settings.timezone`.
3. Subtract `TimeOff` ranges.
4. Subtract existing sessions with status `REQUESTED` or `CONFIRMED`.
5. ~~Travel buffer~~ Removed (Nov 2026): sessions only block their own time.
6. Step through what's left in `slotStepMin` increments; keep starts where `durationMin` fits.

### Booking lifecycle

```
REQUESTED ──(Vienne confirms)──► CONFIRMED ──(Vienne completes + note)──► COMPLETED
    │                               │   └──(Vienne marks)──────────────► NO_SHOW
    └──(Vienne declines)──► DECLINED └──(cancel)───────────────────────► CANCELLED
```

- `requestSession` and `confirmSession` run in a **transaction** that re-checks the slot is still free, preventing double booking.
- A pending `REQUESTED` session holds its slot so two parents can't request the same time.
- **Parent cancel:** allowed for `REQUESTED` or `CONFIRMED` sessions until `cancelCutoffHours` before start. After that, the UI swaps the button for "Message Vienne" and the server rejects the cancel.
- **Vienne** can create sessions directly (e.g., booked by phone), reschedule, or cancel at any time. The parent is notified.
- Home sessions require an `address`.

### Quizzes and grading

- Assigning creates one `Submission` per student with status `ASSIGNED`.
- On quiz submit: answers are scored against `correctIndex`, `correct` is **snapshotted** per answer, `autoScore`/`maxScore` set, stars auto-awarded (e.g., ≥90% = 3, ≥70% = 2, any completion = 1), status `GRADED`.
- Upload/practice work: status `SUBMITTED` → appears in Vienne's grading queue → she sets score, feedback and stars → `GRADED` (or `RETURNED` for a redo).
- Quiz results per question feed skill-level progress via `Question.skillId`.

### Progress reports

- Vienne starts a draft anytime. `periodStart` defaults to the end of the student's last report (or their first session).
- She chooses which skills to rate (1–4) and writes a summary.
- Publishing sets `publishedAt` and notifies the parent. No schedule, no "report due" alerts.

### Taxonomy changes

- Subjects and skills are **archived**, never deleted, so old notes, grades and reports keep working.

---

## 7. Data layer architecture

```
src/
  lib/
    db.ts              Prisma client singleton
    auth.ts            Auth.js config (Google + Credentials)
    guards.ts          requireUser · requireActive · requireAdmin · requireStudentAccess
    storage/           StorageAdapter: local.ts · s3.ts
    validation/        Zod schemas per domain
    result.ts          { ok: true, data } | { ok: false, error }
  server/              business logic — framework-agnostic
    invites.ts
    families.ts
    taxonomy.ts
    scheduling.ts
    content.ts
    questions.ts
    assignments.ts
    reports.ts
    messages.ts
    notifications.ts
    dashboard.ts
  app/
    (admin)/…          admin pages + actions.ts per section
    (parent)/…         parent pages + actions.ts per section
    api/
      auth/[...nextauth]/route.ts
      files/route.ts          POST upload
      files/[id]/route.ts     GET permission-checked download
      cron/reminders/route.ts GET, protected by CRON_SECRET
```

- **Reads:** server components call `server/` functions directly.
- **Writes:** server actions follow one pattern:

```ts
export async function confirmSessionAction(input: unknown) {
  const admin = await requireAdmin();                  // 1. role / status guard
  const data  = ConfirmSessionSchema.parse(input);     // 2. validate
  const res   = await scheduling.confirmSession(data, admin); // 3. business rule (+ transaction)
  // 4. scheduling.confirmSession calls notifications.notify(...)
  revalidatePath("/admin/schedule");                   // 5. refresh UI
  return res;
}
```

- **Future native app:** `server/` has no Next.js dependencies, so `/api/v1/*` REST handlers can wrap the same functions later.

### Server function inventory

| Module | Functions |
|---|---|
| invites | `createInvite` · `listInvites` · `revokeInvite` · `regenerateInvite` · `redeemInvite` |
| families | `listFamilies` · `getFamily` · `updateParent` · `setParentStatus` · `resetParentPassword` · `addStudent` · `updateStudent` · `archiveStudent` |
| taxonomy | `listSubjects` · `upsertSubject` · `upsertSkill` · `reorderSkills` · `archiveSubject` · `archiveSkill` |
| scheduling | `getSettings` · `updateSettings` · `setAvailability` · `addTimeOff` · `removeTimeOff` · `getOpenSlots` · `requestSession` · `confirmSession` · `declineSession` · `rescheduleSession` · `cancelSession` · `createSessionAsAdmin` · `completeSession` · `markNoShow` · `listSessions` |
| content | `uploadFile` · `getFileForUser` · `createResource` · `updateResource` · `setPublishStatus` · `setSharing` · `listResourcesForStudent` (full or teaser) · `deleteResource` |
| questions | `listQuestions` · `upsertQuestion` · `archiveQuestion` |
| assignments | `createAssignment` · `assignToStudents` · `listForStudent` · `submitQuiz` · `submitUpload` · `gradeSubmission` · `returnSubmission` · `gradingQueue` |
| reports | `createDraft` · `updateReport` · `setRatings` · `publishReport` · `listForStudent` |
| messages | `listThreads` · `getThread` · `sendMessage` · `markThreadRead` · `unreadCount` |
| notifications | `notify` · `listForUser` · `markRead` · `markAllRead` · `runDailyReminders` |
| dashboard | `getAdminToday` · `getParentOverview` |

---

## 8. Notifications (in-app only)

The `channel` column allows email/SMS later without a schema change.

| Type | Recipient | Trigger |
|---|---|---|
| `SESSION_REQUESTED` | Vienne | Parent requests a session |
| `SESSION_CANCELLED_BY_PARENT` | Vienne | Parent cancels |
| `MESSAGE_RECEIVED` | Vienne | Parent sends a message |
| `SUBMISSION_RECEIVED` | Vienne | Work submitted (quizzes auto-graded, uploads need grading) |
| `INVITE_REDEEMED` | Vienne | A family uses their code |
| `DAILY_AGENDA` | Vienne | Morning summary of today's sessions |
| `SESSION_CONFIRMED` | Parent | Vienne approves |
| `SESSION_DECLINED` | Parent | Vienne declines |
| `SESSION_CHANGED` | Parent | Vienne reschedules or cancels |
| `SESSION_REMINDER` | Parent | Day before a confirmed session |
| `REPORT_PUBLISHED` | Parent | Vienne publishes a progress report |

- Parent messages from Vienne show as an **unread badge**, not a notification.
- `runDailyReminders()` runs from `/api/cron/reminders` (Vercel Cron or similar) and uses `Session.reminderSentAt` to avoid duplicates.

---

## 9. Content upload and storage

1. Vienne drags in or picks a file → `POST /api/files` (multipart).
2. Server checks type by **file signature**, not just extension: PDF, PNG, JPG, WebP. Max **25 MB**.
3. File saved via the `StorageAdapter`; a `FileAsset` row is created.
4. The file is attached to a `Resource`, `Question` image, or `Submission`.
5. **Video:** YouTube/Vimeo links, not uploads (size, cost, mobile performance).
6. **Downloads** always go through `GET /api/files/[id]`, which checks: admin, or an active parent whose child can see the resource / owns the submission. Copied links don't work for anyone else. In production, this returns a short-lived signed URL.
7. **Homework photos:** parents upload a photo or PDF of finished work through the same pipeline.
8. **Visibility:** `ALL` active students, `GRADES` (matches `gradeMin`–`gradeMax`), or `SELECTED` (via `ResourceShare`). Only `PUBLISHED` resources reach parents.

---

## 10. Admin capabilities (backend coverage)

| Area | What Vienne can do |
|---|---|
| Today | Today's sessions with addresses, pending requests, grading queue count, unread messages, notification feed |
| Requests | Approve / decline (with reason); clash warnings |
| Calendar | Week/day views; add, reschedule, cancel; complete with session note; mark no-show |
| Families | Invite families, manage parents (status, password reset), add/edit/archive students, private notes |
| Content | Subjects & skills, library (upload, tag, draft/publish, share, preview toggle), question bank |
| Assignments | Build quizzes from the question bank, assign with due dates, grade and return work |
| Reports | Draft, rate skills, publish whenever she chooses |
| Messages | Inbox with one thread per family |
| Settings | Weekly hours, time off, locations, session lengths, buffers, notice/cancel windows, booking horizon |

---

## 11. Security and privacy

- Passwords hashed (bcrypt/argon2); never stored or logged in plain text.
- Rate limiting on sign-in and invite redemption.
- Zod validation on every server action; server actions provide CSRF protection.
- Parent scoping enforced in `server/` functions, not only in the UI.
- Rich text rendered from Tiptap JSON — no raw HTML injection.
- Private file storage with permission-checked downloads.
- Admin-only fields (`adminNotes`) never included in parent queries.
- **Children's privacy:** all students are under 13. Collect only what's needed (name, grade, subjects, goals), and keep accounts parent-created and parent-controlled. Review COPPA requirements before launch (not legal advice).

---

## 12. Environment and setup

```bash
DATABASE_URL="file:./dev.db"            # Postgres URL in production
AUTH_SECRET="…"                         # npx auth secret
AUTH_GOOGLE_ID="…"
AUTH_GOOGLE_SECRET="…"
ADMIN_EMAIL="vienne@…"                  # gets ADMIN role on first sign-in
CRON_SECRET="…"
STORAGE_DRIVER="local"                  # local | s3
UPLOAD_DIR="./uploads"
DEMO_MODE="true"                        # shows demo sign-in buttons
```

**Google OAuth setup**

1. Create a Google Cloud project → APIs & Services → OAuth consent screen (External, app name "Mentoring Minds", add logo).
2. Credentials → Create OAuth client ID → Web application.
3. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://<production-domain>/api/auth/callback/google`
4. Copy the client ID and secret into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

The demo runs without Google configured (email sign-in + demo buttons).

---

## 13. Demo seed data

- **Admin:** Vienne Elliott
- **Families:** 4 active parents, 6 students across K–6; 1 Preview account; 2 open invite codes
- **Subjects & skills:**
  - **Math:** Counting & Cardinality, Addition & Subtraction, Place Value, Multiplication & Division, Fractions, Decimals, Measurement & Data, Geometry, Word Problems, Ratios & Proportions
  - **Reading:** Phonemic Awareness, Sight Words, Fluency, Vocabulary, Comprehension
  - **Phonics:** Letter Sounds, Blends & Digraphs, Vowel Teams, Multisyllable Words
  - **Writing:** Handwriting, Sentence Structure, Grammar & Punctuation, Paragraph Writing
- **Scheduling:** Mon–Thu 3:00–7:00 PM, Sat 9:00 AM–1:00 PM; Vienne's Studio, Student's Home, Central Library; one week of time off
- **Sessions:** past completed sessions with notes, upcoming confirmed sessions, 2 pending requests, 1 cancellation
- **Content:** ~12 resources (worksheets, videos, notes, links), several marked "show in preview"
- **Question bank:** ~20 K–6 questions tagged by skill
- **Assignments:** 3 quizzes + 1 upload task, mix of graded, submitted and assigned
- **Reports:** 2 published, 1 draft
- **Messages:** active threads with 3 families

---

## 14. Out of scope for the demo

- Payments, pricing and invoicing
- Email and SMS delivery (schema-ready)
- Group sessions
- Public landing page / website CMS
- Native mobile apps (responsive web covers phone and tablet; REST layer possible later)
- Self-serve password reset by email
