status: done
checks: independent review of P-sec (#54), P-product (#43) and P-ops (#42), read-only, at 432ce59
tests: none (review only). Each finding below was spot-checked by OSA in the code; Axis re-checked them when writing the tickets.
notes: Review by OSA, committed by Axis. Findings that need app code are S tickets for the lanes (S15–S23 in plan/features.json). Javaris's decisions are recorded in CHANGES.md (2026-11-26).

## Launch blockers

1. **The library sends families other families' children (S15).** `content.listResourcesForStudent` maps every
   row through `resourceDTO` (`src/lib/dto.ts`), which includes `sharedWith` (name, grade and `parentId` of every
   student a resource is shared with) and the raw `file` row. `leaks.test.ts` only looks for secret keys, so it
   didn't catch it. Fix: a family DTO with neither.
2. **The production seed would insert the demo locations.** `loadReference` (`prisma/data.ts`) loads the
   locations from `prisma/demo/seed.js`, and `src/server/scheduling.ts` has no way to add or change a location,
   so Vienne couldn't fix them. **Javaris: wait.** No ticket yet. The production seed (PRODUCTION_SETUP Part 6) is
   on hold until he decides the real locations. The demo locations must never reach production.

## Should fix soon

3. **Push taps always open "/" (S16).** `src/lib/push.ts` sends `url`, and `public/sw.js` reads `href`. The `tag`
   isn't passed to `showNotification`, so repeats stack up.
4. **Files are never deleted once used (S17).** Replaced work photos and uploads that were never attached stay in
   the database and in Blob, and a parent can reserve any number of 25 MB uploads. Also, the daily clean-up's
   "still in use" check counts `resource.fileId` and `submission.fileId` but not the photos inside a submission.
5. **A practice assignment can point at a resource its students can't see (S18).** `createPracticeAssignment`
   doesn't check visibility, so the family gets "Forbidden" on the worksheet.
6. **`ensureAdmin` keeps a squatter's password (S19).** If someone signs up with Vienne's email before the
   production seed, the seed promotes that account to admin and keeps its password and sessions.
7. **A preview account sees the location address and Vienne's open times.** Product call. **Javaris: no
   change.**
8. **AI calls that fail don't count toward `AI_DAILY_LIMIT` (S20).** Only saved drafts are counted, so refusals,
   too-long and garbled answers can be retried without limit.
9. **SUSPECT: a large answer-key photo gets a generic error (S22).** `readAnswerKeyPage` takes the photo as base64
   in a server action, and `serverActions.bodySizeLimit` is 4 MB (`next.config.ts`). Confirm it first.
10. **`mustChangePassword` is enforced only in the browser (S21).** Low: the account's own temporary password is
    needed anyway.

## For Javaris, before or after launch

- **Firewall rate limit on sign-up and sign-in: after launch.** Javaris accepted the risk. Throwaway accounts can
  use up `GLOBAL_REDEEM_FAILURES_PER_HOUR` and pause invite codes for everyone until the hour passes.
- **Deleting a family's or a child's data on request: approved (S23).** Admin only, removes the records and their
  Blob files, and asks twice. Today there is no delete path, and most relations don't cascade.
- **Locations, FAST dates and weekly hours in the seed:** Javaris confirms them before the production seed.
