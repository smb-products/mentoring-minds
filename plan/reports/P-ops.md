status: waiting (production setup by Javaris: docs/PRODUCTION_SETUP.md, PR #39)
checks: 1 … 2 ✓ (decision; production run after setup) 3 … 4 … (steps written) 5 … (caps documented) 6 … (steps written) 7 … (D5 built here; verified after setup)
tests: tests/vercel-build.test.ts (D5: production builds never migrate). Existing: tests/env-check.test.ts (productionProblems), tests/integration/jobs-ai.test.ts ("the cron route needs the secret"), tests/proxy.test.ts (API routes outside the page guard)
notes: Done before production exists: the setup checklist, the cron decision, rollback and restore steps, spend caps in COSTS.md, and the four findings below. Every check that needs the real project is listed under "After setup", with how Atlas checks it.

## Checks

1. **Env check.** Waits on setup. After Part 5, Atlas lists each environment's variable names with `vercel env ls`
   (names only, never `vercel env pull`). It checks them against `productionProblems` (`src/lib/env-check.ts`)
   and the table in `docs/PRODUCTION_SETUP.md` Part 5, and confirms `DEMO_MODE` and `ALLOW_LOCAL_UPLOADS` are
   absent in Production, Preview and Development. The start-up check refuses to run production with a
   missing secret, so a clean production boot (Part 7) is the second proof.
2. **Cron.** The route refuses a missing or wrong secret. `tests/integration/jobs-ai.test.ts` covers both,
   and `authorized()` returns false when `CRON_SECRET` is unset. **Decision: keep `crons` for launch.**
   Vercel Schedules (a private function target with `timezone: America/New_York`) is better: there's no
   public route, no secret, and 8 AM all year instead of 9 AM in summer. But it's beta (`schedule/v1beta`),
   needs `@vercel/schedules` (deps are Zero's) and a route change (src/app/api is held), and existing `crons`
   keep working. That's ticket S-ops4 below. After setup: `curl` the production route without the secret
   (expect 401), and see the first 13:00 UTC run return 200 in the cron logs.
3. **Blob is private.** Waits on setup. Atlas uploads a demo photo on a **preview** and requests its raw
   `*.private.blob.vercel-storage.com` address with no token: expect 403. It also checks the same file
   opens through `/api/files/<id>` signed in, and not signed out. On production, Atlas only reads the
   store's access setting (Private). No family file is touched.
4. **Neon restore.** Waits on setup. Steps are in `docs/DEPLOY.md` → Restoring the database: branch from a
   point in time, never over `main`. The rehearsal runs on `main` right after Part 6, while it holds only
   the seed. Atlas times it here; Javaris clicks.
5. **Spend caps.** Documented in `docs/COSTS.md` → Spend caps, next to `AI_DAILY_LIMIT` (150 a day, worst
   case about $0.35 a day). The caps themselves are Javaris's clicks (Part 8); Atlas confirms each from a
   screenshot or a one-line "set to $X".
6. **Rollback.** Waits on setup. Steps are in `docs/DEPLOY.md` → Rollback. Vercel's Instant Rollback only
   exists for production, so the preview rehearsal is the same move by hand. Atlas makes two preview
   deployments (`vercel deploy --target=preview`), points one preview alias at the newer one
   (`vercel alias set`), then back at the older one. That's the same instant switch, with no rebuild. It's
   timed here, and production is never touched. The dashboard's Instant Rollback button is noted for
   Javaris's first real release.

## Findings (S tickets for the lanes, not fixed in this audit)

- **S-ops1, decided D5 = manual (Javaris, 2026-11-26), done in this PR: production migrations ran on every
  deploy.** `scripts/vercel-build.mjs` ran `prisma migrate deploy` whenever `DATABASE_URL` was set, Production
  included. Now:
  - a production build runs only `prisma migrate status`, and its log warns when the database is behind;
  - previews still migrate their own database;
  - the checklist turns off auto-assignment, so merges build Staged deployments
    (`PRODUCTION_SETUP.md` Part 2, step 8);
  - `docs/DEPLOY.md` → Releasing: Javaris migrates, then promotes.

  `tests/vercel-build.test.ts` covers the three cases. Open: Vercel's docs don't say whether a Promote turns
  auto-assignment back on. The checklist says to look after each promote, and check 7 below verifies it.
- **S-ops2 (became S11, #59; reopened by #62 for `?host=`): the demo seed's production guard ignores the URL.** `prisma/seed.ts` refuses `--demo` only when
  `VERCEL_ENV` or `NODE_ENV` is `production`. A laptop shell with the production URL in `DATABASE_URL`
  loads the demo families into production. Fix: refuse `--demo` unless the database's host is local, or its
  name contains `test`, `dev` or `preview`, or the database has no admin yet; `--force` still overrides.
  Files: prisma/seed.ts (held for Zero), a test.
- **S-ops3 (became S12, #58, merged): Node version.** `package.json` `"engines": ">=20.9"` lets Vercel pick its newest Node (26), and CI
  tests on 22. Pin `"22.x"` in `engines` (Vercel follows it), or move CI and engines to 24 or 26 together.
  The setup checklist pins 22.x in the Vercel settings in the meantime. Files: package.json (held for Zero).
- **S-ops4 (after launch): move the daily job to Vercel Schedules.** Use a private `function` target with
  `handleSchedule`, `timezone: America/New_York` at `0 8 * * *`, and the same name `daily`. Remove `crons`
  in the same change, then drop the `CRON_SECRET` check. Wait until Schedules leaves beta. Files: vercel.json,
  src/app/api/cron/daily/route.ts, package.json.

## Found and fixed in ops PRs (not this audit's PR)

- CI cancelled waiting runs on main: W8's own run, 8e57942, never ran. Fixed in #40 by grouping main and
  merge-queue runs by commit. W8 itself was proven by its merge-queue run on ffa2501.

## After setup (Atlas, once Javaris says "production is set up")

- [ ] 1: env names per environment; no DEMO_MODE anywhere; production boots. **Production done** (2026-11-27): the
  names match `src/lib/env-check.ts` (`DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `INVITE_PEPPER`, both Google keys,
  `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`, the three VAPID keys). `DEMO_MODE`, `ALLOW_LOCAL_UPLOADS` and
  `DATABASE_POOL_MAX` aren't set in any environment, and production boots. **Open:** Preview and Development have no
  `DATABASE_URL` or `DIRECT_URL` yet (Neon `preview` and `dev`, setup Part 5), so previews can't start.
- [ ] 2: production cron route without the secret → 401; first 13:00 UTC run → 200. **401 done** (2026-11-27, on
  `https://mentoringmindsacademy.org/api/cron/daily`). **Open:** the first 13:00 UTC run.
- [ ] 3: raw Blob URL without a token → 403 (preview file); the store shows Private. Waits on the preview database (check 1).
- [ ] 4: Neon restore into a new branch rehearsed and timed
- [ ] 5: the three caps confirmed set
- [ ] 6: instant rollback rehearsed on a preview and timed
- [ ] 7: D5: auto-assign is off, still off after Part 7's promote; the next merge to main is Staged; its build log
  shows `migrate status`, and no `migrate deploy`. **Mostly done** (2026-11-27). Every production build before the
  first promote stayed Staged, with no current deployment. Their logs ran `migrate status` only: the 15:23 UTC build
  of 7bd1f97 said "NOT UP TO DATE" (L2's `invite_attempts` was still pending), and the 15:25 UTC rebuild, after the
  migrate, said "Database schema is up to date!". After `vercel promote` of `dpl_4T9k4HVpWNdX89MRdxhZSYtqwxhs`,
  auto-assign is still **off**, so a promote doesn't switch it back on. **Open:** a merge after that promote stays Staged.
- [ ] 8: domain. **Done for the first promote** (2026-11-27, `dpl_4T9k…`, main 7bd1f97):
  - `https://mentoringmindsacademy.org/`, `/sign-in` and `/privacy` return 200.
  - `www.mentoringmindsacademy.org` and `mentoring-minds.vercel.app` return 308 to the apex with the path and query
    kept, and `http://` returns 308 to `https://`.
  - The certificate is Let's Encrypt for the apex and `*.mentoringmindsacademy.org`. It verifies and is valid to
    2027-02-25. HSTS, `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` are served.
  - The promoted deployment carries the apex, `www` and `mentoring-minds.vercel.app`. Its other `vercel.app` aliases
    and its own URL redirect to the Vercel login.
  - Auth.js reports `https://mentoringmindsacademy.org/api/auth/callback/google` as the Google callback.
  - **Open:** after the next promote, all three names serve the new deployment.
