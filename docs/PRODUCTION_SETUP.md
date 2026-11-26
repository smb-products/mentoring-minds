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

Decided 2026-11-26 (Javaris, via OSA): D1–D4 as recommended, and D5 **manual**.

| # | Decision | Chosen | Why |
|---|---|---|---|
| D1 | Neon: its own account, or through the Vercel Marketplace | **Its own account** | The Marketplace's preview integration makes each preview database a copy of production, which would put real family data in every preview. It also names the direct URL `DATABASE_URL_UNPOOLED`, but the app reads `DIRECT_URL`. |
| D2 | Address: a custom domain, or `<project>.vercel.app` | Start on `vercel.app`, add a domain later | Google's redirect address has to be updated when the domain changes (Part 4, step 6). |
| D3 | One Blob store, or one for production and one for previews | **Two stores** | A preview deployment runs code that hasn't launched yet. With one shared store, its token could read or delete families' photos. |
| D4 | Neon plan | Free to start | Free keeps 6 hours of restore history. Launch (paid, by usage) keeps up to 7 days. See [Neon's history window](https://neon.com/docs/introduction/history-window). |
| D5 | Production migrations after launch | **Manual: you migrate, then promote** | RULES.md says production migrations are yours. Production builds never run `prisma migrate deploy`; previews still do, on their own database. Merges to main build a **Staged** production deployment that doesn't go live until you promote it (Part 2, step 8). `docs/DEPLOY.md` → Releasing has the steps. |

## Part 1. Neon (database), about 10 min

1. Sign up at **console.neon.tech**, then **New project**.
   - Name: `mentoring-minds`. Postgres version: the default. Region: **AWS US East 1 (N. Virginia)**.
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

## Part 2. Vercel project, about 10 min

1. **vercel.com**. Create the Pro team, or use the existing one, and pay for Pro.
2. **Add New… → Project → Import Git Repository**, then install the GitHub app on `smb-products` for
   **this repository only**, then pick `mentoring-minds`.
3. Framework: Next.js, detected. Root: `./`. Build command: leave it; it comes from `vercel.json`. Click **Deploy**.
   - This first deployment builds without a database, then shows an error page. That's expected: the server
     won't start until Part 5 is done.
4. Write down the production address, for example `https://mentoring-minds-xxxx.vercel.app`. It's called **PROD_URL** below.
5. **Settings → Build and Deployment → Node.js Version**: check it says **22.x**. CI tests on 22, and
   `package.json` pins `"engines": "22.x"` (S12), which Vercel follows.
6. **Settings → Deployment Protection**: leave **Vercel Authentication** on for Preview. Only your team can
   open previews.
7. **Settings → Functions → Region**: check it's **Washington, D.C. (iad1)**, next to Neon.
8. **Settings → Environments → Production → Branch Tracking**: turn **off** "Auto-assign Custom Production
   Domains", then **Save**. From now on a merge to main builds a production deployment marked **Staged**, and
   `PROD_URL` keeps serving the old one until you **Promote** (D5).

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
   - Authorised JavaScript origins: `PROD_URL`.
   - Authorised redirect URIs: `PROD_URL/api/auth/callback/google` and
     `http://localhost:3000/api/auth/callback/google`.
   - **Create**.
5. A box shows the **Client ID** and **Client secret**. Google may show the secret only this once. Keep the
   box open and paste both into Vercel now (Part 5, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, Production only).
6. **Audience → Publish app → Confirm**. The status should say **In production**. While it says "Testing",
   parents get a Google error.
7. Optional, so you can fix things later without her: **IAM & Admin → IAM → Grant access**, your address,
   role **Owner**.

Previews can't use Google, because their addresses change. Use email and password there.

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
| `ANTHROPIC_API_KEY` | new key, see below | not set, or a second key, see below | not set |
| `BLOB_READ_WRITE_TOKEN` | already there (`mm-prod`) | already there (`mm-preview`) | already there (`mm-preview`) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | optional, see below | not set | not set |
| `DEMO_MODE`, `ALLOW_LOCAL_UPLOADS`, `DATABASE_POOL_MAX` | **never set** | **never set** | **never set** |

- **Claude key:** **console.anthropic.com → Settings → Workspaces → Create** `mentoring-minds`, then
  **API keys → Create key** in that workspace and paste it. The workspace keeps its spend limit apart from
  anything else (Part 8). For previews, either leave the key out (the AI buttons say "type it in instead")
  or make a second workspace `mentoring-minds-preview` with a $1 limit.
- **Push, optional, can wait:** `npx web-push generate-vapid-keys` prints a public and a private key.
  Paste the private one straight into `VAPID_PRIVATE_KEY` and the public one into
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. Set `VAPID_SUBJECT` to `mailto:` plus Vienne's address. Then close that
  terminal.

## Part 6. Migrate and seed production, about 10 min

> **HOLD: don't run the `npm run db:seed` line yet** (P-review, 2026-11-26). Today the seed would add the
> prototype's demo locations (a studio and Coral Pines Library) to production, and nothing in the app can
> edit or remove them. Vienne has no studio: she meets at a Miami-Dade regional library or at home. The fix
> waits on your go. Until then, run the lines down to `migrate deploy`, skip the seed, and run the `unset`.
> Part 7 works without the seed, as far as the sign-in screen. Don't sign in or create accounts on
> production until the seed has run: it also loads the settings (Miami time) the screens need. Part 9's
> hand checks wait too. This note goes once the fix merges.

Do this in a **fresh clone**, not the lanes' checkout. Paste the URL at the hidden prompt, so it isn't saved
in your shell history.

```bash
git clone https://github.com/smb-products/mentoring-minds.git ~/mm-prod-ops && cd ~/mm-prod-ops && npm ci
read -rsp 'Neon main (production) DIRECT url: ' DIRECT_URL && echo && export DIRECT_URL DATABASE_URL="$DIRECT_URL"
npx prisma migrate status     # expect: the database is empty, and every migration is "not yet applied"
npx prisma migrate deploy     # creates the tables
ADMIN_EMAIL="<Vienne's Google address>" ADMIN_NAME="Vienne Elliott" npm run db:seed   # ON HOLD, see above
unset DIRECT_URL DATABASE_URL
```

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
2. When it's **Ready**, and it says **Staged**: **⋯ → Promote**, and confirm. Then reopen **Settings →
   Environments → Production → Branch Tracking** and check "Auto-assign Custom Production Domains" is still
   **off**. Vercel's docs don't say whether promoting switches it back on; if it did, switch it off again and
   tell Atlas.
3. Open `PROD_URL`. You should see the sign-in screen.
   - If you see an error page instead, open the deployment's **Logs**. The start-up check names the missing
     or unsafe setting.

## Part 8. Spend caps, about 5 min

1. **Vercel → team Settings → Billing → Spend Management.**
   - Set a monthly amount, for example $50 on top of Pro.
   - Turn on **Pause production deployment** and the email or SMS alerts.
2. **Neon → Billing.** Free can't overspend. On a paid plan, set its usage limit.
3. **Claude Console → Settings → Limits** for the `mentoring-minds` workspace: a monthly limit, for example
   $5. The app also caps AI drafts per day (`AI_DAILY_LIMIT`, `docs/COSTS.md`).

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
