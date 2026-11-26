status: done
checks: 1 ✓ 2 ✓ 3 ✓ 4 ✓ 5 ✓ 6 ✓
tests: tests/integration/p-sec.test.ts (new, 21 tests). npm test and typecheck green on f/P-sec (main at 4c020a1).
notes: Audit by Zero. It adds tests and docs only. Findings that need app code are S tickets for the lanes (below), not fixed here.

## What was checked

1. **Endpoints (check 1).** The test reads `src/server/` itself, so a new file or export is covered without
   editing it. There are 98 exports in 13 files, all wrapped in `action()` or `query()`, and none is public
   (`PUBLIC` is empty: sign-in and sign-up are Auth.js and `src/app/(auth)/sign-in/actions.ts`).
   - Signed out, every export gets UNAUTHENTICATED. Nine parse first because their guard needs the parsed
     student id (`requireStudentAccess`). They get a valid input in `VALID_INPUT` and still say to sign in.
   - As Vienne, every export that takes input answers `42`, `'x'`, `[]` and `true` with INVALID. As a parent
     the answer is INVALID or FORBIDDEN. Nothing answers SERVER. The 15 that take no input are listed in
     `NO_INPUT`, and the test fails if one of them starts parsing input.
   - From the source: before `parse()`, only a guard may run (`await requireX()`). No lookup comes first.
   - Mutation check: dropping `requireUser()` from `scheduling.listLocations` fails the signed-out test.
2. **Leaks (check 2).** Every family-facing read (a `query()` whose guard isn't `requireAdmin`) is called in
   `leaks.test.ts` or `p-sec.test.ts`, checked from the source. The test calls them as an active parent (Ana, and
   Grace for the live call), a preview parent (Tom) and a paused one (Daniel). Failures are kept, so their messages
   are searched too.
   - No response carries `answer`, `passwordHash`, `codeHash`, `adminNotes`, `failedLogins`, `lockedUntil`,
     `sessionVersion`, `redeemFailures`, `redeemLockedUntil`, a `defaultMeetingUrl` or a time-off `reason`.
   - A `meetingUrl` appears only on a confirmed video call inside its join window.
   - A family's own writes (`updateStudent`, `setTextSize`, `saveAnswerDraft`, `sendMessage`, `requestSession`)
     don't echo any of these keys back either.
   - Mutation check: sending `defaultMeetingUrl` to families fails two tests.
3. **Routes (check 3).** The test lists every `route.ts` under `src/app/api` with what it checks, and fails on a new one:
   - `/api/files/<id>` (session): refused signed out (401), for another family's child's work (403) and for a
     paused parent (403).
   - `/api/files/blob` (session): no upload token signed out or for another family's reservation (400).
   - `/api/files/upload/<id>` (HMAC token): refused with no token and with another file's token (403), and off
     in production (404).
   - `/api/cron/daily` (secret): refused with no header, a wrong or truncated secret, or a missing `Bearer`
     (401). With `CRON_SECRET` unset, `Bearer ` and `Bearer undefined` are refused too.
   - `/api/auth/[...nextauth]`: public by design (it's how a visitor signs in). The test pins the file to a bare
     re-export of `handlers`.
4. **Limits (check 4).** Each limit is read from its source (the server ones aren't exported, or live in a
   'use server' file) and reached at exactly its value. One short of the limit still works:
   - `MAX_FAILED_LOGINS`: through the real Credentials `authorize` from `lib/auth.ts`. The test captures the
     Auth.js config, since `setup.ts` mocks `lib/auth`. The lock lasts `LOCK_MINUTES`, and the right password is refused until then.
   - `MAX_FAILURES` on one account, and `GLOBAL_REDEEM_FAILURES_PER_HOUR` (more than 30 locks everyone).
   - `AI_DAILY_LIMIT`, counted before Claude is called.
   - `MAX_BYTES`: exactly 25 MB is accepted, one byte more is refused.
   - `docs/DEPLOY.md` has a new **Limits** section: the five constants, plus what has no limit in the app and what
     covers it. Sign-up and sign-in by IP fall to a Vercel Firewall rule (Hardening later). The test checks the section.
5. **Migrations (check 5).** All 4 migrations are applied to a fresh throwaway database, which is then diffed
   against `schema.prisma` with `prisma migrate diff --exit-code`. There's no drift, and on failure the test prints
   the missing migration. No migration drops a table or column (`DROPS_ALLOWED` is empty). Production builds don't
   migrate: D5, Atlas's #42. Javaris runs `migrate deploy` before promoting a release that has a migration.
6. **Dependencies (check 6).** `npm audit --omit=dev`: 0 vulnerabilities (the full `npm audit` too). `pg` is
   ^8.23.1. Nothing new for Dependency notes, and `npm audit fix` wasn't run.

## Findings

None is high. Two small ones need app code, so they're S tickets for the lanes (Axis adds them to the plan):

- **S-sec1, `content.getFileForUser` returns the raw `FileAsset` row** (`storageKey`, `uploadedById`, …) plus
  `url`. That breaks AGENTS rule 3 (DTOs, never rows). `storageKey` alone doesn't open a private Blob, so
  nothing leaks today, but a column added later would. Also, it calls `found(file)` before the NOT_ACTIVE check,
  so a preview or paused account can tell whether a file id exists (NOT_FOUND vs NOT_ACTIVE). Fix: check the
  account first, then return `{ id, filename, mimeType, sizeBytes, url }`. Touches `src/server/content.ts` and
  `src/lib/dto.ts` (held for Zero). Check: the leak sweep's `SECRET_KEYS` gains `storageKey` and `uploadedById`, and a
  preview account gets NOT_ACTIVE for a real id and for a made-up one.
- **S-sec2, sign-up accepts any password length, but sign-in caps it at 200.** `createSchema` in `sign-in/actions.ts`
  has no `max`, while `credentialsSchema` in `lib/auth.ts` has `max(200)`. A 201+ character password creates an
  account that can never sign in by password (`changePassword` already caps at 200). Fix: the same
  `max(200, 'That password is too long')` on sign-up. Touches `src/app/(auth)/sign-in/actions.ts`, which S6 also
  touches (`src/app/(auth)/sign-in/`), so S-sec2 follows S6.

Accepted, no ticket:

- **Sign-up says "There's already an account with that email."** That tells a stranger an email is registered.
  It's kept for families (plain words, what to do next). The Firewall rule on `/sign-in` (DEPLOY → Limits) limits
  bulk probing. Sign-in's own message is generic.
- **`savePushSubscription` upserts by endpoint**, so the last signed-in user on a device gets its pushes. Endpoints
  are unguessable, browser-held URLs, and on a shared family phone this is what should happen.
