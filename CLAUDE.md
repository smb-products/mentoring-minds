# Mentoring Minds

@AGENTS.md
@RULES.md

## For agents
- The work is wiring: one ticket from `docs/WIRING.md` (W0–W8) per feature. Read your ticket's row, the screens
  it names and `src/server/<area>.ts`. Skip `docs/BACKEND_PLAN.md` and `docs/ADDITIONS.md` unless the ticket says so.
- A ticket is done when its spec passes on a production build (`npm run build:e2e && npm run test:e2e -- wN`),
  the earlier tickets' specs still pass, and `npm run test:contract` is green.
- `tests/e2e/auth.spec.ts` and `tests/e2e/w*.spec.ts` are the acceptance tests and are locked. If one is wrong,
  add an `amend:` line to the PR. Don't edit it.
- Sign people in with the existing helpers: `as(userId)` from `tests/integration/helpers.ts`; `signIn`, `openAs`
  and the `test` fixture from `tests/e2e/support/fixtures.ts`, which fails a test on console errors. Never mock
  `auth()` or the guards.
- When the contract check fails, fix `src/server`, not the screen.
- Next.js 16.4 differs from your training data: read the guide in `node_modules/next/dist/docs/` first.
- Start servers in the background with a cleanup trap, or let Playwright start them. Never leave one holding
  your session open.
