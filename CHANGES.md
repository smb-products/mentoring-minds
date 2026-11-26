# Changes to the spec

Any change to `docs/WIRING.md`, `docs/CONTRACT.md`, a locked test or a check in `plan/features.json` that alters
behaviour: date, feature id, what changed, why, who approved. Newest first. Add entries; never edit others.

## 2026-11-26: first plan (plan/features.json, W0–W8)

- **W6, W7:** `dashboard` goes live in W6, not W7. Why: `w6-scheduling.spec.ts` requires `dashboard` (confirm
  from Today, Join call from Home), and W7's spec requires `scheduling`, so the old split couldn't pass in order.
  W7 is now `reports`, `ai`. WIRING table updated. Approved: Axis (plan), Zero reviews in the plan PR.
- **W0, Step 2:** W0 writes `src/ui/api/index.js` with every area on its own commented line under a `// Wn`
  header, and ships with none live. Why: every ticket edits this file; one line per area, with a header between
  tickets, lets parallel tickets merge cleanly. The w0 spec skips with none live, so W0 is proven with one area
  uncommented locally. Approved: Axis, Zero reviews.
- **W8:** "delete `src/mock`" moves what's still used instead of losing it: B.E.S.T. data to `src/ui/api/best.js`,
  the demo seed to `prisma/demo/` (same ids), and a frozen copy of the mock to `tests/contract/mock/` so
  `npm run test:contract` keeps checking the shapes the screens were built on. Approved: Axis, Zero reviews.
- **Kit:** `SHARED_TOUCHES` in `kit/project.env` (`src/ui/api/index.js`) no longer blocks a parallel claim, so
  W1–W4 can run on three lanes at once. Approved: Axis, Zero reviews.
