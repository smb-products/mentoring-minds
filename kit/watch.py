#!/usr/bin/env python3
"""kit/watch.py: one pass of the guard's alerts. Reads plan state and lane state files, not screen text.

  watch.py --lanes    a lane idle WATCH_IDLE_MIN (5) with ready work → OSA
  watch.py --seats    a held PR green and waiting WATCH_HELD_MIN (10) → wake its owner (its `owner:<seat>`
                      label, else the feature's `held` in plan/features.json, else HELD_OWNER, zero).
                      Drafts are skipped (not ready yet), and so are PRs already in the merge queue.
                      a seat with an unsent prompt for WATCH_UNSENT_MIN (5), or no transcript write for
                      WATCH_STALE_MIN (30) with unread inbox (FYI messages don't count) → OSA (osa's own → ops)

Each alert fires once per episode (state in .git/avel/watch.json). Seat checks need the seats' tmux
sessions on this machine, so the guard on a MIOSA workspace skips them; on the laptop run
`kit/seat.sh watch`. A lead is woken by a message, plus one line typed into its seat if the box is empty.
"""
import calendar, json, os, re, sys, time
from pathlib import Path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import avel_dir, load_env, read_json, root, sh, words, write_json
import msg, plan

ENV = load_env()
P = ENV.get("PROJECT", "project")
MEMO = avel_dir() / "watch.json"


def minutes(key, default):
    return float(ENV.get(key, default)) * 60


def once(memo, key, to, text):
    if key not in memo["sent"]:
        memo["sent"][key] = int(time.time())
        msg.send(to, text, "guard")
        return True
    return False


def lanes(memo):
    build, check = plan.ready_counts()
    for agent in words(ENV.get("BUILDERS", "")) + words(ENV.get("CHECKERS", "")):
        ready = check if agent in words(ENV.get("CHECKERS", "")) else build
        s = read_json(avel_dir() / "lanes" / f"{agent}.json", {})
        if s.get("state") == "idle" and ready and time.time() - s.get("since", 0) >= minutes("WATCH_IDLE_MIN", 5):
            idle = int((time.time() - s["since"]) // 60)
            once(memo, f"idle:{agent}:{s['since']}", "osa",
                 f"{agent}: idle {idle} min with {ready} ready. Not woken, or can't claim (touches, drain, LANES_ON).")


def tmux(*args):
    code, out = sh(["tmux", *args])
    return out if code == 0 else None


def has_seat(seat):
    return tmux("has-session", "-t", f"={P}-{seat}") is not None


def unsent(seat):
    """Text typed into the seat's input box and not sent (Claude Code dims its own suggestions)."""
    out = tmux("capture-pane", "-e", "-p", "-t", f"{P}-{seat}") or ""
    lines = [l for l in out.splitlines() if "❯" in l]
    if not lines:
        return ""
    after = lines[-1].split("❯", 1)[1].replace(" ", " ").lstrip()
    if after.startswith("\x1b[2m"):
        return ""
    return re.sub(r"\x1b\[[0-9;]*m", "", after).strip()


def transcript_age(seat):
    """Seconds since the seat's Claude session last wrote its transcript, or None."""
    pid = (tmux("list-panes", "-t", f"{P}-{seat}", "-F", "#{pane_pid}") or "").split()
    if not pid:
        return None
    info = read_json(Path.home() / ".claude" / "sessions" / f"{pid[0]}.json", {})
    if not info.get("sessionId"):
        return None
    slug = re.sub(r"[^A-Za-z0-9]", "-", info.get("cwd") or str(root()))
    f = Path.home() / ".claude" / "projects" / slug / f"{info['sessionId']}.jsonl"
    return time.time() - f.stat().st_mtime if f.exists() else None


FYI = re.compile(r"^\s*(\w+:\s*)?fyi\b", re.I)  # "FYI …" or "atlas: FYI …": nothing to do, so not a backlog


def unread(seat, all_msgs):
    """Unread messages that ask for something. An idle seat with only FYIs waiting isn't frozen."""
    seen = set(read_json(avel_dir() / "msg-cursor.json", {}).get(seat, []))
    return sum(1 for m in all_msgs if msg.for_agent(m, seat) and m["id"] not in seen and m["from"] != seat
               and not FYI.match(m.get("text") or ""))


def seats(memo):
    names = words(ENV.get("LEADS", "")) + words(ENV.get("OPS", "")) + ["osa"]
    here = [s for s in names if has_seat(s)]
    if not here:
        return
    all_msgs = msg.read_all()
    for seat in here:
        to = "ops" if seat == "osa" else "osa"
        text = unsent(seat)
        first = memo["unsent"].get(seat)
        if text and first and first["text"] == text:
            if time.time() - first["at"] >= minutes("WATCH_UNSENT_MIN", 5):
                once(memo, f"unsent:{seat}:{first['at']}", to,
                     f"{seat}: a prompt has sat unsent in its seat for {int((time.time() - first['at']) // 60)} min: "
                     f"\"{text[:80]}\". Press Enter there, or clear it.")
        elif text:
            memo["unsent"][seat] = {"text": text, "at": int(time.time())}
        else:
            memo["unsent"].pop(seat, None)
        age, n = transcript_age(seat), unread(seat, all_msgs)
        if age is not None and age >= minutes("WATCH_STALE_MIN", 30) and n:
            once(memo, f"stale:{seat}:{int(time.time() - age)}", to,
                 f"{seat}: no transcript write for {int(age // 60)} min with {n} unread messages. Seat may be frozen: "
                 "restart it and re-brief from its inbox.")
    held(memo, here)


QUEUE_Q = ('query($owner:String!,$name:String!){repository(owner:$owner,name:$name)'
           '{mergeQueue(branch:"main"){entries(first:100){nodes{pullRequest{number}}}}}}')


def queued():
    """PR numbers in the merge queue. They wait on the queue's CI, not a lead, and `gh pr list` can't show it
    (autoMergeRequest stays null for a queued PR)."""
    code, out = sh(["gh", "api", "graphql", "-F", "owner={owner}", "-F", "name={repo}", "-f", f"query={QUEUE_Q}"])
    try:
        nodes = json.loads(out)["data"]["repository"]["mergeQueue"]["entries"]["nodes"]
        return {n["pullRequest"]["number"] for n in nodes if n.get("pullRequest")}
    except (ValueError, KeyError, TypeError):
        return set()


def held(memo, here):
    code, out = sh(["gh", "pr", "list", "--state", "open", "--limit", "100",
                    "--json", "number,headRefName,headRefOid,statusCheckRollup,autoMergeRequest,isDraft,labels"])
    if code:
        return
    in_queue = queued()
    default = ENV.get("HELD_OWNER", "zero")
    held_by = {f"f/{f['id']}": f.get("held") for f in plan.features() if f.get("held")}
    for p in json.loads(out or "[]"):
        # The seat that claimed it (`owner:<seat>`) first, then the lead the plan names (`held`, also on
        # f/<id>-r<n> after a reopen), then HELD_OWNER.
        claimed = [l["name"].split(":", 1)[1] for l in p.get("labels") or [] if l.get("name", "").startswith("owner:")]
        owner = (claimed[0] if claimed else None) or held_by.get(re.sub(r"-r\d+$", "", p["headRefName"])) or default
        checks = p.get("statusCheckRollup") or []
        if p.get("autoMergeRequest") or p["number"] in in_queue or p.get("isDraft") or not checks:
            continue
        if any((c.get("conclusion") or c.get("state") or "").upper() not in ("SUCCESS", "NEUTRAL", "SKIPPED") for c in checks):
            continue
        done = [c.get("completedAt") for c in checks if c.get("completedAt")]
        try:
            green = max(calendar.timegm(time.strptime(d[:19], "%Y-%m-%dT%H:%M:%S")) for d in done)
        except ValueError:
            continue
        if time.time() - green < minutes("WATCH_HELD_MIN", 10):
            continue
        mins = int((time.time() - green) // 60)
        line = f"PR #{p['number']} ({p['headRefName']}) is green and has waited {mins} min for you to merge it."
        if once(memo, f"held:{p['number']}:{p['headRefOid']}", owner, line) and owner in here and not unsent(owner):
            tmux("send-keys", "-t", f"{P}-{owner}", "-l", f"Check your inbox: kit/msg.py inbox {owner}. {line}")
            tmux("send-keys", "-t", f"{P}-{owner}", "Enter")


def main(a):
    memo = read_json(MEMO, {})
    memo.setdefault("sent", {})
    memo.setdefault("unsent", {})
    if "--lanes" in a:
        lanes(memo)
    if "--seats" in a:
        seats(memo)
    cutoff = time.time() - 7 * 86400
    memo["sent"] = {k: v for k, v in memo["sent"].items() if v > cutoff}
    write_json(MEMO, memo)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
