# Mentoring Minds

Math tutoring app for Vienne Elliott (K–6, Miami-Dade). Vienne runs her sessions, families book her (in person or by video call), and kids do homework from the **Florida Test Prep F.A.S.T. Mathematics** book on a digital answer sheet. Progress is tracked against Florida's B.E.S.T. standards and FAST results.

- **Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS v4, Prisma 6 + Postgres (Neon), Rust-free client via the `pg` driver, Auth.js v5 (Google + email/password), Anthropic SDK (Claude Haiku 5.5), installable PWA.
- **Status:**
  - **Screens:** all 20 are built and run on the real backend.
  - **Backend:** finished, with every server function tested against Postgres. The tests cover permissions, data leaks, each area, and the shapes the screens were built on.
  - **Wiring:** done (`docs/WIRING.md`, W0–W8). Next is production: the audits and their fixes (agents: start with **`AGENTS.md`**).
  - **Deploying:** `docs/DEPLOY.md` (Vercel, Neon, Vercel Blob).

## Run it

```bash
npm install                           # also runs prisma generate
createdb mm_dev && createdb mm_test   # any Postgres 15+; or a Neon dev branch
cp .env.example .env                  # DATABASE_URL / DIRECT_URL → mm_dev, AUTH_SECRET, INVITE_PEPPER
npx prisma migrate deploy
npm run db:seed:demo                  # the prototype's families, same ids; it prints the demo sign-in
npm run dev                           # http://localhost:3000
```

Sign-in is always on. Sign in as `vienne@example.com` for Vienne's screens (`/admin/*`), or as a demo parent such as Ana (`ana.mendoza@example.com`, book homework) or Grace (`grace.kim@example.com`, video calls) for `/parent/*`. The seed prints the password and lists the demo families.

| Script | |
|---|---|
| `npm test` | Everything: unit, integration (every server function on Postgres) and contract. Needs `mm_test`. |
| `npm run test:unit` / `test:integration` / `test:contract` | One project. The contract check compares the real shapes with the frozen mock in `tests/contract/mock/`. |
| `npm run build:e2e` then `npm run test:e2e` | Browser tests, one per ticket (`tests/e2e/README.md`). |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm run build` | Production build. On Vercel: `vercel-build`. Previews apply migrations first; production never migrates (`docs/DEPLOY.md` → Releasing). |
| `npm run db:migrate` / `db:deploy` / `db:seed` / `db:seed:demo` / `db:reset` / `db:studio` | Prisma |

To test the PWA (service worker, install, offline), use `npm run build && npm start`. The service worker only registers in production.

## Layout

```
src/app/(admin)/admin/*   Vienne's routes: each page.tsx renders its screen from src/ui/pages/admin
src/app/(parent)/parent/* family routes: screens from src/ui/pages/parent
src/app/(auth)/sign-in    the single sign-in screen
src/ui/                   the UI, ported from the prototype: pages, components, config, lib
src/ui/api/index.js       exports the live adapter as `api` (every area live since W8)
src/ui/AppRoot.jsx        client root for signed-in screens (shell, the signed-in user, theme)
tests/contract/mock/      frozen copy of the deleted src/mock: the shapes the screens were built on
src/lib/db.ts             Prisma client (pg driver adapter); connects on first query
prisma/schema.prisma      data model (mirrors the mock's collections)
prisma/seed.ts, data.ts   day-one data (db:seed) and the full demo (db:seed:demo), loaded from prisma/demo/seed.js
prisma/migrations/        SQL migrations (CI fails if the schema drifts)
src/server/*.ts           server functions ('use server'): every export is a public endpoint behind a guard
src/lib/                  auth, guards, result, validate, dto, grading, slots, time, best (FL standards), storage (Vercel Blob/local), files, notify, push, jobs, ai
src/proxy.ts              routing by sign-in and role
src/app/api/files/[id]    permission-checked downloads (streams private Blob files)
src/app/api/files/blob    Blob client-upload tokens (only for a file the server reserved)
src/app/api/files/upload  local-dev upload target (production uploads go straight to Blob)
src/app/api/cron/daily    reminders + clean-up (Vercel Cron, CRON_SECRET)
src/ui/api/live.js        live adapter: reads unwrap, writes refresh queries
src/app/manifest.ts       PWA manifest
public/sw.js              service worker (offline page, push)
docs/                     WIRING, CONTRACT, DEPLOY, COSTS, BUILD_PLAN, PORTING, …
tests/                    unit, integration (Postgres), contract (mock vs real)
.github/workflows/ci.yml  Postgres service, migrations, drift check, typecheck, tests, build
vercel.json               build command + daily cron
```

