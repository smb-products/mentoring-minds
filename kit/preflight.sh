#!/usr/bin/env bash
# kit/preflight.sh [--skip-db]: is this repo ready for lanes? `kit/seat.sh lanes` and `kit/miosa.sh lanes`
# run it first and start no lane unless every check passes. Read-only, except the lane-host probes below (a one-turn haiku call, and a probe branch it deletes).
#   main requires the CI check · repo auto-merge on · Claude attribution off · union merge lines
#   the app is present · the test database answers · OPS_ISSUE is an open issue · the plan has ready work
#   on the lane host (not with --skip-db): a real `claude -p` answers, and GitHub takes a push and an API write
# Settings (kit/project.env, all optional): PREFLIGHT_CHECK (default check), PREFLIGHT_UNION
# (default "CHANGES.md progress.md"), PREFLIGHT_FILES (default package.json).
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
set -a; source kit/project.env; set +a
skip_db=0; [ "${1:-}" = --skip-db ] && skip_db=1
failed=0
ok()  { echo "  ok    $*"; }
bad() { echo "  FAIL  $*"; failed=$((failed + 1)); }
warn() { echo "  WARN  $*"; }

check="${PREFLIGHT_CHECK:-check}"
ghq() { local o; o="$(gh api "$@" 2>/dev/null)" && printf '%s' "$o"; }  # a 404 prints its body on stdout: drop it
req="$(ghq 'repos/{owner}/{repo}/branches/main/protection' \
        --jq '[.required_status_checks.contexts[]?, .required_status_checks.checks[]?.context] | join(" ")') \
     $(ghq 'repos/{owner}/{repo}/rules/branches/main' \
        --jq '[.[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].context] | join(" ")')"
if [[ " $req " == *" $check "* ]]; then ok "main requires the CI check '$check'"
elif [ -z "${req//[[:space:]]/}" ] && [ "${AVEL_HOST:-}" = miosa ]; then  # workspace token can't read protection (admin only)
  ok "main's required check: verified on the laptop by kit/miosa.sh lanes"
else bad "main doesn't require the CI check '$check' (Settings → Branches → main → Require status checks)"; fi

[ "$(gh api 'repos/{owner}/{repo}' --jq .allow_auto_merge 2>/dev/null)" = true ] \
  && ok "repo allows auto-merge" || bad "repo auto-merge is off (Settings → General → Allow auto-merge)"

if python3 - <<'PY'
import json, sys
try:
    d = json.load(open(".claude/settings.json"))
except (OSError, ValueError):
    sys.exit(1)
a = d.get("attribution") or {}
sys.exit(0 if a.get("commit") == "" and a.get("pr") == "" and d.get("includeCoAuthoredBy") is not True else 1)
PY
then ok "Claude attribution is off (.claude/settings.json)"
else bad ".claude/settings.json needs \"attribution\": {\"commit\": \"\", \"pr\": \"\"}"; fi

for f in ${PREFLIGHT_UNION-CHANGES.md progress.md}; do
  grep -qE "^${f//./\\.}[[:space:]]+merge=union" .gitattributes 2>/dev/null \
    && ok ".gitattributes: $f merge=union" || bad ".gitattributes needs the line: $f merge=union"
done

for f in ${PREFLIGHT_FILES-package.json}; do
  [ -e "$f" ] && ok "$f is present" || bad "$f is missing: lanes build from the app"
done

if [ "$skip_db" = 1 ]; then
  ok "test database: checked inside the workspace"
else
  url="$( (eval "${LANE_ENV:-}"; printf %s "${DATABASE_URL_TEST:-}") )"
  if [ -z "$url" ]; then
    ok "test database: none configured (no DATABASE_URL_TEST)"
  elif python3 - "$url" <<'PY'
import socket, sys
from urllib.parse import urlparse
u = urlparse(sys.argv[1])
try:
    socket.create_connection((u.hostname, u.port or 5432), timeout=3).close()
except OSError:
    sys.exit(1)
PY
  then ok "test database answers ($(python3 -c 'import sys; from urllib.parse import urlparse; u=urlparse(sys.argv[1]); print(f"{u.hostname}:{u.port}{u.path}")' "$url"))"
  else bad "test database doesn't answer at DATABASE_URL_TEST (is LANE_SETUP_CMD's container up?)"; fi
fi

if [ -z "${OPS_ISSUE:-}" ]; then
  bad "OPS_ISSUE is empty: create and pin an \"Ops\" issue, put its number in kit/project.env"
elif [ "$(gh issue view "$OPS_ISSUE" --json state --jq .state 2>/dev/null)" = OPEN ]; then
  ok "Ops issue #$OPS_ISSUE is open"
else
  bad "Ops issue #$OPS_ISSUE isn't an open issue"
fi

if [ "${LANES_ON:-local}" = miosa ] && [ "${MSG_BACKEND:-}" = fs ]; then
  bad "MSG_BACKEND=fs but LANES_ON=miosa: lanes on another host can't see laptop messages. Set MSG_BACKEND=both"
fi

if [ -e "$(git rev-parse --path-format=absolute --git-common-dir)/avel/drain" ] && [ "$skip_db" != 1 ]; then
  bad "this host is drained: its lanes moved to another host (rm .git/avel/drain to run lanes here again)"
fi

if [ "$skip_db" = 1 ] || [ "${PREFLIGHT_PROBES:-1}" = 0 ]; then
  ok "login probes: run on the lane host"
else
  out="$(cd "$(mktemp -d)" && AVEL_PROBE=1 timeout 120 claude -p "Reply with the single word ok." --model haiku \
          --max-turns 1 --output-format json </dev/null 2>&1 | tail -1)"
  if python3 -c 'import json,sys; d=json.loads(sys.argv[1]); sys.exit(0 if not d.get("is_error") and d.get("total_cost_usd") else 1)' "$out" 2>/dev/null
  then ok "Claude answers on this host (claude -p)"
  else bad "Claude doesn't answer on this host: ${out:0:140} (log in on this host first)"; fi
  probe="avel/probe-${AVEL_HOST:-local}-$$"
  git fetch -q origin main 2>/dev/null
  if ! perr="$(git push -q origin "refs/remotes/origin/main:refs/heads/$probe" 2>&1)"; then
    bad "GitHub refused a push from this host: ${perr:0:140}"
  elif ! perr="$(gh api -X DELETE "repos/{owner}/{repo}/git/refs/heads/$probe" 2>&1)"; then
    git push -q origin --delete "$probe" 2>/dev/null
    bad "gh can't write to the repo from this host (PRs and auto-merge will fail): ${perr:0:140}"
  else ok "GitHub takes a push and an API write from this host"; fi
fi

if counts="$(python3 kit/plan.py ready)"; then
  ok "plan has ready work (build check: $counts)"
else
  warn "nothing in the plan is ready to claim yet (build check: $counts); lanes start idle and the guard wakes them"
fi

if [ "$failed" -gt 0 ]; then echo "preflight: $failed failed, lanes not started"; exit 1; fi
echo "preflight: all clear"
