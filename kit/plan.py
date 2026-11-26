#!/usr/bin/env python3
"""kit/plan.py: the feature queue. plan/features.json is the plan (leads write it);
lane state (claims, attempts, sessions, cost) lives in the shared git dir, so lanes in
different worktrees never conflict on a tracked file.

  plan.py claim --agent soap [--role build|check]   print the next ready feature id(s), or exit 1
          [--any-host]                              ignore LANES_ON and drain (the cutover reserves a proof feature)
  plan.py export [ids…] | plan.py merge-in          move feature records between hosts (cutover)
  plan.py set <id> <status> [--pr N] [--cost USD] [--session S] [--note TEXT]
  plan.py reopen <id> --note TEXT                   a checker found a failing holdout: next round, fresh branch
  plan.py refresh                                   mark merged PRs; checking → checked; heal conflicting lane PRs (needs gh)
  plan.py ready                                     "<build> <check>": features ready to claim (read-only)
  plan.py show <id>                                 the feature as JSON, for a prompt
  plan.py board                                     who is on what, and cost so far

Status: ready → doing → review (PR open, auto-merge on) → merged → checking (holdout PR open) → checked
        `set <id> checking` records the checker's branch (AVEL_BRANCH); refresh marks it checked
        once that PR merges, and tells OSA once if its CI fails.
        doing → ready (retry, resumes the session) | stuck (needs Javaris) | hold (needs a lead)
Claims: only on the LANES_ON host, and none while .git/avel/drain exists (a cutover is moving lanes away).
Checkers take a batch only with CHECK_MIN merged features waiting, or once the oldest has waited
CHECK_WAIT_MIN minutes; CHECK_BATCH is the most per batch.
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import avel_dir, load_env, locked, now, read_json, root, sh, write_json

ENV = load_env()
DONE = ("merged", "checking", "checked")  # the feature's own PR has merged
STATE = avel_dir() / "state.json"


def features():
    data = read_json(root() / "plan" / "features.json", {"features": []})
    return data["features"]


def state():
    return read_json(STATE, {"features": {}})


def status_of(f, st):
    return st["features"].get(f["id"], {}).get("status") or f.get("status", "ready")


def branch_of(fid, s):
    """The feature's build branch: f/<id>, then f/<id>-r<n> after the n-th reopen (fresh from main)."""
    return f"f/{fid}" + (f"-r{s['round']}" if s.get("round") else "")


def host():
    return ENV.get("AVEL_HOST", "local")


def overlaps(a, b):
    """Two touch lists clash if any path equals or contains the other (folders end in /)."""
    return any(x == y or x.startswith(y.rstrip("/") + "/") or y.startswith(x.rstrip("/") + "/")
               for x in a for y in b)


def claim_build(agent):
    st, fs = state(), features()
    doing = [f for f in fs if status_of(f, st) == "doing"]
    busy = [t for f in doing for t in f.get("touches", [])]
    max_attempts = int(ENV.get("MAX_ATTEMPTS", "2"))
    for f in fs:
        s = st["features"].setdefault(f["id"], {})
        if status_of(f, st) != "ready":
            continue
        if f.get("role", "build") != "build" or f.get("where", "any") not in ("any", host()):
            continue
        if any(status_of(d, st) not in DONE for d in fs if d["id"] in f.get("deps", [])):
            continue
        if overlaps(busy, f.get("touches", [])):
            continue
        if s.get("attempts", 0) >= max_attempts:
            s.update(status="stuck", updated=now())
            continue
        s.update(status="doing", owner=agent, attempts=s.get("attempts", 0) + 1, updated=now())
        write_json(STATE, st)
        return [f["id"]]
    write_json(STATE, st)
    return []


def waiting_checks(st):
    """Merged features no checker holds, if there are enough of them (or one has waited long enough)."""
    ids = [f["id"] for f in features() if status_of(f, st) == "merged"
           and not st["features"].get(f["id"], {}).get("checker")]
    if not ids or len(ids) >= int(ENV.get("CHECK_MIN", "3")):
        return ids
    def since(i):
        try:
            return time.mktime(time.strptime(st["features"][i]["updated"], "%Y-%m-%dT%H:%M:%S"))
        except (KeyError, ValueError):
            return 0
    oldest = min(since(i) for i in ids)
    return ids if time.time() - oldest >= float(ENV.get("CHECK_WAIT_MIN", "30")) * 60 else []


def claim_check(agent):
    st = state()
    ids = waiting_checks(st)[:int(ENV.get("CHECK_BATCH", "3"))]
    for i in ids:
        st["features"].setdefault(i, {}).update(checker=agent, updated=now())
    write_json(STATE, st)
    return ids


def set_status(fid, status, **kw):
    with locked("state"):
        st = state()
        s = st["features"].setdefault(fid, {})
        s.update(status=status, updated=now())
        for k, v in kw.items():
            if v is None:
                continue
            if k == "cost":
                s["cost_usd"] = round(s.get("cost_usd", 0) + float(v), 4)
            elif k == "note":
                s.setdefault("notes", []).append(v)
            else:
                s[k] = v
        if status in ("ready", "checked"):
            s.pop("checker", None)
        write_json(STATE, st)


def refresh():
    code, out = sh(["gh", "pr", "list", "--state", "merged", "--limit", "200",
                    "--json", "headRefName,number"])
    if code:
        print(f"refresh: gh failed: {out.strip()[:200]}", file=sys.stderr)
        return 0
    prs = {}  # head branch → newest merged PR number
    for p in json.loads(out):
        prs[p["headRefName"]] = max(prs.get(p["headRefName"], 0), p["number"])
    n, failed = 0, []
    with locked("state"):
        st = state()
        for f in features():
            s = st["features"].get(f["id"], {})
            pr = prs.get(branch_of(f["id"], s), 0)  # this round's branch only, newer than a reopen
            if pr > int(s.get("reopened_from") or 0) and status_of(f, st) not in DONE:
                st["features"].setdefault(f["id"], {}).update(status="merged", pr=pr, updated=now())
                n += 1
            elif status_of(f, st) == "checking" and s.get("hbranch") in prs:
                s.update(status="checked", hpr=prs[s["hbranch"]], updated=now())
                s.pop("checker", None)
        checking = {s["hbranch"]: fid for fid, s in st["features"].items()
                    if s.get("status") == "checking" and s.get("hbranch")}
        code, out = sh(["gh", "pr", "list", "--state", "open", "--limit", "100",
                        "--json", "headRefName,number,statusCheckRollup,mergeable"])
        open_prs = json.loads(out) if code == 0 else []
        if checking:  # a holdout PR whose CI failed: tell OSA once per PR
            for p in open_prs:
                fid = checking.get(p["headRefName"])
                bad = any((c.get("conclusion") or c.get("state") or "").upper() in ("FAILURE", "ERROR", "TIMED_OUT")
                          for c in p.get("statusCheckRollup") or [])
                if fid and bad and st["features"][fid].get("hfail") != p["number"]:
                    st["features"][fid]["hfail"] = p["number"]
                    failed.append((fid, p["number"]))
        write_json(STATE, st)
    if failed:
        from msg import send
        for fid, pr in failed:
            send("osa", f"{fid}: holdout PR #{pr} CI failed. A broken test is the checker's to fix; "
                        f"if the feature is wrong, kit/plan.py reopen {fid}.", "lane")
    from heal import heal_open
    heal_open(open_prs)
    return n


def ready_counts():
    """(build, check): features a builder or checker lane could claim now. Changes nothing."""
    st, fs = state(), features()
    build = sum(1 for f in fs if status_of(f, st) == "ready" and f.get("role", "build") == "build"
                and all(status_of(d, st) in DONE for d in fs if d["id"] in f.get("deps", [])))
    return build, len(waiting_checks(st))


def merged_today():
    """(feature, process): PRs merged today, f/* vs everything else, or None without gh."""
    code, out = sh(["gh", "pr", "list", "--state", "merged", "--limit", "200", "--json", "headRefName",
                    "--search", f"merged:>={time.strftime('%Y-%m-%d')}"])
    if code:
        return None
    heads = [p["headRefName"] for p in json.loads(out)]
    feature = sum(1 for h in heads if h.startswith("f/"))
    return feature, len(heads) - feature


def shown_status(f, st, fs):
    s = status_of(f, st)
    if s == "ready" and f.get("role", "build") != "build":
        return f.get("role")
    if s == "ready" and any(status_of(d, st) not in DONE for d in fs if d["id"] in f.get("deps", [])):
        return "waiting"
    return s


def board():
    st, fs = state(), features()
    total = 0.0
    print(f"{'id':<10} {'status':<8} {'who':<7} {'try':>3} {'$':>6}  title")
    for f in fs:
        s = st["features"].get(f["id"], {})
        total += s.get("cost_usd", 0)
        who = s.get("checker") or s.get("owner", "")
        print(f"{f['id']:<10} {shown_status(f, st, fs):<8} {who:<7} {s.get('attempts', 0):>3} "
              f"{s.get('cost_usd', 0):>6.2f}  {f['title'][:60]}")
    counts = {}
    for f in fs:
        k = shown_status(f, st, fs)
        counts[k] = counts.get(k, 0) + 1
    print("\n" + "  ".join(f"{k}: {v}" for k, v in sorted(counts.items())) + f"   spent: ${total:.2f}")
    today = merged_today()
    if today:
        print(f"PRs merged today: {today[0]} feature (f/*), {today[1]} process (everything else)")


def arg(args, name, default=None):
    return args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else default


def main(a):
    if not a or a[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    cmd = a[0]
    if cmd == "claim":
        anyhost = "--any-host" in a
        if not anyhost and ENV.get("LANES_ON") and ENV["LANES_ON"] != host():  # one machine only: no duplicates
            print(f"claim: lanes run on {ENV['LANES_ON']}, this is {host()}", file=sys.stderr)
            return 1
        if not anyhost and (avel_dir() / "drain").exists():
            print("claim: draining (lanes are moving to another host)", file=sys.stderr)
            return 1
        with locked("state"):
            ids = (claim_check if arg(a, "--role", "build") == "check" else claim_build)(arg(a, "--agent", "lane"))
        print(" ".join(ids))
        return 0 if ids else 1
    if cmd == "set" and len(a) >= 3:
        hbranch = os.environ.get("AVEL_BRANCH") if a[2] == "checking" else None
        set_status(a[1], a[2], pr=arg(a, "--pr"), cost=arg(a, "--cost"),
                   session=arg(a, "--session"), note=arg(a, "--note"), hbranch=hbranch)
    elif cmd == "reopen" and len(a) >= 2:
        s = state()["features"].get(a[1], {})
        set_status(a[1], "ready", note=arg(a, "--note", "holdout failed"), attempts=0, session="",
                   round=s.get("round", 0) + 1, reopened_from=s.get("pr") or 0)
    elif cmd == "ready":
        print(*ready_counts())
        return 0 if any(ready_counts()) else 1
    elif cmd == "refresh":
        print(f"{refresh()} newly merged")
    elif cmd == "show" and len(a) >= 2:
        f = next((x for x in features() if x["id"] == a[1]), None)
        if not f:
            return 1
        f = dict(f, notes=state()["features"].get(a[1], {}).get("notes", []))
        print(json.dumps(f, indent=2))
    elif cmd == "board":
        board()
    elif cmd == "export":
        fs = state()["features"]
        print(json.dumps({i: fs[i] for i in (a[1:] or fs) if i in fs}))
    elif cmd == "merge-in":
        recs = json.load(sys.stdin)
        with locked("state"):
            st = state()
            st["features"].update(recs)
            write_json(STATE, st)
        print(f"merged {len(recs)} records")
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
