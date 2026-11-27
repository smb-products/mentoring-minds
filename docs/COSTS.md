# Running costs: keeping it cheap

About **$20 a month** for one tutor and about 20 families: Vercel Pro, plus an optional domain name. Every other service below has a free tier that covers that size, and none of them can surprise-bill: each one either stops at its limit or caps spending.

Prices were checked in November 2026. Check them again before launch.

| What | Use | Cost | Limit that matters | If it's outgrown |
|---|---|---|---|---|
| Hosting (Next.js) + daily cron | **Vercel Pro** | $20/month per developer seat | Includes $20 of usage credit a month, far more than this app uses. Hobby (free) is for non-commercial use only. | Vercel bills usage past the credit |
| Database | **Neon Free** (Postgres) | $0 | 1 GB storage and 100 compute-hours per project. It scales to zero when nobody's using it. Hitting a limit pauses the database until next month; Neon doesn't bill overages on Free. | Neon Launch, pay as you go |
| Photos and worksheets | **Vercel Blob** (private) | ≈ $0.05/month | $0.023 per GB-month. Photos are shrunk to about 250 KB on the phone, so a year is about 2 GB. Uploads go straight to Blob (no transfer charge). It's all paid from Pro's included $20 credit. | Same rates |
| Video calls | **Google Meet**, with Vienne's own Google account | $0 | One-on-one calls run up to 24 hours. With 3 or more people the limit is 60 minutes, which is fine for sessions of 60 minutes or less. | Google Workspace |
| Sign-in | Google sign-in (Auth.js) | $0 | None | |
| Notifications | Web push (PWA) | $0 | None | |
| Domain (optional) | any registrar | about $10–20/year | | |

**Why not Cloudflare R2?** It's free up to 10 GB with no download fees, and it was the pick when hosting was going to be Netlify. On Vercel, Blob means no second account, no CORS or API keys to manage, and one bill, all for pennies a month. The storage code is one file (`src/lib/storage.ts`) if that ever changes.

**Don't use:**
- **Vercel Hobby:** it is for non-commercial use only, and Vienne's business is commercial.
- **Zoom free:** its calls end at 40 minutes.
- **Cloudflare Workers free** for the app: it allows 10 ms of CPU per request, which is too tight for this app's server pages and the Prisma database client.

## Spend caps

Every service either stops at a limit or caps spending. Set these once (`docs/PRODUCTION_SETUP.md`, Part 8):

| Service | Cap | Where | What happens at the cap |
|---|---|---|---|
| Vercel | Spend Management amount, for example $50 a month on top of Pro | team Settings → Billing → Spend Management, with **Pause production deployment** on | Production pauses until resumed. Alerts go out before that. |
| Neon | Free has hard limits (1 GB, 100 compute-hours) | Billing | The database pauses until next month. Free never bills overages. |

## Setting it up

All of this is built: Postgres via Neon's pooled URL, private Vercel Blob storage with direct uploads, the Vercel cron. The steps are in `docs/DEPLOY.md`.

Google Meet: Vienne creates one standing Meet link and pastes it into Settings → Video link.
