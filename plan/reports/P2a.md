status: blocked
checks: 1 ✓ 2 ✓ 3 ✓ 4 ✓ 5 ✓ (waiting for OSA's screenshot)
tests: tests/p2a-design.test.ts, tests/e2e/p2a-screens.spec.ts
notes: waiting for OSA's screenshot (desktop and phone, light and dark), then a lead queues it. Classes only: own
  message bubbles (Thread, shared with Vienne) go from navy to the soft blue tint, Vienne's avatar on Home and
  Messages goes from `ink` to `brand`. The 390px sideways scroll on Home wasn't SkillMeter: the page grids had an
  implicit `auto` column, so the truncated To do / From Vienne rows sized the cards to 424px. Home's three grids
  (and Progress's and the assignment page's) now start from `grid-cols-1` (minmax(0,1fr)); desktop columns and
  what the rows show are unchanged. SkillMeter (Display.jsx, P2b's) is untouched.
  Not a page scroll, left as is: the Messages quick-reply chips sit in their own sideways-scrolling row.
  Hand-rolled tiles that stay raw <button>s on purpose (radio tiles, answer bubbles, Home's next-session card and
  shortcuts): swapping them for Button would change the layout, so they're out of scope.
  Branch couldn't be rebased here (git fetch/rebase/merge needed approval); main's newer commits are plan/kit only.
