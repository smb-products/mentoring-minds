status: done
checks: 1 ✓ 2 ✗ (S8) 3 ✓ 4 ✓ 5 ✓
tests: tests/e2e/p-product.spec.ts (new). Full browser suite on a production build of main at 3828ab3 (after W8): 84 passed, 5 skipped (the two S8 fixmes on desktop and phone, and the opt-in real AI call). Typecheck green.
notes: Audit by Axis. Findings that need app code are S tickets for the lanes, not fixed here.

## What was checked

1. **Every screen, live, production build (check 1).** `p-product.spec.ts` opens all 14 admin routes as Vienne and
   all 6 parent routes as Ana (an ACTIVE parent), on desktop and phone (Pixel 7), with real ids from the demo data.
   Each route has to stay on its URL, finish loading (no `aria-busy`), show a heading and not show "This page
   couldn't load". It also has to log no console error or page error, and make no request that fails or answers 4xx/5xx.
   All pass.
2. **Preview and paused parents (check 2): fails, S8.** Both tests are in the spec as `test.fixme`, asserting what
   should happen:
   - **PAUSED (Daniel):** `/parent/home` shows the loading skeleton forever: no heading, no message. `HomePage.jsx`
     renders `<PageLoading />` until `dashboard.getParentOverview` returns data, and its `requireStudentAccess`
     answers NOT_ACTIVE. Other parent pages that read area data likely do the same.
   - **PREVIEW (Tom):** `/parent/home` also never finishes loading (no child, so the page waits). The browser
     logs an uncaught page error, "Enter your invite code to unlock this.". `useQuery` rethrows during render when a
     query has never had data (`src/ui/api/live-hooks.js` line 51). A shell-level read that a preview parent is
     refused throws outside the page's error boundary. This is the same thing as Rigg's #23 FYI on `/parent/messages`.
   - The sweep stops at the first failing route, so the other parent routes are unproven for these two parents
     until S8.
3. **Phone uploads (check 3), phone project.** On Lucia's answer sheet, Ana sends:
   - a real JPEG (drawn by the browser). It's stored as `image/jpeg`, and Vienne opens it at `/api/files/<id>` (200, `image/jpeg`).
   - a HEIC (`ftypheic`, which Chrome can't decode, so `shrinkPhoto` sends it as is). It gets "Use a PDF, PNG, JPG or WebP file", and no file row is left.
   - a file of `MAX_BYTES` + 1 (read from `src/lib/storage.ts`). It gets "Files can be up to 25 MB", and no file row is left.
4. **Whole suite (check 4).** auth, change-password, w0–w7, holdouts and p-product: green on one production build.
   `npm test` and `npm run test:contract` are green on main in CI (the `check` job, 3828ab3).
5. **DEPLOY → Before launch (check 5).** Every item is ticked or names who does it and what it waits on. Only
   the CI item is ticked; the rest need production, which waits on W8 setup and Javaris's clicks.

## Findings

- **S8 (new ticket, lanes):** preview and paused parents get their screen on every parent route, not an
  endless skeleton or an uncaught error. The fix is in `src/ui` (parent pages, shell, `live-hooks.js`). It's done
  when the two `test.fixme`s in `p-product.spec.ts` are removed and pass.
- **For Javaris (product, not a bug):** a paused parent is told "Message Vienne to turn it back on", but
  `messages.getThread` and `sendMessage` use `requireActive`, so they can't message her in the app. Either let a
  paused parent use Messages, or change the wording to say how to reach her. S8 keeps today's server rules.
- **HEIC:** only PNG, JPEG, WebP and PDF are allowed. iPhone Safari normally converts a picked photo to JPEG,
  so this should be rare. The real-iPhone check on the Before launch list tries the camera and the library to make
  sure. If a HEIC does get through there, accepting HEIC (or converting it) is an S ticket.
