#!/usr/bin/env bash
# kit/seat.sh <seat>: open (or reattach) one seat as its own tmux session, "<project>-<seat>".
# Sessions outlive the terminal: close WezTerm, reopen, and every agent is where it was.
#
# Seats: osa axis zero atlas            interactive Claude sessions (on this machine)
#        soap fantem rigg fenn          headless lanes (here, or in MIOSA when LANES_ON=miosa)
#        board feed inbox:<agent>       watchers
#        watch                          seat alerts (frozen seat, unsent prompt, held PR waiting) when the guard runs elsewhere
#        lanes                          preflight, then every lane detached plus the guard, then exit
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
KIT="$PWD/kit"
set -a; source "$KIT/project.env"; set +a
export PATH="$KIT:$PATH"
seat="${1:?usage: kit/seat.sh <seat>}"
name="${PROJECT}-${seat/:/-}"

role_of() {
  case " $LEADS " in *" $1 "*) echo lead; return;; esac
  case " $BUILDERS " in *" $1 "*) echo build; return;; esac
  case " $CHECKERS " in *" $1 "*) echo check; return;; esac
  case " $OPS " in *" $1 "*) echo ops; return;; esac
  [ "$1" = osa ] && echo operator || echo ""
}

lane_setup() {  # LANE_SETUP_CMD (project.env), once per start; idempotent
  [ -z "${LANE_SETUP_CMD:-}" ] || eval "$LANE_SETUP_CMD"
}

preflight() {  # kit/preflight.sh: no lane starts unless the repo is ready
  bash "$KIT/preflight.sh" || { echo "Lanes not started. Fix the FAIL lines above, then try again."; exit 1; }
}

guard_up() {  # kit/guard.sh in tmux, unless a guard already runs (old ~/.avel/bin copies count)
  tmux has-session -t "$PROJECT-guard" 2>/dev/null && return
  pgrep -f "($PROJECT-guard|kit/guard)\.sh" >/dev/null && return
  mkdir -p "$HOME/.avel"
  tmux new-session -d -s "$PROJECT-guard" \
    "${LANE_ENV:+$LANE_ENV; }bash kit/guard.sh ${GUARD_CAPS:-} >> $HOME/.avel/$PROJECT-guard.log 2>&1"
}

# A lane that waits for Enter when idle, so the pane stays useful. LANE_ENV goes into the session's
# own command: tmux new-session takes the tmux server's environment, not this shell's.
lane_cmd() {
  echo "${LANE_ENV:+$LANE_ENV; }while true; do python3 kit/lane.py --agent $1 --role $2; if [ \$? = 3 ]; then read -rp 'Lane stopped: not logged in on this host (see OSA inbox). Log in, then Enter. '; else read -rp 'Lane idle. Enter to run again, Ctrl-C to close. '; fi; done"
}

open_session() {  # name, command
  if [ -n "${TMUX:-}" ] && ! tmux has-session -t "$1" 2>/dev/null; then
    tmux new-session -d -s "$1" "$2"; tmux switch-client -t "$1"
  else
    exec tmux new-session -A -s "$1" "$2"
  fi
}

case "$seat" in
  board) open_session "$name" "while true; do clear; python3 kit/plan.py board; echo; gh pr list --limit 8 2>/dev/null; sleep ${BOARD_REFRESH_S:-30}; done";;
  feed)  open_session "$name" "python3 kit/msg.py feed --follow";;
  watch) open_session "$name" "while true; do python3 kit/watch.py --seats; sleep 60; done";;  # laptop seats when lanes run elsewhere
  inbox:*) open_session "$name" "AVEL_AGENT=${seat#inbox:} python3 kit/msg.py inbox ${seat#inbox:} --follow";;
  proof:*)  # the cutover's proof run on a new host: one reserved feature, exit code in .git/avel/proof.rc
    fid="${seat#proof:}"; rc="$(git rev-parse --path-format=absolute --git-common-dir)/avel/proof.rc"
    lane_setup
    preflight
    rm -f "$rc"; tmux kill-session -t "=$PROJECT-proof" 2>/dev/null || true
    tmux new-session -d -s "$PROJECT-proof" \
      "${LANE_ENV:+$LANE_ENV; }python3 kit/lane.py --agent ${BUILDERS%% *} --feature $fid; echo \$? > $rc"
    echo "proof run: $fid in $PROJECT-proof";;
  lanes)
    lane_setup
    preflight
    for a in $BUILDERS; do tmux has-session -t "$PROJECT-$a" 2>/dev/null || tmux new-session -d -s "$PROJECT-$a" "$(lane_cmd "$a" build)"; done
    for a in $CHECKERS; do tmux has-session -t "$PROJECT-$a" 2>/dev/null || tmux new-session -d -s "$PROJECT-$a" "$(lane_cmd "$a" check)"; done
    guard_up
    echo "lanes up: $BUILDERS $CHECKERS (guard: $PROJECT-guard, log ~/.avel/$PROJECT-guard.log)";;
  *)
    role="$(role_of "$seat")"
    [ -z "$role" ] && { echo "unknown seat: $seat"; exit 2; }
    if [ "$role" = build ] || [ "$role" = check ]; then
      if [ "${LANES_ON:-local}" = miosa ]; then
        exec "$KIT/miosa.sh" attach "$seat"     # the lane runs in the project's MIOSA workspace
      fi
      tmux has-session -t "$name" 2>/dev/null || { lane_setup; preflight; }
      open_session "$name" "$(lane_cmd "$seat" "$role")"
    else
      agent_file="$([ "$role" = operator ] && echo osa || echo "$role")"
      Name="$(printf '%s' "$seat" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')"
      open_session "$name" "AVEL_AGENT=$seat AVEL_KIND=$role claude --agent $agent_file --append-system-prompt 'Your name is $Name.'"
    fi;;
esac
