#!/usr/bin/env bash
# kit/miosa.sh: one MIOSA workspace per project. Builder and checker lanes run inside it
# as tmux sessions, each in its own git worktree. OSA, the leads and Atlas stay on your laptop.
#
#   bootstrap   new workspace → clone → setup → install → secret scan → snapshot (do once, and after deps change)
#   up          resume the workspace, or create it from the snapshot
#   lanes       start every lane inside it. If lanes run here, first prove the workspace on one real
#               feature, then drain the local lanes (no new claims) and start the workspace's
#   retire-local  then: wait for the drained local lanes, hand their last features over, stop them
#   attach <s>  watch one lane (soap, fantem, rigg, fenn)
#   preview [p] public preview URL for the dev server
#   pause | down | status | cost | snapshot
#
# Credit rules: lanes exit when nothing is ready; the workspace idle-pauses after
# MIOSA_IDLE_PAUSE_MIN; at most MIOSA_MAX_WORKSPACES across projects; demo data only.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
set -a; source kit/project.env; set +a
STATE_DIR="${HOME}/.avel/miosa"; mkdir -p "$STATE_DIR"
WS_FILE="$STATE_DIR/$PROJECT.ws"; SNAP_FILE="$STATE_DIR/$PROJECT.snap"; LOG="$STATE_DIR/$PROJECT.log"
REPO_DIR="${MIOSA_REPO_DIR:-/home/agent/repo}"
die() { echo "miosa: $*" >&2; exit 1; }

# Fill {ws} {snap} {name} {port} {idle} into a command template from project.env.
tpl() {
  local t="$1"; shift
  t="${t//\{ws\}/$(cat "$WS_FILE" 2>/dev/null || true)}"; t="${t//\{snap\}/$(cat "$SNAP_FILE" 2>/dev/null || true)}"
  t="${t//\{name\}/avel-$PROJECT}"; t="${t//\{idle\}/${MIOSA_IDLE_PAUSE_MIN:-30}}"; t="${t//\{port\}/${1:-${DEV_PORT:-3000}}}"
  echo "$t"
}
need() { [ -n "${!1:-}" ] || die "$1 is empty in kit/project.env. Fill it from the MIOSA docs (see the setup guide)."; }
json_id() { python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('${MIOSA_ID_FIELD:-id}') or d.get('data',{}).get('id',''))"; }

# Run a script inside the workspace. Secrets ride on stdin, never in arguments or files.
run_in() {
  need MIOSA_EXEC
  local script="$1" with_secrets="${2:-no}" head=""
  if [ "$with_secrets" = yes ]; then
    for v in ${MIOSA_PASS_ENV:-}; do
      [ -n "${!v:-}" ] || die "$v is not set on this machine (needed inside the workspace)."
      head+="export $v=$(printf %q "${!v}")"$'\n'
    done
  fi
  [ -n "${ANTHROPIC_API_KEY:-}" ] && [[ " ${MIOSA_PASS_ENV:-} " != *" ANTHROPIC_API_KEY "* ]] && \
    echo "miosa: note: ANTHROPIC_API_KEY is set here but is not passed in. Claude in the workspace uses CLAUDE_CODE_OAUTH_TOKEN." >&2
  # A login shell: MIOSA sets the environment's variables (GH_TOKEN, CLAUDE_CODE_OAUTH_TOKEN) only there.
  printf '%s\n%s\n' "$head" "$script" | eval "$(tpl "$MIOSA_EXEC") bash -ls"
}

SCAN='cd '"$REPO_DIR"' || exit 0; bad=""
for f in $(git ls-files --others --ignored --exclude-standard 2>/dev/null | grep -E "(^|/)\.env" | grep -v "\.example$"); do bad="$bad $f"; done
[ -f ~/.claude/.credentials.json ] && bad="$bad ~/.claude/.credentials.json"
grep -qs oauth_token ~/.config/gh/hosts.yml && bad="$bad gh-hosts.yml"
git config --get-regexp "extraheader|url\..*insteadof" 2>/dev/null | grep -qi "authorization\|access-token" && bad="$bad git-config-token"
tmux ls >/dev/null 2>&1 && bad="$bad running-tmux"
[ -n "$bad" ] && { echo "SECRETS OR LIVE SESSIONS FOUND:$bad"; exit 3; }; echo "scan clean"'

guard_up() {
  [ "${REAL_DATA:-0}" = 1 ] && die "REAL_DATA=1: real client data never goes to MIOSA. Run these features locally."
  local running; running=$(grep -l running "$STATE_DIR"/*.state 2>/dev/null | grep -v "/$PROJECT.state" | wc -l || true)
  [ "$running" -ge "${MIOSA_MAX_WORKSPACES:-2}" ] && die "$running workspaces already running (max ${MIOSA_MAX_WORKSPACES:-2}). Pause one first."
  true
}
AVEL_DIR="$(git rev-parse --path-format=absolute --git-common-dir)/avel"
push_state() {  # this machine's lane state → the workspace, inside the script (nothing rides on argv)
  run_in "mkdir -p '$REPO_DIR/.git/avel'; cat > '$REPO_DIR/.git/avel/state.json' <<'AVEL_STATE'
$(cat "$AVEL_DIR/state.json" 2>/dev/null || echo '{"features": {}}')
AVEL_STATE"
}
pull_record() {  # one feature's record, workspace → here
  local rec; rec="$(run_in "cd '$REPO_DIR'; python3 kit/plan.py export $1" | tail -1)"
  case "$rec" in "{"*"}") printf '%s' "$rec" | python3 kit/plan.py merge-in >/dev/null;; *) return 1;; esac
}
mark() { echo "$1" > "$STATE_DIR/$PROJECT.state"; echo "$(date +%s) $1" >> "$LOG"; }

case "${1:-status}" in
  bootstrap)
    need MIOSA_CREATE_BASE; guard_up
    tpl "$MIOSA_CREATE_BASE" | bash | json_id > "$WS_FILE"; [ -s "$WS_FILE" ] || die "create returned no id"
    mark running
    run_in "set -e
      command -v claude >/dev/null || npm i -g @anthropic-ai/claude-code
      command -v gh >/dev/null || { echo 'gh missing in the image: add it to MIOSA_CREATE_BASE image'; exit 4; }
      gh auth setup-git   # credential helper reads GH_TOKEN at run time; nothing stored
      rm -rf '$REPO_DIR'; git clone -q '$REPO_URL' '$REPO_DIR'; cd '$REPO_DIR'
      ${LANE_SETUP_CMD:-}
      ${LANE_ENV:-}
      $INSTALL_CMD
      git worktree prune" yes
    run_in "$SCAN" || die "scan failed; not snapshotting"
    need MIOSA_SNAPSHOT; tpl "$MIOSA_SNAPSHOT" | bash | json_id > "$SNAP_FILE"
    echo "workspace $(cat "$WS_FILE"), snapshot $(cat "$SNAP_FILE")";;
  snapshot)
    run_in "$SCAN" || die "scan failed. Stop the lanes (they hold tokens in memory) and remove dev env files first."
    tpl "$MIOSA_SNAPSHOT" | bash | json_id > "$SNAP_FILE"; echo "snapshot $(cat "$SNAP_FILE")";;
  up)
    guard_up
    if [ -s "$WS_FILE" ]; then need MIOSA_RESUME; eval "$(tpl "$MIOSA_RESUME")" >/dev/null
    else [ -s "$SNAP_FILE" ] || die "no snapshot yet: run kit/miosa.sh bootstrap"
         need MIOSA_CREATE; tpl "$MIOSA_CREATE" | bash | json_id > "$WS_FILE"; fi
    mark running; echo "up: $(cat "$WS_FILE")";;
  lanes)
    # Lanes already running here? Prove the workspace on one real feature first, then drain these lanes
    # (they finish their current feature and claim nothing) and start the workspace's. Never zero lanes.
    bash kit/preflight.sh --skip-db || die "preflight failed: lanes not started (the workspace checks its database itself)"
    "$0" up
    devenv=""
    [ -n "${MIOSA_DEV_ENV_FILE:-}" ] && [ -f "$MIOSA_DEV_ENV_FILE" ] && \
      devenv="cat > .env.local <<'AVEL_EOF'
$(cat "$MIOSA_DEV_ENV_FILE")
AVEL_EOF"
    prep="set -e; cd '$REPO_DIR'; git fetch -q origin; git checkout -q main; git pull -q --ff-only
      $devenv
      export AVEL_HOST=miosa
      ${LANE_ENV:-}
      $INSTALL_CHECK_CMD"
    old=""; for l in $BUILDERS $CHECKERS; do tmux has-session -t "=$PROJECT-$l" 2>/dev/null && old="$old $l"; done
    if [ -n "$old" ]; then
      fid="$(python3 kit/plan.py claim --agent proof --any-host)" || die "nothing ready to prove the workspace with; local lanes keep running"
      echo "proving the workspace on $fid (local lanes:$old keep running)"
      push_state
      run_in "$prep
        bash kit/seat.sh 'proof:$fid'" yes || {
        pull_record "$fid" || python3 kit/plan.py set "$fid" ready --note "proof run did not start"
        die "the workspace failed preflight; local lanes keep running"; }
      waited=0; rc=""
      while [ -z "$rc" ] && [ "$waited" -lt $(( ${PROOF_MAX_MIN:-60} * 60 )) ]; do
        sleep 30; waited=$((waited + 30))
        rc="$(run_in "cat '$REPO_DIR/.git/avel/proof.rc' 2>/dev/null || true" | tail -1 | tr -dc 0-9)"
      done
      pull_record "$fid" || true
      if [ "$rc" != 0 ]; then
        if [ -z "$rc" ]; then
          run_in "tmux kill-session -t '=$PROJECT-proof' 2>/dev/null || true"
          python3 kit/plan.py set "$fid" ready --note "proof run timed out"
        fi
        python3 kit/msg.py send osa "cutover: the workspace failed its proof run on $fid (exit ${rc:-timeout}); local lanes keep running."
        die "proof run on $fid failed (exit ${rc:-timeout}); local lanes keep running"
      fi
      touch "$AVEL_DIR/drain"
      python3 kit/plan.py export $(python3 -c 'import json,sys; s=json.load(open(sys.argv[1]))["features"]; print(" ".join(i for i, v in s.items() if v.get("status") == "doing"))' "$AVEL_DIR/state.json") \
        > "$AVEL_DIR/cutover.json"
      python3 kit/msg.py send osa "cutover: workspace proved on $fid (review). Local lanes draining (no new claims); workspace lanes starting. Then: kit/miosa.sh retire-local."
    fi
    push_state
    run_in "$prep
      bash kit/seat.sh lanes" yes
    [ -n "$old" ] && echo "local lanes:$old are draining. When they're idle: kit/miosa.sh retire-local"
    true;;
  retire-local)
    # After a cutover: wait for the drained local lanes, hand their last features to the workspace, stop them.
    [ -f "$AVEL_DIR/cutover.json" ] || die "no cutover in progress (kit/miosa.sh lanes starts one)"
    while :; do
      busy=""
      for l in $BUILDERS $CHECKERS; do
        tmux has-session -t "=$PROJECT-$l" 2>/dev/null || continue
        grep -qsE '"state": *"(idle|stopped)"' "$AVEL_DIR/lanes/$l.json" || busy="$busy $l"
      done
      [ -z "$busy" ] && break
      echo "$(date +%H:%M) waiting on:$busy"; sleep 30
    done
    ids="$(python3 -c 'import json,sys; print(" ".join(json.load(open(sys.argv[1]))))' "$AVEL_DIR/cutover.json")"
    if [ -n "$ids" ]; then
      run_in "cd '$REPO_DIR'; python3 kit/plan.py merge-in <<'AVEL_EOF'
$(python3 kit/plan.py export $ids)
AVEL_EOF"
    fi
    for l in $BUILDERS $CHECKERS; do tmux kill-session -t "=$PROJECT-$l" 2>/dev/null || true; done
    sleep 2; pgrep -f 'kit/lane.py' >/dev/null && die "a local lane.py is still running; stop it by hand"
    rm -f "$AVEL_DIR/cutover.json"
    python3 kit/msg.py send osa "cutover done: local lanes stopped, their last features (${ids:-none}) handed to the workspace. Lanes run only on MIOSA."
    echo "local lanes stopped; lanes run only in the workspace";;
  attach)
    need MIOSA_SHELL; s="${2:?which lane: soap fantem rigg fenn}"
    eval "$(tpl "$MIOSA_SHELL") -- tmux attach -t '$PROJECT-$s'" || \
      { echo "Lane $s isn't running in the workspace. Start lanes with: kit/miosa.sh lanes"; read -rp "Enter to close "; };;
  preview) need MIOSA_PREVIEW; eval "$(tpl "$MIOSA_PREVIEW" "${2:-}")";;
  pause) need MIOSA_PAUSE; eval "$(tpl "$MIOSA_PAUSE")"; mark paused; echo paused;;
  down) need MIOSA_DELETE; eval "$(tpl "$MIOSA_DELETE")"; rm -f "$WS_FILE"; mark down; echo "deleted (snapshot kept)";;
  status) echo "project $PROJECT  workspace $(cat "$WS_FILE" 2>/dev/null || echo none)  snapshot $(cat "$SNAP_FILE" 2>/dev/null || echo none)  state $(cat "$STATE_DIR/$PROJECT.state" 2>/dev/null || echo -)";;
  cost)  # hours the workspace was running, from this machine's log (an estimate; MIOSA's bill is the truth)
    python3 - "$LOG" "${MIOSA_RATE_USD_H:-0.1785}" <<'PY'
import sys
secs, start = 0, None
for line in open(sys.argv[1]) if __import__('os').path.exists(sys.argv[1]) else []:
    t, s = line.split()
    t = int(t)
    if s == "running" and start is None: start = t
    elif s != "running" and start is not None: secs += t - start; start = None
if start is not None: secs += int(__import__('time').time()) - start
print(f"{secs/3600:.1f} h running ≈ ${secs/3600*float(sys.argv[2]):.2f} (idle-pause time counted as running; check MIOSA's usage page)")
PY
    ;;
  *) sed -n '2,13p' "$0";;
esac
