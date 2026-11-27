# Deploying: Vercel, Neon, Vercel Blob

What runs where, and the one-time setup. The running costs are in `docs/COSTS.md`. The setup as clicks, in
order, for the person doing it: `docs/PRODUCTION_SETUP.md`.

| Piece | Service | Notes |
|---|---|---|
| App, server functions, daily cron | **Vercel Pro** | Hobby is for non-commercial use only. |
| Database | **Neon** (Postgres) | Free plan |
| Files (work photos, worksheets) | **Vercel Blob** (private store) | Paid from Pro's monthly credit: pennies at this size |
| Sign-in | Google (Auth.js) + email/password | |
| Push notifications | Web push (VAPID keys) | Optional |

## 1. Neon

1. Create a project in region **AWS US East 2 (Ohio)**. Set the Vercel project's Functions region to **Cleveland (`cle1`)** to match (Settings → Functions → Region).
2. Copy two connection strings:
   - **Pooled** (the host contains `-pooler`) → `DATABASE_URL`
   - **Direct** → `DIRECT_URL`, used by migrations
3. Branches `preview` and `dev` for preview deployments and local work (`docs/PRODUCTION_SETUP.md` Part 1).
4. **After a password reset**, update `DATABASE_URL` and `DIRECT_URL` in Vercel for every environment on that branch, then redeploy and promote production (`docs/PRODUCTION_SETUP.md` Part 1, the note after step 5).

## 2. Vercel Blob (files)

1. In the Vercel project, open **Storage** → **Create Storage** → **Blob**. Set the access to **Private**.
2. Tick **Add a read-write token env var to this connection**. Client uploads need `BLOB_READ_WRITE_TOKEN` to issue one-file upload tokens.
3. Connect the store to **Production** and **Preview**, and to **Development** too if you want real uploads locally (`vercel env pull`). Without it, local development uses the `./uploads` folder.

How files move:
- **Uploads** go from the phone straight to the private store. The token route (`/api/files/blob`) only issues a token for a file the server reserved for that signed-in user, at its exact path, type and size. `content.finishUpload` then checks the stored size and the file's real type, and deletes fakes.
- **Downloads** always go through `/api/files/[id]`, which checks permission on every request and streams the file.
- **Caching:** photos of children's work are sent with `Cache-Control: private, no-store`, so nothing is kept on a shared family phone. Worksheets are sent with `private, no-cache`, so the browser keeps a copy but checks with the server each time.
- Private blobs have no public URL, so a leaked link opens nothing.

## 3. Google sign-in

In Google Cloud Console → APIs & Services → Credentials, create an OAuth client (Web).

- **OAuth consent screen:** user type **External**, app name "Mentoring Minds", Vienne's email as support contact. Scopes: only the defaults (email, profile, openid), so Google doesn't need to review the app. Then **Publish app** (status "In production"). While it says "Testing", only the test users listed there can sign in, and parents get a Google error.
- **Authorised JavaScript origin:** `https://mentoringmindsacademy.org`.
- **Authorised redirect URI:** `https://mentoringmindsacademy.org/api/auth/callback/google`, plus `http://localhost:3000/api/auth/callback/google` for local work. Preview deployments have changing addresses, so Google won't work there: use email and password on previews.
- **Client ID / secret** → `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`
- **No `AUTH_URL`.** On Vercel, Auth.js trusts the forwarded host (`VERCEL` is set), so it builds its callback from the address the visitor used. `www.mentoringmindsacademy.org` and `mentoring-minds.vercel.app` redirect to the apex with a 308 before reaching the app, so that address is always the apex. The app builds no other absolute links: push links and sign-in redirects are paths, and there's no email yet. If `AUTH_URL` were set, sign-in on a Staged deployment's own address would send you to the live site.

Google is optional. Without both keys, the sign-in screen simply doesn't show the Google button. If Google sign-in fails (say, an unconfirmed email), the parent lands back on the sign-in screen with a plain message.

### How sign-in behaves (for support questions)

- **Accounts:** a parent creates one with email and password, or with Google. It starts locked ("preview") until they enter Vienne's invite code. Only `npm run db:seed` makes an admin.
- **Same email, both ways:** a Google sign-in joins an existing email/password account with that address. If nobody ever proved they own that email (it was typed into the sign-up form), its password is removed and its sessions end, in case someone registered a parent's address first.
- **Wrong passwords:** 5 in a row pause password sign-in for that account for 15 minutes. Google sign-in still works.
- **Forgot password:** Vienne taps "Reset password" on the family page and passes on the temporary password. The parent is asked to choose a new one after signing in. There's no email reset link (no email service yet; see "Hardening later").
- **Sessions** last 30 days. A password change or reset signs out every other device right away. Pausing a family takes effect on their next tap.
- **Start-up check:** in production the server refuses to start if a secret is missing or unsafe (`src/lib/env-check.ts`). The deployment log names the problem.

## 4. Vercel

1. Import the repo. The framework is Next.js. The build command comes from `vercel.json` (`npm run vercel-build`). On previews it applies migrations to the preview database, then builds. On production it only checks whether the database is up to date, then builds; it never migrates production (see **Releasing**).
2. Set the environment variables below for **Production**. **Preview** uses the Neon `preview` branch's URLs, and **Development** the `dev` branch's.
3. Deploy, then seed once from your machine, pointed at production:

```bash
SEED_LOCATIONS_FILE=~/mm-locations.json DATABASE_URL="<neon pooled url>" ADMIN_EMAIL="vienne's google address" ADMIN_NAME="Vienne Elliott" npm run db:seed
```

This loads settings (Miami time, the FAST windows), Math and Vienne's skills, the books, the weekly hours and the locations from `SEED_LOCATIONS_FILE` (a JSON file outside the repo, `docs/PRODUCTION_SETUP.md` Part 6; required while production has none), and creates her admin account. Run it again whenever you like: it never overwrites her changes. **Never run `db:seed:demo` against production.** It refuses unless forced.

4. **Cron:** `vercel.json` runs `/api/cron/daily` at 13:00 UTC, which is 8 AM in Miami (9 AM in summer). It sends session reminders for today and tomorrow, empties the 30-day resource bin, and removes unfinished uploads. Crons only run on the production deployment. Vercel sends `CRON_SECRET` as a Bearer token, and the route rejects anything else.
   - **Why `crons` and not Vercel Schedules (yet):** Schedules would run the job as a private function, with
     no public route and no secret, and `timezone: "America/New_York"` would keep it at 8 AM all year.
     But it's in beta (`schedule/v1beta`), it needs `@vercel/schedules` and a route change, and Vercel keeps
     existing `crons` working. Move it after launch (P-ops report, S ticket), keeping the name `daily`.

## Releasing

Decision D5 (Javaris, 2026-11-26): production migrations are run by Javaris, never by a build.

- "Auto-assign Custom Production Domains" is **off** (`docs/PRODUCTION_SETUP.md`, Part 2, step 8). A merge to
  main builds a production deployment marked **Staged**. The live site doesn't change.
- A production build never runs `prisma migrate deploy` (`scripts/vercel-build.mjs`). It runs
  `prisma migrate status` instead. If the database lacks a migration in the build, the log shows
  **PRODUCTION DATABASE NOT UP TO DATE**.

To release:

1. Open the Staged deployment's **Build Logs**. If they say the database is up to date, skip to step 3.
2. If they say **PRODUCTION DATABASE NOT UP TO DATE**, Javaris migrates first, from the fresh clone in
   `PRODUCTION_SETUP.md` Part 6:
   ```bash
   cd ~/mm-prod-ops && git pull && npm ci
   read -rsp 'Neon main (production) DIRECT url: ' DIRECT_URL && echo && export DIRECT_URL DATABASE_URL="$DIRECT_URL"
   npx prisma migrate status     # lists the new migration(s) as not yet applied
   npx prisma migrate deploy
   unset DIRECT_URL DATABASE_URL
   ```
   The live (older) code keeps working, because migrations here only add (see **Changing the database later**).
3. On the Staged deployment, **⋯ → Promote**, and confirm. Promote doesn't rebuild.
4. Check **Settings → Environments → Production → Branch Tracking**: auto-assign is still off.

A Staged deployment uses production's variables and database, so opening its own address is a real
production session. Check it there only as Vienne.

## Rollback

A bad deployment goes back to the previous one in about a minute, without a rebuild.

1. **Vercel → Deployments**, then the last good **Production** deployment, **⋯ → Instant Rollback**, and confirm.
2. Production now serves that build. Merges to main still build Staged deployments, as always (**Releasing**).
3. Fix forward on main, then promote the fixed deployment (**Releasing**, step 3). Then check that
   auto-assign is still off (step 4). Vercel's docs say a promote after a rollback turns auto-assign back
   on. They don't say what an ordinary promote does. P-ops check 7 records what it does here.

A rollback brings back that deployment's environment variables too. After a Neon password reset, rolling back to a deployment from before it can't reach the database.

A rollback changes code only, never the database. If Javaris applied a migration for the bad deployment,
the old code runs against the new schema. Migrations here only add, so that works, but check the migration first (see
**Changing the database later**). Rehearsal, on a preview: `plan/reports/P-ops.md`.

## Restoring the database

Neon keeps a history window: 6 hours on Free, up to 7 days on Launch. You can restore to any moment inside it.

1. **Neon → Branches → Create branch.** Parent `main`, **from a point in time**, just before the problem.
   Name it `restore-<date>`. This copies nothing over `main`.
2. Check the new branch: connect with its URL and look at the rows you lost.
3. Only then, and only Javaris, either restore `main` to that time (**Branches → `main` → Restore**; Neon
   keeps the old state as a backup branch) or copy the few rows across. Delete `restore-<date>` afterwards.

Rehearsal timings: `plan/reports/P-ops.md`.

## Deleting a family or a child on request

A parent can ask for their family, or one child, to be removed (S23). Since S23b the app finds everything by id,
never by name or email, so a delete can't touch another family's rows. It deletes for good, so
**Javaris** approves each request first. **Vienne** then runs it in the app.

1. **Check the request.** It comes from the parent on that account, through a message in the app or from the
   email the account uses. It says whether it covers the whole family or one child.
2. **Javaris approves** it. Keep the request and the approval somewhere private, never in this repo.
3. **Save anything Vienne must keep first**, such as a report she owes the school. Nothing can be downloaded
   once the delete runs.
4. **Vienne:** Families → the family. Use **Delete family** at the top, or **Delete** on the child's card.
   Read the list of what goes, tap **Continue**, type the name exactly as shown, then delete.
5. **Afterwards:**
   - The family or child is gone from every screen.
   - Files only they used are removed from Blob just after the delete. Library resources stay, but they're
     no longer shared with them.
   - A deleted parent's account is gone, so they can't sign in.
   - The invite code the parent used goes with a family. When one child is deleted, the child comes off that
     code. Codes the parent never used stay as they are, even ones sent to their email: under **Invite codes**,
     revoke any that's still active.
   - Vienne's alerts linked to them go too, and no other family's. Alerts linked to nobody stay.
6. **Tell the parent it's done.** Neon's history still holds the old rows until the restore window passes
   (up to 7 days, **Restoring the database**). Say that everything is gone within that window.

A mistaken delete can come back only from Neon's history, inside that window. Only Javaris restores
(**Restoring the database**), and he copies back only that family's rows, never all of `main`.

## Environment variables

| Variable | Where | What |
|---|---|---|
| `DEMO_MODE` | none | Retired in S6: sign-in is always on, and the app ignores this variable. Leave it unset. |
| `DATABASE_URL` | all | Neon **pooled** URL |
| `DIRECT_URL` | all | Neon **direct** URL (migrations) |
| `AUTH_SECRET` | all | `npx auth secret` |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | all | Google OAuth client |
| `INVITE_PEPPER` | all | Long random string. **Never change it after launch**: existing invite codes would stop working. |
| `BLOB_READ_WRITE_TOKEN` (+ `BLOB_STORE_ID`, set by Vercel) | all | Added when you connect the Blob store with a read-write token. Without it, production uploads are refused. |
| `CRON_SECRET` | production | Random letters and numbers, 16 or more |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | optional | `npx web-push generate-vapid-keys`. Push stays off until these are set. |
| `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` | seed only | Vienne's account. With Google sign-in, use her Google address; the password is optional. |
| `DATABASE_POOL_MAX` | optional | Connections per function instance (default 5) |

## Changing the database later

```bash
# edit prisma/schema.prisma, then:
npx prisma migrate dev --name what-changed   # writes prisma/migrations/<time>_what-changed
git add prisma && git commit
```

CI fails if `schema.prisma` and the migrations disagree. Preview builds apply new migrations to the preview database. Production gets them only when Javaris runs `prisma migrate deploy` before promoting (**Releasing**). So a migration must only add (new tables, new nullable or defaulted columns), and the code already live must keep working with it. Renames and drops take two releases.

## Before launch

Who does each one, and what it waits on. Javaris does every click in Vercel, Neon and Google;
the audit tickets (P-product, P-ops) check the result. Production setup starts after W8.

- [x] `npm run build && npm test` green in CI: the required `check` job, green on main after W8 (3828ab3). P-product, 2026-11-26.
- [ ] The AI features are gone: code, schema, the Claude SDK and `ANTHROPIC_API_KEY` (S33), before Javaris's first production migrate. **Lanes**, held for Zero (Javaris, 2026-11-27).
- [ ] Blob store is **Private**, with a read-write token on the connection. **Javaris** at setup; P-ops checks a raw Blob URL doesn't open.
- [ ] `CRON_SECRET` set; after the first 13:00 UTC run, the job shows 200 in Vercel → Schedules → Cron Jobs → View Logs. **Javaris** sets it; **Atlas** (P-ops) reads the first run. Waits on the first production deploy.
- [ ] Vienne signs in with Google and lands on Today (the consent screen is published, not "Testing"). **Javaris with Vienne**, on her account. Waits on Google OAuth setup.
- [ ] A parent's Gmail address can sign in with Google on a phone. **Javaris**, with a test parent's Gmail. Waits on Google OAuth setup.
- [ ] `DEMO_MODE` isn't set anywhere in Vercel → Settings → Environment Variables. Since S6 the app ignores it, so a leftover one is only clutter: delete it. **Atlas** (P-ops env check).
- [ ] Invite code → a test parent redeems it → sees their child. Passes on a production build (`w2-families-invites.spec.ts`). **Javaris** repeats it once on the real site.
- [ ] A photo upload from a real iPhone and a real Android phone. **Javaris**. The emulated part passes on a production build (`p-product.spec.ts`: JPEG sent and opened by Vienne, HEIC and over-`MAX_BYTES` files refused with a plain message). On the iPhone, try one photo from the camera and one from the library (Safari normally sends JPEG; a HEIC gets "Use a PDF, PNG, JPG or WebP file").
- [ ] Turn on Neon's point-in-time restore window (Free covers recent history; check the current limit). **Javaris**; P-ops rehearses one restore into a new branch.
- [ ] `mentoringmindsacademy.org` serves production; `www.mentoringmindsacademy.org` and `mentoring-minds.vercel.app` 308 to it, and all three follow each Promote. **Atlas** set them up (2026-11-27); P-ops check 8 confirms after the first promote.
- [ ] "Auto-assign Custom Production Domains" is off (D5); a merge to main shows up **Staged**, and `PROD_URL` keeps the old build until Promote. **Javaris** sets it (setup Part 2); **Atlas** (P-ops) checks the next merge.
- [x] Preview and paused parents see their screen, not an endless loading skeleton or an error (S8). Merged (#49) and checked (#50); `p-product.spec.ts` runs both without a `fixme`.
- [x] Real locations decided: entered at seed time from a file outside the repo, never in it (Javaris, 2026-11-26). S28 (#118) and S32 (#121) are merged and checked; the steps are `PRODUCTION_SETUP.md` Part 6 (#116).
- [x] The library sends families no other family's children (S15, #76) and Vienne's email can't be squatted before the seed (S19, #82). Both merged and checked.
- [x] Deleting a family or a child matches only by id (S23b, #107), merged and checked; the Delete buttons are back and the runbook is **Deleting a family or a child on request**. S23 is closed, superseded by S23b.
- [x] Firewall rate limit on sign-up and sign-in: **after launch** (Javaris, 2026-11-26). Accepted risk: throwaway accounts can pause invite codes for everyone for up to an hour (`GLOBAL_REDEEM_FAILURES_PER_HOUR`).

## Limits

What stops guessing and runaway costs. Each is a named constant, and `tests/integration/p-sec.test.ts` reaches it.

| Limit | Where | What it does |
|---|---|---|
| `MAX_FAILED_LOGINS` (5) | `src/lib/auth.ts` | Wrong passwords in a row lock password sign-in on that account for `LOCK_MINUTES` (15), even with the right password. |
| `MAX_FAILURES` (10) | `src/server/invites.ts` | Wrong invite codes lock code entry on that account for an hour. |
| `GLOBAL_REDEEM_FAILURES_PER_HOUR` (30) | `src/server/invites.ts` | More wrong codes than this from everyone in an hour pause code entry for everyone, and Vienne is told. |
| `MAX_BYTES` (25 MB) | `src/lib/storage.ts` | The largest upload. Blob enforces it again on the upload token. |

No limit in the app yet, and what covers it:

- **Sign-up** (`createAccount` in `src/app/(auth)/sign-in/actions.ts`): covered by a Vercel Firewall rate-limit rule on `/sign-in` (Hardening later). A new account is a locked preview that sees teasers only until Vienne's code.
- **Sign-in by IP**: the lockout is per account, so one address can try a password across many emails. Covered by a Vercel Firewall rate-limit rule on `/sign-in` and `/api/auth/*` (Hardening later). Google sign-in is throttled by Google.
- **Messages, session requests and uploads** from an active family: only families Vienne gave a code can send them, and abandoned uploads are removed by the daily clean-up. Hardening later, if one is ever abused.

## Dependency notes

- **`overrides` in package.json** move three nested packages onto patched versions, so `npm audit --omit=dev` is clean:
  - `zod`, pulled in by `@vercel/blob` → `@vercel/oidc` → `@vercel/cli-config`. It's forced to the app's own zod.
  - `effect` (^3.22.5) and `deepmerge-ts` (^8), pulled in by the Prisma CLI's config loader.
  
  The Prisma CLI, generate and the tests all pass with these. Remove an override once the parent package ships the fix itself.
- **Keep `pg` on 8.x.** Inside a transaction, Prisma loads a row's relations in parallel on one connection. pg 8 queues those queries and prints a deprecation warning, which is harmless. pg 9 drops that queueing. Upgrade only together with a Prisma version whose `@prisma/adapter-pg` supports pg 9.
- **Prisma 6.19 → 7** is a separate, planned upgrade (new generator and config). Don't take it as a side effect of `npm audit fix --force`.

## Hardening later

- **Content-Security-Policy with script nonces.** `next.config.ts` sets a starter policy: no framing, no plugins, no `<base>` changes. A full `script-src` policy needs per-request nonces (Next.js `proxy.ts` + `headers()`). Worth doing once the app is live, then testing every screen.
- **Email password reset and address confirmation.** Needs an email service (for example Resend, free for this volume). Until then Vienne resets passwords, and Google sign-in is the way to prove an address.
- **Rate limiting** on sign-up and sign-in by IP (for example Vercel Firewall rate-limit rules on `/sign-in` and `/api/auth/*`). Accounts already lock after repeated wrong passwords or codes. Kept for later (Javaris, 2026-11-26). **The risk while it waits:** the shared invite-code limit (`GLOBAL_REDEEM_FAILURES_PER_HOUR`, above) can be tripped on purpose, and then no new family can enter a code until the hour passes. Families already unlocked aren't affected, and Vienne is told. If it happens, add the Firewall rule on `/sign-in` then: it takes minutes and needs no deploy.
