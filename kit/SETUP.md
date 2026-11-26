# AVEL client kit: setup

Same kit in both repos. `kit/project.env` is the only file that differs.

## What runs where
| Seat | Agent file | Runs | Why there |
|---|---|---|---|
| OSA | `osa` | laptop, interactive | You talk to it; costs nothing while idle |
| Axis, Zero | `lead` | laptop, interactive | Planning is cheap; keep it off MIOSA |
| Atlas | `ops` | laptop, interactive | Holds the MIOSA controls |
| Soap, Fantem | `builder` | lanes: laptop first, then MIOSA | Headless, one feature per session |
| Rigg, Fenn | `checker` | lanes, next to the builders | Holdouts after merge, so nobody waits |

Each seat is its own tmux session (`<project>-<seat>`). WezTerm only arranges them, so closing the
terminal or losing Wi-Fi stops nothing. The lane resumes a dropped feature's session; it doesn't restart it.

## Why it's fast
- **Two builders in parallel**, each in its own worktree. `touches` keeps them off each other's files.
- **No waiting on review.** A PR merges itself on green CI. Checkers test after the merge, in batches
  of 3, and a failing holdout reopens the feature.
- **Small context.** A fresh session per feature. The prompt is that one feature. About 2k tokens of
  docs load at start. Lockfiles, `node_modules`, `.next` and worktrees are unreadable. 60 turns max.
- **Stuck means stop.** Same failure 3 times, or 2 attempts, and the feature goes to you. No loops.
- **Fast local checks, full checks in CI.** Stop hook: typecheck plus related tests only.

## Install (per repo, about 10 minutes)
1. Unzip into the repo root. (Lanes keep worktrees in `.wt/`, which they ignore on their own.)
2. Fill `REPO_URL` in `kit/project.env`. Commit on a branch and merge it: lanes build from `main`.
3. GitHub settings: Allow auto-merge on; squash only; auto-delete head branches; protect `main` with
   the CI `check` job required.
4. Create an issue called "Ops", pin it, and put its number in `OPS_ISSUE`. Seats on the laptop and
   lanes on MIOSA then share messages.
5. Dev env for lanes: no env file (`WT_COPY` is empty). `LANE_ENV` in `kit/project.env` holds committed
   fake values and `LANE_SETUP_CMD` starts a docker Postgres; `kit/seat.sh` gives both to every lane.
6. Real services (Neon, Vercel, Blob, VAPID, Anthropic) are Javaris's and Atlas's, never a lane's.
7. Check it: `python3 kit/tests/test_kit.py` (14 tests, about 10 s), then `kit/preflight.sh`. Lanes won't
   start until preflight is all clear: branch protection, auto-merge, attribution off, union merge lines,
   the app, the test DB, the Ops issue (no ready work is only a warning). `kit/seat.sh lanes` also starts `kit/guard.sh`, which
   refreshes, wakes idle lanes, and logs events to `~/.avel/<project>-guard.log`. Conflicting lane PRs heal
   themselves (`kit/heal.py`): main is merged in, the fast checks run, and the push is never forced.

## WezTerm
Copy `kit/wezterm.lua.example` to `~/.wezterm.lua` and fix the two paths. Open WezTerm: one workspace
per project, with tabs OSA, LEADS, BUILD, CHECK and OPS. The leader key is Ctrl+Space, then:
`p` project · `1–5` tabs · `m` message (`soap use the new guard`) · `i` inbox · `b` board · `l` start lanes.
Without WezTerm: `kit/seat.sh osa`, `kit/seat.sh lanes`, `kit/seat.sh board`.

## Talking
`kit/msg.py send <to> "<text>"` (a name, `leads`, `builders`, `checkers`, `ops` or `all`), `kit/msg.py inbox`,
`kit/msg.py feed --follow`. Builders message only when stuck or blocked by a wrong check. Everything else
is in the board (`kit/plan.py board`) and the PRs.

## MIOSA, without wasting credits
1. **Run locally first.** Do one or two features per repo on the laptop (`LANES_ON=local`) until the
   loop works. That costs no credits.
2. **Atlas fills the 9 `MIOSA_*` command templates** in `kit/project.env` from MIOSA's docs. They're
   empty on purpose: I couldn't confirm MIOSA's CLI. Create and snapshot must print JSON with an `id`.
3. `kit/miosa.sh bootstrap`: a fresh workspace, then clone, install, a secret scan, a snapshot. Do it once,
   and again only after a lockfile changes.
4. Log the workspace in (below), set `LANES_ON=miosa`, then `kit/miosa.sh lanes`. All lanes run in
   **one workspace per project**. If lanes already run on the laptop, `lanes` first proves the workspace
   on one real feature (preflight there makes a real `claude -p` call and a gh write), then drains the
   laptop lanes (no new claims) and starts the workspace's: there's never a moment with no lanes. When the
   laptop lanes are idle, `kit/miosa.sh retire-local` hands their last features over and stops them.
   A failed proof leaves the laptop lanes running. `kit/miosa.sh pause` stops the workspace at once.
5. `kit/miosa.sh cost` estimates hours and dollars. MIOSA's own usage page is the real figure.

Guards in `miosa.sh`:
- at most 2 workspaces across projects;
- it refuses to start when `REAL_DATA=1`;
- the snapshot step refuses if it finds `.env` files, a Claude or gh token, a token in the git config, or running sessions;
- tokens (`GH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`) are passed in on stdin for each run, never written to a file.

Use a fine-grained GitHub token limited to that one repo, with read and write access to contents and pull requests.

### Logging in the workspace (Javaris, once; tokens never go in a file, a message or a PR)
1. Claude: on the laptop, `claude setup-token` and copy the token it prints. Then
   `miosa env set-var --env mentoring-minds CLAUDE_CODE_OAUTH_TOKEN` and paste it at the hidden prompt.
2. Variables reach a machine only with secrets on: `miosa env toggle --env mentoring-minds secrets on`.
3. GitHub, one of:
   - approve MIOSA's OAuth app for the org (github.com → smb-products → Settings → Third-party access →
     OAuth app policy → MIOSA → Grant), which keeps MIOSA's own GitHub connection; or
   - a fine-grained token (owner smb-products, only mentoring-minds; Contents and Pull requests read/write,
     Metadata read), then `miosa env set-var --env mentoring-minds GH_TOKEN` and paste it.
4. `miosa env upgrade <workspace id>` (`kit/miosa.sh status` shows it): machines keep the environment
   version they started with until upgraded. A paused workspace picks it up when it resumes.
5. Tell Atlas. `kit/miosa.sh lanes` proves both logins before any laptop lane stops.

**Data line:** demo data only on MIOSA. Client code on a third-party sandbox is your call per client contract.

## Daily loop
Morning: in OSA, type `status`. Merge the held PRs it lists (schema, lockfile and plan changes), answer
its decisions, then press `l` to start the lanes. Evening: `status` again, then `kit/miosa.sh pause`.
