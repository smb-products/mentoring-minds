# Mentoring Minds

Math tutoring app for Vienne Elliott (K–6, Miami-Dade). Vienne runs her sessions, families book her (in person or by video call), and kids do homework from the **Florida Test Prep F.A.S.T. Mathematics** book on a digital answer sheet. Progress is tracked against Florida's B.E.S.T. standards and FAST results.

- **Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS v4, Prisma 6 + Postgres (Neon), Rust-free client via the `pg` driver, Auth.js v5 (Google + email/password), Anthropic SDK (Claude Haiku 5.5), installable PWA.
- **Status:**
  - **Screens:** all 20 are built and run on the prototype's in-browser demo data.
  - **Backend:** finished, with every server function tested against Postgres. The tests cover permissions, data leaks, each area, and mock-vs-real shapes.
  - **Wiring:** the screens aren't switched over to the backend yet. That's the next step: **`docs/WIRING.md`** (agents: start with **`AGENTS.md`**).
  - **Deploying:** `docs/DEPLOY.md` (Vercel, Neon, Vercel Blob).

## Run it

```bash
npm install                 # also runs prisma generate (no database needed)
npm run dev                 # http://localhost:3000 → Vienne's Today screen
```

No `.env`, database or sign-in needed. `/admin/*` is Vienne; `/parent/*` is a parent. Switch between Vienne, Ana (book homework), Grace (video calls) and Monique (K–2, no book) in the **Account** menu. Demo data lives in the browser: changes last while you click around and reset on a full reload.

### With the real database

```bash
createdb mm_dev && createdb mm_test   # any Postgres 15+; or a Neon dev branch
cp .env.example .env                  # DATABASE_URL / DIRECT_URL → mm_dev, AUTH_SECRET, INVITE_PEPPER
npx prisma migrate deploy
npm run db:seed:demo                  # the prototype's families, same ids; password mentoring-demo-2026
```

| Script | |
|---|---|
| `npm test` | Everything: unit, integration (every server function on Postgres) and contract. Needs `mm_test`. |
| `npm run test:unit` / `test:integration` / `test:contract` | One project. The contract check is the wiring checker: mock vs real. |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm run build` | Production build. On Vercel: `vercel-build`, which applies migrations first. |
| `npm run db:migrate` / `db:deploy` / `db:seed` / `db:seed:demo` / `db:reset` / `db:studio` | Prisma |

To test the PWA (service worker, install, offline), use `npm run build && npm start`. The service worker only registers in production.

## Layout

```
src/app/(admin)/admin/*   Vienne's routes: each page.tsx renders its screen from src/ui/pages/admin
src/app/(parent)/parent/* family routes: screens from src/ui/pages/parent
src/app/(auth)/sign-in    the single sign-in screen (used once DEMO_MODE=false)
src/ui/                   the UI, ported from the prototype: pages, components, config, lib
src/ui/api/index.js       THE SWITCH: today re-exports the mock; going live points it at src/server
src/ui/AppRoot.jsx        client root for signed-in screens (shell, demo persona, theme)
src/mock/                 the prototype's mock API + demo data (deleted once live)
src/lib/demo.ts           DEMO_MODE (on unless DEMO_MODE=false)
src/lib/db.ts             Prisma client (pg driver adapter); connects on first query
prisma/schema.prisma      data model (mirrors the mock's collections)
prisma/seed.ts, data.ts   day-one data (db:seed) and the full demo (db:seed:demo), loaded from src/mock/seed.js
prisma/migrations/        SQL migrations (CI fails if the schema drifts)
src/server/*.ts           server functions ('use server'): same names, inputs and shapes as src/mock/server
src/lib/                  auth, guards, result, validate, dto, grading, slots, time, best (FL standards), storage (Vercel Blob/local), files, notify, push, jobs, ai
src/proxy.ts              routing by sign-in and role (skipped in demo mode)
src/app/api/files/[id]    permission-checked downloads (streams private Blob files)
src/app/api/files/blob    Blob client-upload tokens (only for a file the server reserved)
src/app/api/files/upload  local-dev upload target (production uploads go straight to Blob)
src/app/api/cron/daily    reminders + clean-up (Vercel Cron, CRON_SECRET)
src/ui/api/live.js        live adapter, written and tested, switched off (docs/WIRING.md)
src/app/manifest.ts       PWA manifest
public/sw.js              service worker (offline page, push)
docs/                     WIRING, CONTRACT, DEPLOY, COSTS, BUILD_PLAN, PORTING, …
tests/                    unit, integration (Postgres), contract (mock vs real)
.github/workflows/ci.yml  Postgres service, migrations, drift check, typecheck, tests, build
vercel.json               build command + daily cron
```

