#!/usr/bin/env python3
"""kit/plan.py: the feature queue. plan/features.json is the plan (leads write it);
lane state (claims, attempts, sessions, cost) lives in the shared git dir, so lanes in
different worktrees never conflict on a tracked file.

  plan.py claim --agent soap [--role build|check]   print the next ready feature id(s), or exit 1
          [--any-host]                              ignore LANES_ON and drain (the cutover reserves a proof feature)
  plan.py export [ids…] | plan.py merge-in          move feature records between hosts (cutover)
  plan.py set <id> <status> [--pr N] [--cost USD] [--session S] [--note TEXT]
  plan.py reopen <id> --note TEXT                   a checker found a failing holdout: next round, fresh branch,
                                                    held as needs_checks until a lead writes the case into its
                                                    checks and runs `plan.py set <id> ready`
  plan.py refresh                                   mark merged PRs; checking → checked; heal conflicting lane PRs;
                                                    report a PR the merge queue dropped (needs gh)
  plan.py ready                                     "<build> <check>": features ready to claim (read-only)
  plan.py show <id>                                 the feature as JSON, for a prompt
  plan.py board                                     who is on what, and cost so far
  plan.py lint [file]                               ids, deps, cycles and `held` in plan/features.json (CI runs it)
                                                    (a feature whose touches hit PROTECT_MERGE names its lead)

A lead's small fix (RULES.md, Ownership) ships with its own entry, "status": "review", on branch f/<id> in the
same PR: no lane claims it, and refresh marks it merged when that PR merges, so the checker takes it as usual.

Status: ready → doing → review (PR open, auto-merge on) → merged → checking (holdout PR open) → checked
        `set <id> checking` records the checker's branch (AVEL_BRANCH); refresh marks it checked
        once that PR merges, and tells OSA once if its CI fails.
        doing → ready (retry, resumes the session) | stuck (needs Javaris) | hold (needs a lead)
        reopen → needs_checks (no lane claims it) → ready once a lead has updated its checks
Claims: only on the LANES_ON host, and none while .git/avel/drain exists (a cutover is moving lanes away).
Checkers take a batch only with CHECK_MIN merged features waiting, or once the oldest has waited
CHECK_WAIT_MIN minutes; CHECK_BATCH is the most per batch.
"""
import json, os, sys, time
from pathlib import Path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import avel_dir, glob_hit, load_env, locked, now, read_json, root, sh, words, write_json

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
    """Two touch lists clash if any path equals or contains the other (folders end in /).
    SHARED_TOUCHES are files every feature edits on its own lines (merge-safe): they never clash."""
    shared = set(ENV.get("SHARED_TOUCHES", "").split())
    a, b = [x for x in a if x not in shared], [y for y in b if y not in shared]
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
    """Merged features no checker holds, if there are enough of them (or one has waited long enough).
    Only lane builds get holdouts: a ticket a seat runs itself (role ops, audit) is reviewed another way."""
    ids = [f["id"] for f in features() if status_of(f, st) == "merged" and f.get("role", "build") == "build"
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


DROPS_Q = ('query($owner:String!,$name:String!){repository(owner:$owner,name:$name){pullRequests(states:OPEN,first:100)'
           '{nodes{number timelineItems(last:1,itemTypes:[ADDED_TO_MERGE_QUEUE_EVENT,REMOVED_FROM_MERGE_QUEUE_EVENT])'
           '{nodes{__typename ... on RemovedFromMergeQueueEvent{createdAt reason}}}}}}}')


def queue_drops():
    """Open PRs the merge queue last removed without merging them: {number: (when, reason)}. A PR's own `check` is
    only CI's fast part (ci.yml), so a failure in the full suite shows up here, not on the PR."""
    code, out = sh(["gh", "api", "graphql", "-F", "owner={owner}", "-F", "name={repo}", "-f", f"query={DROPS_Q}"])
    try:
        nodes = json.loads(out)["data"]["repository"]["pullRequests"]["nodes"]
    except (ValueError, KeyError, TypeError):
        return {}
    drops = {}
    for p in nodes or []:
        last = ((p.get("timelineItems") or {}).get("nodes") or [None])[-1] or {}
        if last.get("__typename") == "RemovedFromMergeQueueEvent" and (last.get("reason") or "").lower() != "merged":
            drops[p["number"]] = (last.get("createdAt") or "", last.get("reason") or "no reason given")
    return drops


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
        reviewing = {branch_of(f["id"], st["features"].get(f["id"], {})): f for f in features()
                     if status_of(f, st) == "review"}
        code, out = sh(["gh", "pr", "list", "--state", "open", "--limit", "100",
                        "--json", "headRefName,headRefOid,number,statusCheckRollup,mergeable,labels"])
        open_prs = json.loads(out) if code == 0 else []
        dropped = []
        drops = queue_drops() if open_prs else {}
        for p in open_prs:  # once per removal: the PR is green on its own but failed (or was pulled) in the queue
            if p["number"] not in drops:
                continue
            when, why = drops[p["number"]]
            fid = checking.get(p["headRefName"])
            f = reviewing.get(p["headRefName"])
            rec = st["features"].setdefault(fid or f["id"], {}) if (fid or f) else st.setdefault("qdrops", {}).setdefault(str(p["number"]), {})
            if rec.get("qdrop") == when:
                continue
            rec["qdrop"] = when
            owners = [l["name"].split(":", 1)[1] for l in p.get("labels") or [] if l.get("name", "").startswith("owner:")]
            to = [] if fid else [f.get("held") or "leads"] if f else (owners or [ENV.get("HELD_OWNER", "zero")])
            dropped.append((p["number"], p["headRefName"], why, to))
        red_builds = []
        for p in open_prs:
            bad = any((c.get("conclusion") or c.get("state") or "").upper() in ("FAILURE", "ERROR", "TIMED_OUT")
                      for c in p.get("statusCheckRollup") or [])
            if not bad:
                continue
            fid = checking.get(p["headRefName"])  # a holdout PR whose CI failed: tell OSA once per PR
            if fid and st["features"][fid].get("hfail") != p["number"]:
                st["features"][fid]["hfail"] = p["number"]
                failed.append((fid, p["number"]))
            f = reviewing.get(p["headRefName"])  # a builder's PR whose CI failed: once per head commit
            if f and st["features"].setdefault(f["id"], {}).get("cifail") != p.get("headRefOid"):
                st["features"][f["id"]]["cifail"] = p.get("headRefOid")
                red_builds.append((f["id"], p["number"], f.get("held") or "leads"))
        write_json(STATE, st)
    if failed or red_builds or dropped:
        from msg import send
        for pr, head, why, to in dropped:
            text = (f"PR #{pr} ({head}) was dropped from the merge queue: {why}. Its PR check is only CI's fast part; "
                    "read the queue's merge_group run (the full suite), fix it on the branch, then queue it again.")
            for who in ["osa", *to]:
                send(who, text, "lane")
        for fid, pr in failed:
            send("osa", f"{fid}: holdout PR #{pr} CI failed. A broken test is the checker's to fix; "
                        f"if the feature is wrong, kit/plan.py reopen {fid}.", "lane")
        for fid, pr, lead in red_builds:  # it can't merge, and its lane has moved on: someone must decide
            text = (f"{fid}: builder PR #{pr} is red in CI and won't merge. Read the failure, then fix it on the "
                    f"branch or kit/plan.py reopen {fid}.")
            send("osa", text, "lane")
            send(lead, text, "lane")
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


def held_touches(touches):
    """Touches a PR may change that PROTECT_MERGE holds for a lead. A folder counts when it holds a protected path."""
    globs = words(ENV.get("PROTECT_MERGE", ""))
    return [t for t in touches if isinstance(t, str)
            and (glob_hit(t, globs) or (t.endswith("/") and any(g.startswith(t) for g in globs)))]


PLAN_STATUSES = ("ready", "review", "superseded")  # what an entry may say; lane progress lives in state.json
FEATURE_CODE = ("src/ui/", "src/components/", "src/app/")  # screens and pages: lane tickets, never a lead's fix


def feature_code(touch):
    return touch.startswith(FEATURE_CODE) and not touch.startswith("src/app/api/")


def lint(path):
    """Problems in a features file: what CI checks on a plan change, before a lane trips on it."""
    try:
        fs = json.loads(path.read_text())["features"]
    except (OSError, ValueError, KeyError, TypeError) as e:
        return [f"{path}: not a features file ({e.__class__.__name__}: {e})"]
    if not isinstance(fs, list):
        return [f"{path}: \"features\" must be a list"]
    probs, ids = [], set()
    for n, f in enumerate(fs):
        fid = f.get("id") if isinstance(f, dict) else None
        if not isinstance(fid, str) or not fid.strip():
            probs.append(f"feature #{n + 1}: needs a string id")
            continue
        if fid in ids:
            probs.append(f"{fid}: duplicate id")
        ids.add(fid)
        for key in ("deps", "touches", "checks"):
            if not isinstance(f.get(key, []), list):
                probs.append(f"{fid}: {key} must be a list")
        held = held_touches(f.get("touches") if isinstance(f.get("touches"), list) else [])
        leads = words(ENV.get("LEADS", ""))
        if held and f.get("held") not in leads:
            probs.append(f"{fid}: touches {', '.join(held[:3])} (PROTECT_MERGE), so it needs \"held\": one of {', '.join(leads)}")
        elif not held and f.get("held"):
            probs.append(f"{fid}: \"held\" is set but no touch is in PROTECT_MERGE")
        status = f.get("status", "ready")
        if status not in PLAN_STATUSES:
            probs.append(f"{fid}: status \"{status}\" isn't one of {', '.join(PLAN_STATUSES)}")
        elif status == "review":  # a lead's small fix, in the same PR as its entry
            touches = f.get("touches") if isinstance(f.get("touches"), list) else []
            if not f.get("checks"):
                probs.append(f"{fid}: a review entry needs real checks: the checker writes its holdouts from them")
            if code := [t for t in touches if feature_code(t)]:
                probs.append(f"{fid}: touches {', '.join(code[:3])}, which is feature code: make it a ready entry for a lane")
    deps = {}
    for f in fs:
        if isinstance(f, dict) and isinstance(f.get("id"), str) and isinstance(f.get("deps", []), list):
            deps.setdefault(f["id"], []).extend(f.get("deps") or [])
    for fid, ds in deps.items():
        probs += [f"{fid}: depends on unknown {d}" for d in ds if d not in ids]

    def cycle(fid, path_):
        if fid in path_:
            return path_[path_.index(fid):] + [fid]
        for d in deps.get(fid, []):
            if c := cycle(d, path_ + [fid]):
                return c
        return None
    seen = set()
    for fid in deps:
        c = cycle(fid, [])
        if c and frozenset(c) not in seen:
            seen.add(frozenset(c))
            probs.append("dependency cycle: " + " → ".join(c))
    return probs


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
    if cmd in ("set", "reopen") and len(a) >= 2 and a[1] not in {f.get("id") for f in features()}:
        # A typo or a flag ("reopen --help") must not create a feature in the lane state.
        print(f"{cmd}: no feature {a[1]!r} in plan/features.json (pull main if it's new)", file=sys.stderr)
        return 2
    if cmd == "set" and len(a) >= 3:
        hbranch = os.environ.get("AVEL_BRANCH") if a[2] == "checking" else None
        set_status(a[1], a[2], pr=arg(a, "--pr"), cost=arg(a, "--cost"),
                   session=arg(a, "--session"), note=arg(a, "--note"), hbranch=hbranch)
    elif cmd == "reopen" and len(a) >= 2:
        s = state()["features"].get(a[1], {})
        note = arg(a, "--note", "holdout failed")
        set_status(a[1], "needs_checks", note=note, attempts=0, session="",
                   round=s.get("round", 0) + 1, reopened_from=s.get("pr") or 0)
        from msg import send
        send("leads", f"{a[1]} reopened by its holdout ({note}); no lane claims it yet. Write the "
             f"failing case into its checks (plan/holdouts/{a[1]}.*), then kit/plan.py set {a[1]} ready.", "lane")
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
    elif cmd == "lint":
        # This checkout's plan (a lead's worktree, CI), not the shared one in the main checkout.
        here = Path(sh(["git", "rev-parse", "--show-toplevel"])[1].strip() or ".")
        f = here / "plan" / "features.json" if len(a) < 2 else Path(a[1])
        if not f.exists():
            print(f"lint: no {f}, nothing to check")
            return 0
        probs = lint(f)
        print("\n".join(probs) or f"lint: {f} ok")
        return 1 if probs else 0
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
