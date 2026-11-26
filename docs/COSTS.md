# Running costs: keeping it cheap

About **$20 a month** for one tutor and about 20 families: Vercel Pro, plus an optional domain name. Every other service below has a free tier that covers that size, and none of them can surprise-bill: each one either stops at its limit or caps spending.

Prices were checked in November 2026. Check them again before launch.

| What | Use | Cost | Limit that matters | If it's outgrown |
|---|---|---|---|---|
| Hosting (Next.js) + daily cron | **Vercel Pro** | $20/month per developer seat | Includes $20 of usage credit a month, far more than this app uses. Hobby (free) is for non-commercial use only. | Vercel bills usage past the credit |
| Database | **Neon Free** (Postgres) | $0 | 1 GB storage and 100 compute-hours per project. It scales to zero when nobody's using it. Hitting a limit pauses the database until next month; Neon doesn't bill overages on Free. | Neon Launch, pay as you go |
| Photos and worksheets | **Vercel Blob** (private) | ≈ $0.05/month | $0.023 per GB-month. Photos are shrunk to about 250 KB on the phone, so a year is about 2 GB. Uploads go straight to Blob (no transfer charge). It's all paid from Pro's included $20 credit. | Same rates |
| Video calls | **Google Meet**, with Vienne's own Google account | $0 | One-on-one calls run up to 24 hours. With 3 or more people the limit is 60 minutes, which is fine for sessions of 60 minutes or less. | Google Workspace |
| AI (notes, answer keys) | **Claude Haiku 5.5** | under $5/year | $0.10 per million input tokens and $0.50 per million output tokens, for prompts under 100K tokens; ours are about 3K. | Already the cheapest Claude model |
| Sign-in | Google sign-in (Auth.js) | $0 | None | |
| Notifications | Web push (PWA) | $0 | None | |
| Domain (optional) | any registrar | about $10–20/year | | |

**Why not Cloudflare R2?** It's free up to 10 GB with no download fees, and it was the pick when hosting was going to be Netlify. On Vercel, Blob means no second account, no CORS or API keys to manage, and one bill, all for pennies a month. The storage code is one file (`src/lib/storage.ts`) if that ever changes.

**Don't use:**
- **Vercel Hobby:** it is for non-commercial use only, and Vienne's business is commercial.
- **Zoom free:** its calls end at 40 minutes.
- **Cloudflare Workers free** for the app: it allows 10 ms of CPU per request, which is too tight for this app's server pages and the Prisma database client.

## AI cost per use

| Feature | One use | A year |
|---|---|---|
| "Talk about it" session note | ~2K tokens in, ≤4K out (capped): **≤ $0.0022** | ~1,200 notes: **≤ $2.70** |
| "Set up from photos", one answer-key page | ~3K in (photo shrunk to 1600 px), ≤4K out: **≤ $0.0023** | 7 books × ~30 pages, once: **≤ $0.50** |

These are worst cases. They assume every call uses the full 4,000-token output cap; most use far less.

Guards in the code:
- `max_tokens: 4000` on every call caps the output of one call at $0.002.
- `AI_DAILY_LIMIT` (150 drafts per 24 hours) is set in `src/lib/ai/prompts.ts` and checked in `src/server/ai.ts`.
- Photos are shrunk in the browser (`src/ui/lib/shrinkPhoto.js`). That also keeps uploads under hosting request-size limits.
- AI runs only when Vienne taps a button. Nothing runs in the background or on a schedule.

**Also set a monthly spend limit in the Claude Console** (for example $5). It's the backstop if anything above fails.

## Spend caps

Every service either stops at a limit or caps spending. Set these once (`docs/PRODUCTION_SETUP.md`, Part 8):

| Service | Cap | Where | What happens at the cap |
|---|---|---|---|
| Vercel | Spend Management amount, for example $50 a month on top of Pro | team Settings → Billing → Spend Management, with **Pause production deployment** on | Production pauses until resumed. Alerts go out before that. |
| Neon | Free has hard limits (1 GB, 100 compute-hours) | Billing | The database pauses until next month. Free never bills overages. |
| Claude API | Monthly limit on the `mentoring-minds` workspace, for example $5 | console.anthropic.com → Settings → Limits | Calls fail. The AI buttons say "type it in instead". |
| Claude API, in the app | `AI_DAILY_LIMIT` = 150 drafts per 24 hours (`src/lib/ai/prompts.ts`), `max_tokens` 4000 a call | code | Vienne sees "That's the most drafts for today". Worst case about $0.35 a day. |

## Setting it up

All of this is built: Postgres via Neon's pooled URL, private Vercel Blob storage with direct uploads, the Vercel cron. The steps are in `docs/DEPLOY.md`.

Google Meet: Vienne creates one standing Meet link and pastes it into Settings → Video link.
