# Production setup, click by click

For Javaris. You create the accounts, paste the secrets and run the production migrate and seed. Atlas
wrote the steps and checks the result afterwards. `docs/DEPLOY.md` explains why each piece exists; this page
is only the clicks.

**Secrets never leave the service they belong to.** Each one goes from the command that makes it, through
your clipboard, straight into a Vercel field. Never put one in chat, a file, a PR, a message or a terminal
you share. A secret that goes anywhere else gets rotated.

You need: about an hour, a card for Vercel Pro, and **Vienne at the keyboard for Part 4** (her Google
account owns the sign-in client).

## Decisions before you start

Decided 2026-11-26 (Javaris, via OSA): D1–D4 as recommended, and D5 **manual**. D5 changed on 2026-11-27 to
**auto-promote with a migration guard** (Javaris, via OSA).

| # | Decision | Chosen | Why |
|---|---|---|---|
| D1 | Neon: its own account, or through the Vercel Marketplace | **Its own account** | The Marketplace's preview integration makes each preview database a copy of production, which would put real family data in every preview. It also names the direct URL `DATABASE_URL_UNPOOLED`, but the app reads `DIRECT_URL`. |
| D2 | Address: a custom domain, or `<project>.vercel.app` | **`mentoringmindsacademy.org`** (Javaris bought it on Vercel, 2026-11-27) | The apex is production. `www` and `mentoring-minds.vercel.app` redirect to it with a 308, so Google needs only one redirect address (Part 4, step 4). |
| D3 | One Blob store, or one for production and one for previews | **Two stores** | A preview deployment runs code that hasn't launched yet. With one shared store, its token could read or delete families' photos. |
| D4 | Neon plan | Free to start | Free keeps 6 hours of restore history. Launch (paid, by usage) keeps up to 7 days. See [Neon's history window](https://neon.com/docs/introduction/history-window). |
| D5 | Production migrations after launch | **You migrate; every other merge goes live by itself** (auto-promote, 2026-11-27) | RULES.md says production migrations are yours. Production builds never run `prisma migrate deploy`; previews still do, on their own database. A merge to main goes live as soon as its build is ready. A production build **fails** when production lacks one of its migrations, so it never goes live and the site stays on the last good deployment. You migrate, then redeploy it. `docs/DEPLOY.md` → Releasing has the steps. |

## Part 1. Neon (database), about 10 min

1. Sign up at **console.neon.tech**, then **New project**.
   - Name: `mentoring-minds`. Postgres version: the default. Region: **AWS US East 2 (Ohio)**.
2. Open the project, then **Branches**. You'll see `main` (production).
3. **Create branch** `preview`, with parent `main` and the current point in time. Then create `dev` the same way.
   - Do it **now, while `main` is empty**, so neither branch ever holds family data. If Neon offers
     **Schema only**, tick it.
   - **Never use "Reset from parent"** on either branch: that copies production data into it.
4. For each branch, `main`, `preview` and `dev`, open **Connect** and copy two strings. Paste each one
   straight into Vercel in Part 5; don't write them down anywhere.
   - **Pooled** (the host contains `-pooler`) goes into `DATABASE_URL`.
   - **Direct** (turn "Connection pooling" off) goes into `DIRECT_URL`.
5. **Settings → Instant restore** (also called the history window). Check it's on, at 6 hours on Free. Don't set it to 0.

**If you ever reset a Neon password** (Neon → the branch → **Roles** → **Reset password**), both of that branch's strings change.
Update `DATABASE_URL` **and** `DIRECT_URL` in Vercel for every environment that branch serves (Part 5's table;
if you reset it on all three branches, that's Production, Preview and Development). Then redeploy production
and promote it (Part 7, steps 1 and 2). Until you do, the live site can't reach the database. A deployment
keeps the variables it was built with, so an Instant Rollback to one from before the reset can't connect either.

## Part 2. Vercel project, about 10 min

**Done by Atlas on 2026-11-27, by CLI:** Parts 2 and 3, the domain (step 4), and Part 5's `AUTH_SECRET`,
`INVITE_PEPPER` and `CRON_SECRET`. Look the settings over; don't create anything again. What's still yours
in Part 5: the Neon URLs, the Google keys and, if you want push, the VAPID keys.

1. **vercel.com**. Create the Pro team, or use the existing one, and pay for Pro.
2. **Add New… → Project → Import Git Repository**, then install the GitHub app on `smb-products` for
   **this repository only**, then pick `mentoring-minds`.
3. Framework: Next.js, detected. Root: `./`. Build command: leave it; it comes from `vercel.json`. Click **Deploy**.
   - This first deployment builds without a database, then shows an error page. That's expected: the server
     won't start until Part 5 is done.
4. **Settings → Domains**: `mentoringmindsacademy.org` is the production domain, and `www.mentoringmindsacademy.org` and
   `mentoring-minds.vercel.app` both redirect to it (**308**). The domain is on Vercel DNS, so there are no
   records to add. The production address, `https://mentoringmindsacademy.org`, is called **PROD_URL** below. It serves nothing
   until your first **Promote** (Part 7); each promote moves all three names to the new deployment.
5. **Settings → Build and Deployment → Node.js Version**: check it says **22.x**. CI tests on 22, and
   `package.json` pins `"engines": "22.x"` (S12), which Vercel follows.
6. **Settings → Deployment Protection**: leave **Vercel Authentication** on for Preview. Only your team can
   open previews.
7. **Settings → Functions → Region**: set it to **Cleveland, USA (cle1)**, next to Neon in Ohio, and **Save**.
   The default is Washington, D.C. (iad1), which would put every database call across states.
8. **Settings → Environments → Production → Branch Tracking**: "Auto-assign Custom Production Domains" is
   **on** (D5, auto-promote). A merge to main goes live once its build is ready. A build that needs a migration
   fails instead, and the site stays on the last good deployment (`docs/DEPLOY.md` → Releasing).

## Part 3. Vercel Blob (files), about 5 min

1. In the project, **Storage → Create → Blob**.
   - Name: `mm-prod`. Access: **Private**. Tick **Add a read-write token env var**.
   - Environments: **Production only**.
2. **Create → Blob** again.
   - Name: `mm-preview`. Access: **Private**, with the read-write token.
   - Environments: **Preview** and **Development**.
3. **Settings → Environment Variables**. `BLOB_READ_WRITE_TOKEN` should now appear twice: once for
   Production (from `mm-prod`) and once for Preview + Development (from `mm-preview`).

## Part 4. Google sign-in, with Vienne, about 15 min

Vienne signs in to **console.cloud.google.com** with **her** Google account. You read the steps out.

1. Top bar: **project picker → New project**. Name: `Mentoring Minds`. Then **Create**, and select it.
2. Menu: **Google Auth Platform → Get started** (Branding).
   - App name: `Mentoring Minds`.
   - User support email: Vienne's address.
   - Audience: **External**.
   - Contact email: Vienne's address. Agree, then **Create**.
3. **Data Access**: add no scopes. The defaults (email, profile, openid) mean Google doesn't need to review the app.
4. **Clients → Create client**, type **Web application**, name `Mentoring Minds web`.
   - Authorised JavaScript origins: `https://mentoringmindsacademy.org`.
   - Authorised redirect URIs: `https://mentoringmindsacademy.org/api/auth/callback/google` and
     `http://localhost:3000/api/auth/callback/google`.
   - **Create**.
5. A box shows the **Client ID** and **Client secret**. Google may show the secret only this once. Keep the
   box open and paste both into Vercel now (Part 5, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, Production only).
6. **Audience → Publish app → Confirm**. The status should say **In production**. While it says "Testing",
   parents get a Google error.
7. Optional, so you can fix things later without her: **IAM & Admin → IAM → Grant access**, your address,
   role **Owner**.

Previews can't use Google, because their addresses change. Use email and password there.

Only the apex is needed: `www` and the `vercel.app` address redirect before they reach the app. Don't set
`AUTH_URL`. On Vercel, Auth.js builds its links from the address the visitor used, and that's always the apex.

## Part 5. Environment variables, about 15 min

**Vercel → Settings → Environment Variables → Add**. For each row, tick only the environments named.
Where Vercel offers **Sensitive**, tick it for secrets.

Make each secret on your own machine (WSL). These commands put it on the clipboard without showing it; then
paste with Ctrl+V into the Vercel field. Make a **separate** value for each environment, so a preview
cookie or invite code never works on production.

```bash
openssl rand -base64 33 | tr -d '\n' | clip.exe   # AUTH_SECRET   (44 characters)
openssl rand -base64 48 | tr -d '\n' | clip.exe   # INVITE_PEPPER (64 characters). Never change production's after launch.
openssl rand -hex 32    | tr -d '\n' | clip.exe   # CRON_SECRET   (letters and numbers)
printf '' | clip.exe                              # clear the clipboard when you're done
```

| Variable | Production | Preview | Development |
|---|---|---|---|
| `DATABASE_URL` | Neon `main`, pooled | Neon `preview`, pooled | Neon `dev`, pooled |
| `DIRECT_URL` | Neon `main`, direct | Neon `preview`, direct | Neon `dev`, direct |
| `AUTH_SECRET` | new value | new value | new value |
| `INVITE_PEPPER` | new value | new value | new value |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | from Part 4 | not set | not set |
| `CRON_SECRET` | new value | not set | not set |
| `BLOB_READ_WRITE_TOKEN` | already there (`mm-prod`) | already there (`mm-preview`) | already there (`mm-preview`) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | optional, see below | not set | not set |
| `DEMO_MODE`, `ALLOW_LOCAL_UPLOADS`, `DATABASE_POOL_MAX` | **never set** | **never set** | **never set** |

- **No Claude key.** The app has no AI features at launch (Javaris, 2026-11-27; S33 removes them), so
  there's no `ANTHROPIC_API_KEY` and no Claude Console account to set up.
- **Push, optional, can wait:** `npx web-push generate-vapid-keys` prints a public and a private key.
  Paste the private one straight into `VAPID_PRIVATE_KEY` and the public one into
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. Set `VAPID_SUBJECT` to `mailto:` plus Vienne's address. Then close that
  terminal.

## Part 6. Migrate and seed production, about 15 min

Do this in a **fresh clone**, not the lanes' checkout. Paste the URL at the hidden prompt, so it isn't saved
in your shell history.

**1. Write Vienne's locations into a file outside the repo** (S28). The seed adds no demo location to
production. It reads the real ones from this file, and it refuses to run while production has none. The
real places never go in the repo, the docs, a PR or a message; they live only in this file and then in
the database. Open it in an editor, so nothing lands in your shell history:

```bash
nano ~/mm-locations.json && chmod 600 ~/mm-locations.json
```

The file is a JSON list with one entry per place:

```json
[
  { "name": "<place name>", "kind": "LIBRARY", "address": "<street, city>" },
  { "name": "<name>", "kind": "HOME" }
]
```

- `kind` is `LIBRARY`, `TUTOR` (a place of Vienne's own; families see "Vienne's studio") or `HOME`
  (families see "Vienne comes to you" and type their own address when they book).
- `address` is optional. Leave it out for `HOME`.
- Limits: names up to 80 characters, addresses up to 200, at most 50 places.
- The seed checks the whole file first. If anything is wrong it says what and saves nothing. It also
  refuses a file inside the app's folder, where it could get committed.

**2. Migrate, then seed:**

```bash
git clone https://github.com/smb-products/mentoring-minds.git ~/mm-prod-ops && cd ~/mm-prod-ops && npm ci
read -rsp 'Neon main (production) DIRECT url: ' DIRECT_URL && echo && export DIRECT_URL DATABASE_URL="$DIRECT_URL"
npx prisma migrate status     # expect: the database is empty, and every migration is "not yet applied"
npx prisma migrate deploy     # creates the tables
SEED_LOCATIONS_FILE=~/mm-locations.json ADMIN_EMAIL="<Vienne's Google address>" ADMIN_NAME="Vienne Elliott" npm run db:seed
unset DIRECT_URL DATABASE_URL
```

The seed prints counts only, for example "Locations: 2 added, 0 skipped", never names or addresses.

**3. Then delete the file:** `rm ~/mm-locations.json`. A later re-run doesn't need it: with locations
already in production, the seed keeps them and adds nothing. To add a place later, run the same seed line
with a file that lists only the new place. Names already there are skipped, never changed.

- **Never run `npm run db:seed:demo` in this shell, and never add `--force` to it here.** Since S11 it
  refuses a database that isn't local and whose name lacks test, dev, demo or preview. Production's Neon
  database is called `neondb`, so it's refused. `--force` skips every check.
- For your click-through on previews, load the demo families into the **`preview`** branch, in a new
  terminal. Neon names that branch's database `neondb` too, so the seed refuses it unless you add `--force`.
  Before you press Enter, check that the URL you pasted came from the **`preview`** branch's Connect box.
  ```bash
  cd ~/mm-prod-ops && read -rsp 'Neon preview DIRECT url: ' DATABASE_URL && echo && export DATABASE_URL DIRECT_URL="$DATABASE_URL"
  npx prisma migrate deploy && npm run db:seed:demo -- --force; unset DATABASE_URL DIRECT_URL
  ```

## Part 7. Deploy production, about 5 min

1. **Vercel → Deployments**, the newest Production deployment, **⋯ → Redeploy**. Environment variables only
   take effect on a new deployment.
2. When it's **Ready**, it's live. If it says **Staged** (auto-assign was off then), **⋯ → Promote**, and
   confirm. If the build **failed** with "PRODUCTION DATABASE NOT UP TO DATE", migrate first (Part 6), then
   redeploy it.
3. Open `PROD_URL`. Signed out, you should see the landing page (L1), with **Sign in** at the top.
   `https://www.mentoringmindsacademy.org` and `https://mentoring-minds.vercel.app` should both land there too.
   - If you see an error page instead, open the deployment's **Logs**. The start-up check names the missing
     or unsafe setting.

## Part 8. Spend caps, about 5 min

1. **Vercel → team Settings → Billing → Spend Management.**
   - Set a monthly amount, for example $50 on top of Pro.
   - Turn on **Pause production deployment** and the email or SMS alerts.
2. **Neon → Billing.** Free can't overspend. On a paid plan, set its usage limit.

## Part 9. Tell Atlas, then check it together

Send Atlas one line: "production is set up, PROD_URL is …". No secrets. Atlas then checks:
- the variable **names** in each environment (never values), against `src/lib/env-check.ts`;
- that `DEMO_MODE` is unset everywhere;
- that the cron route refuses a request without the secret;
- that a stored file's raw Blob address won't open;
- the restore and rollback rehearsals.

The results go into `plan/reports/P-ops.md` and `docs/DEPLOY.md` → **Before launch**.

Then you and Vienne, by hand:
- [ ] Vienne signs in with Google at `PROD_URL` and lands on Today.
- [ ] A parent's Gmail account signs in on a phone and sees the invite-code screen.
- [ ] Vienne makes an invite code; the test parent redeems it and sees their child.
- [ ] A photo upload from a real iPhone and a real Android phone; Vienne opens both.
