#!/usr/bin/env python3
"""kit/msg.py: how OSA, the leads, builders, checkers and ops talk.

  msg.py send <to> <text...>      to = an agent name, a group (leads, builders, checkers, ops) or all
  msg.py inbox [agent] [--follow] unread messages for an agent, then marks them read
  msg.py feed [--follow]          every message, newest last

Backends (MSG_BACKEND in kit/project.env):
  fs    same machine: a JSONL file in the shared git dir, so every worktree sees it
  gh    across machines: comments on the pinned Ops issue (OPS_ISSUE), "[to:x][from:y][id:z] text"
  both  send to both, read from both (default when OPS_ISSUE is set)
"""
import calendar, json, os, re, sys, time, uuid
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import avel_dir, load_env, locked, now, read_json, sh, write_json

ENV = load_env()
GROUPS = {g: ENV.get(g.upper(), "").split() for g in ("leads", "builders", "checkers", "ops")}
GROUPS["osa"] = ["osa"]
GH_RE = re.compile(r"^\[to:([\w-]+)\]\[from:([\w-]+)\]\[id:(\w+)\]\s*(.*)", re.S)


def backend():
    b = ENV.get("MSG_BACKEND", "")
    return b or ("both" if ENV.get("OPS_ISSUE") else "fs")


def me():
    return ENV.get("AVEL_AGENT") or os.environ.get("USER", "javaris")


def for_agent(msg, agent):
    to = msg["to"]
    return to in ("all", agent) or agent in GROUPS.get(to, [])


def send(to, text, sender=None):
    m = {"id": uuid.uuid4().hex[:8], "at": now(), "from": sender or me(), "to": to, "text": text}
    if backend() in ("fs", "both"):
        with locked("msg"):
            with open(avel_dir() / "msg.jsonl", "a") as fh:
                fh.write(json.dumps(m) + "\n")
    if backend() in ("gh", "both") and ENV.get("OPS_ISSUE"):
        body = f"[to:{m['to']}][from:{m['from']}][id:{m['id']}] {text}"
        code, out = sh(["gh", "issue", "comment", ENV["OPS_ISSUE"], "--body", body])
        if code:
            print(f"msg: gh post failed, kept locally: {out.strip()[:200]}", file=sys.stderr)
    return m


def local(utc):
    """GitHub's UTC createdAt as the local "at" that fs messages carry, so ages and the merged order agree."""
    try:
        t = calendar.timegm(time.strptime(utc[:19], "%Y-%m-%dT%H:%M:%S"))
    except ValueError:
        return utc[:19]
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(t))


def read_all():
    msgs = {}
    if backend() in ("fs", "both"):
        try:
            for line in open(avel_dir() / "msg.jsonl"):
                if line.strip():
                    m = json.loads(line)
                    msgs[m["id"]] = m
        except OSError:
            pass
    if backend() in ("gh", "both") and ENV.get("OPS_ISSUE"):
        code, out = sh(["gh", "issue", "view", ENV["OPS_ISSUE"], "--json", "comments"])
        if code == 0:
            for c in json.loads(out).get("comments", []):
                g = GH_RE.match(c.get("body", ""))
                if g and g.group(3) not in msgs:
                    msgs[g.group(3)] = {"id": g.group(3), "at": local(c.get("createdAt", "")),
                                        "from": g.group(2), "to": g.group(1), "text": g.group(4)}
    return sorted(msgs.values(), key=lambda m: m["at"])


def show(m):
    print(f"{m['at'][11:16]} {m['from']:>7} → {m['to']:<8} {m['text']}", flush=True)


def inbox(agent, follow=False, mark=True):
    cur_file = avel_dir() / "msg-cursor.json"
    while True:
        seen = set(read_json(cur_file, {}).get(agent, []))
        new = [m for m in read_all() if for_agent(m, agent) and m["id"] not in seen]
        for m in new:
            show(m)
        if mark and new:
            with locked("cursor"):
                cur = read_json(cur_file, {})
                cur[agent] = (cur.get(agent, []) + [m["id"] for m in new])[-2000:]
                write_json(cur_file, cur)
        if not follow:
            return new
        time.sleep(int(ENV.get("MSG_POLL_S", "20")))


def feed(follow=False):
    shown = set()
    while True:
        for m in read_all():
            if m["id"] not in shown:
                shown.add(m["id"])
                show(m)
        if not follow:
            return
        time.sleep(int(ENV.get("MSG_POLL_S", "20")))


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    cmd, rest = argv[0], argv[1:]
    follow = "--follow" in rest
    rest = [a for a in rest if a != "--follow"]
    if cmd == "send" and len(rest) >= 2:
        send(rest[0], " ".join(rest[1:]))
    elif cmd == "inbox":
        if not inbox(rest[0] if rest else me(), follow) and not follow:
            print("(no new messages)")
    elif cmd == "feed":
        feed(follow)
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
