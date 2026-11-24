# Porting guide: scaffold → live app

## Where things stand

The UI port is **done**. Every prototype screen is a real Next.js route, with the same JSX, classes and copy. It runs on the prototype's mock API in the browser:

```
src/app/(admin|parent)/**/page.tsx   →  src/ui/pages/**.jsx   →  src/ui/api  →  src/mock   (today)
                                                                       ↘  src/server  →  Prisma  (going live)
```

The **backend is finished, not wired.** Every server function in `src/server/*.ts` is built and tested against Postgres (`tests/integration`). `npm run test:contract` checks each one against its mock twin. The live adapter (`src/ui/api/live.js`) is ready but switched off. The app still builds and runs with no database while the screens are on the mock.

Verified on the scaffold (production build):
- All 20 routes match the prototype pixel for pixel, apart from font antialiasing.
- 7 viewports from 360 to 1440 wide show no overflow, small tap targets, nested controls or axe violations.
- 13 sheets and drawers open in view, take focus and close on Escape, on phone and desktop.
- These flows work through client-side navigation: handing in a test, then the parent's To do list clearing and the test showing in Vienne's queue; switching between demo accounts; Extra large text.
- Dev mode logs no console errors or warnings, so no hydration problems.

## Map

| Prototype (`mm-proto/`) | Scaffold (`mm-app/`) |
|---|---|
| `src/pages/**` | `src/ui/pages/**` (now `'use client'`), one `src/app/**/page.tsx` per route, receiving `params` |
| `src/pages/registry.js` route table | the `src/app` folders (deleted) |
| `src/App.jsx` | `src/ui/AppRoot.jsx`, rendered by both group layouts |
| `src/lib/router.jsx` (hash router) | same API, now backed by `next/link` and `next/navigation` |
| `src/components`, `config`, `lib` | `src/ui/components`, `config`, `lib` (unchanged, apart from the router and `Logo` src) |
| `src/api/**` | `src/mock/**` (unchanged), reached only through `src/ui/api` |
| `src/api/server/*.js` | `src/server/*.ts` (`'use server'`): same function names and inputs |
| `src/api/core.js` guards / `action` / `need` | `src/lib/guards.ts`, `src/lib/result.ts` |
| `src/api/dto.js` | `src/lib/dto.ts` (done) |
| `src/api/best.js` | `src/lib/best.ts` (done) |
| grading in `server/assignments.js` | `src/lib/grading.ts` (done, tested) |
| slots in `server/scheduling.js` | `src/lib/slots.ts` + `src/lib/time.ts` (done, tested, real time zone) |
| `server/ai.js` prompts and schemas | `src/lib/ai/prompts.ts` + `src/server/ai.ts` (real Claude calls, done) |
| `seed.js` | `prisma/data.ts` loads it as is: `db:seed` (day-one data) and `db:seed:demo` (everything) |
| CSS `zoom` for text size | the same `zoom` rules on `.app-root[data-text]` in `globals.css` |

## Going live

See **`docs/WIRING.md`**: switch one area at a time in `src/ui/api/index.js`. Deployment is covered in **`docs/DEPLOY.md`**.

## Rules that are easy to get wrong

1. **Every export of a `'use server'` file is a public endpoint.** Guard every one. Keep helpers (`notify`, grading, slot maths) in `src/lib/`, which has `import 'server-only'`.
2. **Never send the answer key.** Strip `answer` before returning book items to families (`bookItemDTO(..., { withAnswer: false })`). Grade only on the server.
3. **Video links only inside the join window** for parents (`sessionForParent`).
4. **Dates:** store UTC and compute in `Settings.timezone`. Use `lib/time.ts` for anything that turns "3:00 PM on Monday" into an instant. Don't use `new Date().setHours()` on the server.
5. **Next 16:** `params` and `searchParams` are Promises. Middleware is `src/proxy.ts`. `next lint` is gone. Turbopack is the default.
6. **Prisma JSON fields** (`modes`, `benchmarkCodes`, `answers`, `photos`, `tests`, `fastWindows`) come back as `JsonValue`. Cast them at the edge with a type, as the built modules do.
7. **AI:** call only through `src/server/ai.ts`. Keep `MODEL = 'claude-haiku-5-5'` and `EFFORT = 'high'` in one place (`lib/ai/prompts.ts`). Never store the photo, and never save from a draft without Vienne's tap.
8. **Undo instead of confirm:** `useUndoToast(result, title, undoFn)` from `ui/components/ui/Toast`.
9. **The page never scrolls.** Only the app's own scroll areas do (`.app-root` is `100dvh`, overflow hidden). That keeps phone sheets pinned to the bottom of the screen. Don't add page-level scrolling.
