# Browser tests (Playwright)

These click through the real app in Chrome, signed in as the demo families, against a production build and a real Postgres database. They're how a wiring ticket (`docs/WIRING.md`) is checked: **a ticket is done when its spec file passes.**

| File | What it covers | Runs when |
|---|---|---|
| `auth.spec.ts` | Sign-in, lockout, sign-up, who can open what, file permissions, security headers | Always |
| `w0-sign-in-wired.spec.ts` | WIRING Step 1: the screens use the signed-in user; text size; sign out; preview parents | Any area is live |
| `w1-taxonomy-fast.spec.ts` | Skills; FAST results from both sides | `taxonomy`, `fast` |
| `w2-families-invites.spec.ts` | Invite → sign up → redeem; reset password; pause; search | `families`, `invites` |
| `w3-messages-notifications.spec.ts` | Messages both ways; alerts; read state | `messages`, `notifications` |
| `w4-books-content.spec.ts` | Answer keys; "We have it"; upload, open, drafts, delete/undo | `books`, `content` |
| `w5-assignments.spec.ts` | Assign → answer sheet with a photo → Vienne checks; **the answer key never reaches a family's browser** | `assignments`, `books`, `content`, `families` |
| `w6-scheduling.spec.ts` | Request, confirm, decline, cancel; "just booked" race; Join call; complete with a note | `scheduling`, `dashboard`, `families` |
| `w7-reports-dashboard-ai.spec.ts` | Reports draft → publish; Today updates live (the AI helpers were removed in S33) | `reports`, `dashboard`, `scheduling`, `families` |

A spec whose areas aren't in `LIVE` (in `src/ui/api/index.js`) is **skipped**, and the report says which areas to switch on. So CI stays green while wiring is in progress, and each spec starts counting the moment its areas go live.

## Running them

Once:

```bash
createdb mm_e2e_test                 # its own database; the name must contain "test"
npx playwright install chromium      # or set E2E_CHROME_PATH to an installed Chrome
```

Then:

```bash
npm run build:e2e                    # a production build, as Vercel builds it
npm run test:e2e                     # everything that's switched on
npm run test:e2e -- w4               # one ticket
npm run test:e2e -- w6 --headed      # watch it happen
npx playwright show-report           # after a failure: screenshots and a trace
```

Rebuild (`npm run build:e2e`) after changing code; the tests run against the build, not `npm run dev`.

Settings come from `.env` (`E2E_DATABASE_URL`, default `postgresql://postgres@localhost:5432/mm_e2e_test`; `E2E_PORT`, default 3200). Uploads go to `./uploads`, never Blob.

## How they're built

- **Fresh data per file.** Each spec file starts from the demo data (`prisma/data.ts`, the same ids as the mock). Inside a file, tests run in order and may build on each other.
- **Checked in the database.** A screen saying "Saved" isn't enough: tests read the row back through `db` (Prisma on the e2e database).
- **No browser errors.** Any console error or uncaught exception fails the test (`support/fixtures.ts`).
- **Found by what people see.** Locators use roles and labels (`getByRole('button', { name: 'Send request' })`), so a test breaks when the wording a parent reads changes. That's on purpose.
- **Two widths.** Tests tagged `@phone` also run on a phone-sized screen.

## When one fails

1. `npx playwright show-report`: the screenshot, and the trace (every click, network call and console line).
2. If the screen shows the wrong data, run `npm run test:contract`. It names the server function and field that differ from the mock.
3. Fix the server function or the wiring, not the test's wording, unless the screen's wording changed on purpose.
