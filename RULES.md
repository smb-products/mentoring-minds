# How we build here

One page. If this and a habit disagree, this wins. Product rules live in `AGENTS.md`.

## The team
| Who | Role | Runs |
|---|---|---|
| Javaris | Decides scope, money, real data, irreversible ops, anything stuck | — |
| OSA | Operator: board, inbox, unblocks lanes, prepares Javaris's decisions. Never builds, never merges | laptop seat |
| Axis | Lead, product: plan, checks, tests, kit, docs. Merges Zero's PRs | laptop seat |
| Zero | Lead, data: schema, migrations, `src/server`, `src/lib`, guards, deps. Merges Axis's PRs | laptop seat |
| Atlas | Ops: preflight, CI, repo settings, MIOSA, previews, deploy, cost | laptop seat |
| Soap, Fantem, Kade | Builders: one ticket per session, headless | lanes |
| Rigg | Checker: holdout tests after merge, in batches | lane |

One copy of each seat (tmux `mentoring-minds-<seat>`). Nobody starts a second one.

## The loop
1. **Leads write `plan/features.json`** from `docs/WIRING.md`: one feature per ticket, `checks`, `deps`, `touches`.
2. **A builder lane claims the next ready feature,** builds it on `f/<id>` (`f/<id>-r<n>` after a reopen) in its
   own worktree, writes `plan/reports/<id>.md`, opens a PR and queues it with `gh pr merge --auto`.
3. **The merge queue tests each PR on the main it lands on.** Green merges, nobody waits for review.
   A PR's own `check` is CI's fast part (typecheck, unit, contract); the queue runs the full suite, and a PR
   it drops is reported to OSA and its lead by `kit/plan.py refresh`.
   `PROTECT_MERGE` paths are held for the lead who owns them.
4. **The checker takes merged features in batches** (at least 3, or the oldest has waited 30 min) and writes
   1–3 holdouts each. A failing holdout reopens the feature.
5. **Lanes exit when nothing is ready.**

Words mean one thing. **Merged:** on main with green CI. **Checked:** its holdout PR merged. **Verified:**
Javaris clicked it through as Vienne and as a parent.

## Speed
- Lanes never idle: a ready feature per builder, with no shared `touches`.
- A red main stops the line. New claims pause, no attempt is counted, and the PR that broke main is fixed or
  reverted first. Never bypass the queue or a required check.
- Kit and plan fixes are batched into one PR every 1–2 hours unless lanes are blocked.

## Tests
- Builders don't edit the acceptance specs (`tests/e2e/auth.spec.ts`, `tests/e2e/w*.spec.ts`) or holdouts
  (`tests/holdout/`, `plan/holdouts/`). The checker edits only holdouts.
- A refusal test awaits the rejection. e2e data is created inside each test, never at module level.
- Flaky test: rerun once. If it passes the second time, it gets a lead ticket. A flake never reopens a feature.
- A test locks once it merges. Changing a merged test needs a lead.

## Ownership
- Claim a PR before working it: label it `owner:<seat>` and say "taking #N". Leads work in `.wt/`, never in the
  main checkout. Never merge your own PR. If the other lead is away 30 min, it goes to Javaris.
- A held PR merges only when its author says it's final. Leads and Atlas open theirs as drafts (`--draft`) and
  run `gh pr ready <n>` when the last push is in; a builder's PR is final when its report says `status: done`.
  Never merge a draft, and re-check the head commit after any new push.
- Lanes (builders, the checker) never open drafts: the lane queues their PR as soon as the run ends. A PR that
  mustn't merge yet (it needs a lead's fix first) ends the run `status: blocked` and tells `leads` why.
- A feature whose `touches` hit `PROTECT_MERGE` names the lead who merges it (`"held"` in the plan), so that lead
  expects it. `kit/plan.py lint` fails a plan that leaves it out.
- An audit ticket (`"role": "audit"`, the production phase after W8) is run by the seat in its `"owner"`, not a
  lane, and gets no holdouts. It writes tests, docs and its report. A finding that needs app code becomes an S
  ticket for the lanes.
- Worktrees and caches live on disk, never in `/tmp`.

## When a check is wrong
Build what's sensible and put one line in the PR body: `amend: <id> check 3 should say "…" because …`.

## Stuck means stop
- Same failure 3 times → `status: stuck`, message OSA. 2 attempts per feature, then it goes to Javaris.
- These don't count as attempts: a $0 run, "Not logged in", a usage limit, an auth error, a red main.
  The lane stops and alerts instead.
- Out of budget or turns → report it with the end reason. Don't resume into the same wall.

## Talking
`kit/msg.py send <to> "<text>"` (a name, `leads`, `builders`, `checkers`, `ops`, `all`); `kit/msg.py inbox`.
One line, naming the feature or PR. A seat isn't woken until its pane shows it working. Start a message that
needs no action with `FYI`. It doesn't count as unread when the guard looks for a frozen seat.
Messages can end up on the public Ops issue: never put in one where a person lives, works or meets, or the
details of a security problem that isn't fixed yet. Name the ticket and say "details in the report" instead.

## Never
- Real family data or photos anywhere: the repo is public. Demo data only.
- Secrets in code, tests, PRs, messages or chat. Don't read `.env` files. A pasted secret gets rotated.
- Force pushes, pushes to `main`, merging your own PR.
- Irreversible ops by an agent (destroy, prod migrate or seed, deleting data). Javaris runs them.
- Claude trailers in commits or PRs (Co-Authored-By, Claude-Session, "Generated with").
- Silent spec changes. They go in `CHANGES.md` with a date, a reason and who approved.
