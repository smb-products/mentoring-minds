#!/usr/bin/env bash
# kit/guard.sh [soft_cap_usd] [hard_cap_usd]: the lanes' night watch. Shell only, no model calls.
# Every minute: plan.py refresh (merged PRs, holdout promotion, conflict healing), wake idle lanes when
# work is ready, and log each new event once (hold, stuck, a PR still conflicting) for OSA.
# Then kit/watch.py: a lane idle 5 min with ready work, a held PR green and waiting, a frozen seat → messages.
# Lane state comes from .git/avel/lanes/<agent>.json (lane.py writes it); a stopped lane is never woken.
# Caps are optional (none by default). Soft: stop the lanes once all are idle. Hard: stop them now.
# `kit/seat.sh lanes` starts it in tmux as <project>-guard if it isn't running. Log: ~/.avel/<project>-guard.log
cd "$(git rev-parse --show-toplevel)" || exit 1
set -a; source kit/project.env; set +a
SOFT=${1:-}; HARD=${2:-}
P="$PROJECT"; LANES="$BUILDERS $CHECKERS"
seen=""
event() { case " $seen " in *" $1 "*) ;; *) seen="$seen $1"; echo "$(date '+%F %H:%M') EVENT $2";; esac; }
LANES_DIR="$(git rev-parse --path-format=absolute --git-common-dir)/avel/lanes"
idle() {  # the lane's own state file; screen text only for a lane that predates it
  if [ -f "$LANES_DIR/$1.json" ]; then grep -q '"state": *"idle"' "$LANES_DIR/$1.json"
  else tmux capture-pane -p -t "$P-$1" 2>/dev/null | grep -v '^\s*$' | tail -1 | grep -q 'Lane idle'; fi
}
over() { [ -n "$1" ] && awk "BEGIN{exit !($spent >= $1)}"; }
stop_lanes() { for l in $LANES; do tmux kill-session -t "=$P-$l" 2>/dev/null; done; echo "$(date '+%F %H:%M') $1"; }

echo "$(date '+%F %H:%M') guard up: lanes $LANES, caps soft=${SOFT:-none} hard=${HARD:-none}"
while true; do
  python3 kit/plan.py refresh >/dev/null 2>&1
  board=$(python3 kit/plan.py board 2>/dev/null)
  spent=$(echo "$board" | sed -n 's/.*spent: \$\([0-9.]*\).*/\1/p' | tail -1); spent=${spent:-0}
  while read -r id st who; do
    [ -n "$id" ] && event "$id:$st" "$st $id ($who) spent \$$spent"
  done < <(echo "$board" | awk '$2=="hold" || $2=="stuck" {print $1, $2, $3}')
  while read -r n head; do  # refresh heals what it can; what's left needs a lead
    [ -n "$n" ] && event "pr$n:dirty" "conflict PR #$n $head"
  done < <(gh pr list --state open --json number,headRefName,mergeable \
             -q '.[] | select(.mergeable=="CONFLICTING") | "\(.number) \(.headRefName)"' 2>/dev/null)
  python3 kit/watch.py --lanes --seats >/dev/null 2>&1
  if over "$HARD"; then stop_lanes "CAP hard \$$HARD reached (spent \$$spent): lanes stopped"; exit 0; fi
  if python3 kit/plan.py ready >/dev/null 2>&1 && ! over "$SOFT"; then
    for l in $LANES; do idle "$l" && tmux send-keys -t "$P-$l" Enter; done
  fi
  if over "$SOFT"; then
    busy=0; for l in $LANES; do idle "$l" || busy=1; done
    if [ $busy = 0 ]; then stop_lanes "CAP soft \$$SOFT reached (spent \$$spent): lanes idle, stopped"; exit 0; fi
  fi
  sleep "${GUARD_POLL_S:-60}"
done
