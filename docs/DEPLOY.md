# Deploying: Vercel, Neon, Vercel Blob

What runs where, and the one-time setup. The running costs are in `docs/COSTS.md`. The setup as clicks, in
order, for the person doing it: `docs/PRODUCTION_SETUP.md`.

| Piece | Service | Notes |
|---|---|---|
| App, server functions, daily cron | **Vercel Pro** | Hobby is for non-commercial use only. |
| Database | **Neon** (Postgres) | Free plan |
| Files (work photos, worksheets) | **Vercel Blob** (private store) | Paid from Pro's monthly credit: pennies at this size |
| Sign-in | Google (Auth.js) + email/password | |
| AI drafts | Claude API (Haiku 5.5) | Set a monthly spend limit |
| Push notifications | Web push (VAPID keys) | Optional |

## 1. Neon

1. Create a project in region **US East (N. Virginia)**, close to Vercel's default region `iad1`.
2. Copy two connection strings:
   - **Pooled** (the host contains `-pooler`) → `DATABASE_URL`
   - **Direct** → `DIRECT_URL`, used by migrations
3. Optional: a `dev` branch for preview deployments and local work.

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
- **Authorised redirect URI:** `https://YOUR-DOMAIN/api/auth/callback/google`, plus `http://localhost:3000/api/auth/callback/google` for local work. Preview deployments have changing addresses, so Google won't work there: use email and password on previews.
- **Client ID / secret** → `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`

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
2. Set the environment variables below for **Production**. For **Preview**, use the Neon `dev` branch's URLs.
3. Deploy, then seed once from your machine, pointed at production:

```bash
DATABASE_URL="<neon pooled url>" ADMIN_EMAIL="vienne's google address" ADMIN_NAME="Vienne Elliott" npm run db:seed
```

This loads settings (Miami time, the FAST windows), Math and Vienne's skills, the books, locations and weekly hours, and creates her admin account. Run it again whenever you like: it never overwrites her changes. **Never run `db:seed:demo` against production.** It refuses unless forced.

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
   auto-assign is still off (step 4): Vercel turns it back on when a promote ends a rollback.

A rollback changes code only, never the database. If the bad deployment applied a migration, the old code
runs against the new schema. Migrations here only add, so that works, but check the migration first (see
**Changing the database later**). Rehearsal, on a preview: `plan/reports/P-ops.md`.

## Restoring the database

Neon keeps a history window: 6 hours on Free, up to 7 days on Launch. You can restore to any moment inside it.

1. **Neon → Branches → Create branch.** Parent `main`, **from a point in time**, just before the problem.
   Name it `restore-<date>`. This copies nothing over `main`.
2. Check the new branch: connect with its URL and look at the rows you lost.
3. Only then, and only Javaris, either restore `main` to that time (**Branches → `main` → Restore**; Neon
   keeps the old state as a backup branch) or copy the few rows across. Delete `restore-<date>` afterwards.

Rehearsal timings: `plan/reports/P-ops.md`.

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
| `ANTHROPIC_API_KEY` | all | Claude API key. Without it, the AI buttons say "type it in instead". |
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

Who does each one, and what it waits on. Javaris does every click in Vercel, Neon, Google and the Claude Console;
the audit tickets (P-product, P-ops) check the result. Production setup starts after W8.

- [x] `npm run build && npm test` green in CI: the required `check` job, green on main after W8 (3828ab3). P-product, 2026-11-26.
- [ ] Spend limit set in the Claude Console (e.g. $5/month). **Javaris**; P-ops checks it next to `AI_DAILY_LIMIT`.
- [ ] Blob store is **Private**, with a read-write token on the connection. **Javaris** at setup; P-ops checks a raw Blob URL doesn't open.
- [ ] `CRON_SECRET` set; after the first 13:00 UTC run, the job shows 200 in Vercel → Schedules → Cron Jobs → View Logs. **Javaris** sets it; **Atlas** (P-ops) reads the first run. Waits on the first production deploy.
- [ ] Vienne signs in with Google and lands on Today (the consent screen is published, not "Testing"). **Javaris with Vienne**, on her account. Waits on Google OAuth setup.
- [ ] A parent's Gmail address can sign in with Google on a phone. **Javaris**, with a test parent's Gmail. Waits on Google OAuth setup.
- [ ] `DEMO_MODE` isn't set anywhere in Vercel → Settings → Environment Variables. Since S6 the app ignores it, so a leftover one is only clutter: delete it. **Atlas** (P-ops env check).
- [ ] Invite code → a test parent redeems it → sees their child. Passes on a production build (`w2-families-invites.spec.ts`). **Javaris** repeats it once on the real site.
- [ ] A photo upload from a real iPhone and a real Android phone. **Javaris**. The emulated part passes on a production build (`p-product.spec.ts`: JPEG sent and opened by Vienne, HEIC and over-`MAX_BYTES` files refused with a plain message). On the iPhone, try one photo from the camera and one from the library (Safari normally sends JPEG; a HEIC gets "Use a PDF, PNG, JPG or WebP file").
- [ ] Turn on Neon's point-in-time restore window (Free covers recent history; check the current limit). **Javaris**; P-ops rehearses one restore into a new branch.
- [ ] "Auto-assign Custom Production Domains" is off (D5); a merge to main shows up **Staged**, and `PROD_URL` keeps the old build until Promote. **Javaris** sets it (setup Part 2); **Atlas** (P-ops) checks the next merge.
- [ ] Preview and paused parents see their screen, not an endless loading skeleton or an error (S8). **Lanes**; `p-product.spec.ts` runs it once S8 removes its two `fixme`s.

## Limits

What stops guessing and runaway costs. Each is a named constant, and `tests/integration/p-sec.test.ts` reaches it.

| Limit | Where | What it does |
|---|---|---|
| `MAX_FAILED_LOGINS` (5) | `src/lib/auth.ts` | Wrong passwords in a row lock password sign-in on that account for `LOCK_MINUTES` (15), even with the right password. |
| `MAX_FAILURES` (10) | `src/server/invites.ts` | Wrong invite codes lock code entry on that account for an hour. |
| `GLOBAL_REDEEM_FAILURES_PER_HOUR` (30) | `src/server/invites.ts` | More wrong codes than this from everyone in an hour pause code entry for everyone, and Vienne is told. |
| `AI_DAILY_LIMIT` (150) | `src/lib/ai/prompts.ts` | AI drafts per 24 hours (only Vienne can ask), counted before Claude is called. The Claude Console spend limit backs it. |
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
- **Rate limiting** on sign-up and sign-in by IP (for example Vercel Firewall rate-limit rules on `/sign-in` and `/api/auth/*`). Accounts already lock after repeated wrong passwords or codes.
