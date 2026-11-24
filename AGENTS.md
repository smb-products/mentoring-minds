# AGENTS.md: working on Mentoring Minds

A tutoring app for one math tutor (Vienne, admin) and her families (parents; kids use the parent's account). Miami-Dade, grades K–6, the Florida Test Prep F.A.S.T. book, FAST scores, optional 1-on-1 video calls.

## State of the repo

- **Screens:** all 20 are built (`src/ui`) and run on an in-browser mock (`src/mock`).
- **Backend:** finished and tested (`src/server`, Postgres via Prisma).
- **Wiring:** not switched on yet. **Your job is mostly wiring:** follow `docs/WIRING.md`, one area per ticket (W1–W8).

## Commands

```bash
npm run dev               # http://localhost:3000 (demo data unless DEMO_MODE=false)
npm run typecheck         # next typegen + tsc
npm test                  # unit + integration + contract (needs Postgres: createdb mm_test)
npm run test:contract     # the wiring checker: mock vs real, function by function
npm run build:e2e         # production build with sign-in on, for the browser tests
npm run test:e2e          # browser tests (tests/e2e/README.md); `-- w4` for one ticket
npm run db:seed:demo      # load the prototype's families into DATABASE_URL (dev only)
npm run build
```

Tests create their tables from `prisma/migrations` and refuse any database whose name lacks "test". Point them elsewhere with `TEST_DATABASE_URL` (and the browser tests with `E2E_DATABASE_URL`, default `mm_e2e_test`).

## Where things are

| Path | What |
|---|---|
| `src/ui/` | Screens and components (JSX, client). **Don't change shapes the screens read.** |
| `src/ui/api/index.js` | The switch: mock or live, per area |
| `src/ui/api/live.js`, `live-hooks.js` | Live adapter (reads unwrap, writes refresh queries) |
| `src/server/*.ts` | Server functions. Every export is a **public endpoint**. |
| `src/lib/` | Server helpers: `guards`, `result`, `validate`, `dto`, `grading`, `slots`, `time`, `storage` (private Vercel Blob / local), `blob-upload`, `files`, `notify`, `push`, `jobs`, `auth-rules`, `ai/` |
| `src/mock/` | The contract the screens were built on. Deleted at W8. |
| `prisma/` | `schema.prisma`, `migrations/`, `seed.ts`, `data.ts` (loads the prototype data) |
| `tests/integration/` | Every server function against Postgres: permissions, leaks, each area |
| `tests/contract/` | Mock vs real shapes, and the adapter's read list |
| `tests/e2e/` | Browser tests, one spec per wiring ticket (skipped until its areas are live) |
| `docs/` | `WIRING` (start here), `CONTRACT`, `DEPLOY`, `COSTS`, `BUILD_PLAN`, `PORTING` |

## Rules

1. **Every `src/server` export is a public endpoint.** Start with a guard (`requireUser` / `requireActive` / `requireAdmin` / `requireStudentAccess`), then `parse()` the input with zod. Helpers that mustn't be endpoints go in `src/lib` behind `import 'server-only'`.
2. **Wrap every export in `action()` or `query()`** (`src/lib/result.ts`). They return `{ ok, data } | { ok: false, error, code }`, turn Dates into ISO strings, and keep the plain-language message, which Next.js would otherwise hide in production.
3. **Return DTOs (`src/lib/dto.ts`), never raw rows.** This keeps password hashes, invite hashes, answer keys, `adminNotes` and video links out of family responses. `tests/integration/leaks.test.ts` checks it.
4. **The answer key never leaves the server for families.** Use `bookItemDTO(item, { withAnswer: false })`. Grade on the server with `lib/grading.ts`.
5. **Times:** store UTC. Anything like "Monday 3 PM" or "today" uses `Settings.timezone` via `lib/time.ts`, never `setHours()`.
6. **Messages are for Vienne and parents:** plain words, say what to do next, no jargon. Keep the mock's wording when porting.
7. **Notify after the transaction commits** (`lib/notify.ts`), never inside it.
8. **Schema changes:** run `npx prisma migrate dev --name …` and commit the migration. CI fails on drift.
9. **AI:** only the two features in `src/server/ai.ts`, Haiku 5.5 at high effort, capped daily. Never save from a draft without Vienne's tap (the draft id goes through the normal save).
10. **Don't change the UI's look while wiring.** The screens match the prototype to the pixel.
11. **API routes check their own access** (`src/proxy.ts` only guards pages). Any new route under `src/app/api` must check the session or a secret itself.
12. **Work after the response** (push and the like) goes through `after()`, as in `lib/notify.ts`. Vercel can freeze a function once it responds.
13. **Inside `db.$transaction(async (tx) => …)`, await queries one at a time.** Never use `Promise.all` on `tx`: it shares one connection.
14. **Dependencies:** never run `npm audit fix --force`. Keep `pg` on 8.x and leave the `overrides` alone until their parent packages ship the fix. `docs/DEPLOY.md` → Dependency notes says why.

## Definition of done (any change)

- [ ] `npm run typecheck` and `npm test` green
- [ ] New server function: has integration tests, including a permission test, and is in the contract test if a screen uses it
- [ ] Wiring ticket: its browser test passes (`npm run build:e2e && npm run test:e2e -- wN`), and so do the earlier ones
- [ ] Clicked through as Vienne and as a parent with no console errors
- [ ] Docs updated if a contract or setup step changed

## Still open (needs Vienne)

- What the book's access code unlocks (she's sending it). The per-test question counts in `src/mock/seed.js` (books) are placeholders to check against her book.
