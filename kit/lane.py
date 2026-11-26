#!/usr/bin/env python3
"""kit/lane.py: one headless lane. Claims a feature, builds it in its own worktree,
turns on auto-merge, claims the next. Exits when nothing is ready, so the machine idles
(and a MIOSA workspace can pause) instead of burning credits.

  lane.py --agent soap               builder lane
  lane.py --agent rigg --role check  checker lane: holdouts for merged features, in batches
  lane.py --agent soap --once        one feature, then exit
  lane.py --agent soap --feature F   build F, already reserved (doing), then exit 0 if it reached review

Exit 3 means the lane stopped itself: Claude or GitHub isn't logged in on this host (or a run cost $0).
The feature goes back to ready without using up an attempt. Each lane writes its state
(busy | waiting | idle | stopped) to .git/avel/lanes/<agent>.json; the guard reads that, not the screen.
Lanes on one host never share a test database or a server port: see lane_env().
"""
import hashlib, json, os, re, signal, subprocess, sys, threading, time, zlib
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import avel_dir, git, glob_hit, load_env, report_status, root, sh, words, write_json
import heal, msg, plan

ENV = load_env()
KIT = Path(__file__).resolve().parent
ROOT = root()


def log(agent, text):
    print(f"{time.strftime('%H:%M')} [{agent}] {text}", flush=True)


def lane_state(agent, state, **kw):
    """busy | waiting | idle | stopped, with the time it started. kit/watch.py and the guard read it."""
    d = avel_dir() / "lanes"
    d.mkdir(exist_ok=True)
    write_json(d / f"{agent}.json", {"state": state, "since": int(time.time()), "host": ENV.get("AVEL_HOST", "local"), **kw})


class LaneStop(Exception):
    """This host can't run lanes (a login is missing). Stop, tell OSA, don't burn an attempt."""


# Login failures only: a feature's own words (authentication, credentials, OAuth) must never stop a lane.
AUTH_RE = re.compile(r"not logged in|please run /login|invalid api key|oauth token (has )?expired|"
                     r"OAuth App access restrictions|bad credentials|HTTP 401|gh auth login", re.I)


def auth_failure(res):
    """Why this run proves the host can't work, or None. A $0 run never reached the model."""
    if res.get("subtype") == "watchdog":
        return None
    text = " ".join(str(res.get("result") or "").split())[:160]
    if not res.get("total_cost_usd"):
        return f"run cost $0 ({text or res.get('subtype') or 'no output'})"
    if res.get("is_error") and AUTH_RE.search(text):
        return text
    return None


def worktree(branch, path, reset_to=None):
    """The lane's worktree for branch. A new one gets WT_SETUP_CMD. A reused one (resumed build, the checker's)
    is first reset to reset_to when given, then refreshed: its install and generated code may be from an older
    main (a Prisma client from before a schema change fails typecheck, and lanes can't regenerate it)."""
    excl = ROOT / ".git" / "info" / "exclude"
    if excl.parent.exists() and ".wt/" not in (excl.read_text() if excl.exists() else ""):
        with open(excl, "a") as fh:
            fh.write("\n.wt/\n")
    sh(["git", "fetch", "-q", "origin", "main"], cwd=ROOT)
    if not path.exists():
        exists = git("rev-parse", "--verify", "-q", f"refs/remotes/origin/{branch}", cwd=ROOT)
        start = f"origin/{branch}" if exists else (reset_to or "origin/main")
        sh(["git", "worktree", "add", "-q", "-B", branch, str(path), start], cwd=ROOT, check=True)
        for f in words(ENV.get("WT_COPY", "")):  # dev-only env files, gitignored
            if (ROOT / f).exists() and not (path / f).exists():
                (path / f).write_bytes((ROOT / f).read_bytes())
        setup(path)
        return path
    if reset_to:
        sh("git reset -q --hard && git clean -fdq", cwd=path)
        sh(["git", "checkout", "-q", "-B", branch, reset_to], cwd=path, check=True)
    stamp = setup_stamp(path)
    if not stamp.exists() or stamp.read_text().strip() != setup_key(path):
        setup(path)  # the lockfile changed since this worktree's install (or it predates stamps)
    elif ENV.get("WT_REFRESH_CMD"):
        code, out = sh(ENV["WT_REFRESH_CMD"], cwd=path)
        if code:
            raise RuntimeError(f"refresh failed in {path}: {out[-300:]}")
    return path


def setup_key(path):
    """What an install depends on: the WT_SETUP_KEY files (the lockfile), hashed."""
    h = hashlib.sha256()
    for f in words(ENV.get("WT_SETUP_KEY", "")):
        h.update(f.encode() + b"\0" + ((path / f).read_bytes() if (path / f).is_file() else b"-") + b"\0")
    return h.hexdigest()


def setup_stamp(path):
    # In the shared git dir, not the worktree: `git clean` must not drop it and a lane must never commit it.
    return avel_dir() / "wt" / f"{path.name}.setup"


def setup(path):
    """WT_SETUP_CMD (which also generates code: npm ci runs postinstall), then the stamp it was done for."""
    if ENV.get("WT_SETUP_CMD"):
        code, out = sh(ENV["WT_SETUP_CMD"], cwd=path)
        if code:
            raise RuntimeError(f"setup failed in {path}: {out[-300:]}")
    setup_stamp(path).parent.mkdir(exist_ok=True)
    setup_stamp(path).write_text(setup_key(path) + "\n")


def lane_env(agent):
    """What keeps lanes on one host apart: its own databases and server ports (project.env).
      LANE_DB_VARS    URLs whose database gets the lane's name: mm_e2e_test → mm_e2e_test_soap
      LANE_PORT_VARS  VAR=base pairs; the lane's port is base + its place in BUILDERS CHECKERS
    Returns (env overrides, database names to create)."""
    lanes = words(ENV.get("BUILDERS", "")) + words(ENV.get("CHECKERS", ""))
    n = lanes.index(agent) if agent in lanes else len(lanes) + zlib.crc32(agent.encode()) % 40
    tag = re.sub(r"\W", "_", agent.lower())
    out, dbs = {}, []
    for var in words(ENV.get("LANE_DB_VARS", "")):
        u = urlsplit(os.environ.get(var) or "")
        db = u.path.lstrip("/")
        if not (u.scheme and db):
            continue
        db = db if db.endswith(f"_{tag}") else f"{db}_{tag}"
        out[var] = urlunsplit(u._replace(path=f"/{db}"))
        dbs.append(db)
    for pair in words(ENV.get("LANE_PORT_VARS", "")):
        var, _, base = pair.partition("=")
        if base.isdigit():
            out[var] = str(int(base) + n)
    return out, sorted(set(dbs))


_CREATED = set()


def ensure_dbs(agent, dbs):
    """LANE_DB_CREATE_CMD ({db}) once per database per lane process. "already exists" is fine."""
    cmd = ENV.get("LANE_DB_CREATE_CMD")
    for db in dbs:
        if not cmd or db in _CREATED:
            continue
        code, out = sh(cmd.replace("{db}", db))
        if code and "already exists" not in out:
            log(agent, f"could not create database {db}: {out.strip()[:160]}")
            continue
        _CREATED.add(db)


def claude(agent, role, prompt, cwd, extra_env, session=None):
    """Run one headless session under the watchdog: if it prints nothing for WATCHDOG_SILENT_MIN,
    kill its whole process tree and resume the same session, up to WATCHDOG_RESUMES times."""
    silent = float(ENV.get("WATCHDOG_SILENT_MIN", "15")) * 60
    resumes, cost = int(ENV.get("WATCHDOG_RESUMES", "2")), 0.0
    for n in range(resumes + 1):
        res, hung = run_claude(agent, role, prompt, cwd, extra_env, session, silent)
        cost += res.get("total_cost_usd") or 0
        if not hung or not res.get("session_id") or n == resumes:
            break
        session = res["session_id"]
        log(agent, f"silent {silent / 60:g} min: killed, resuming {session} ({n + 1}/{resumes})")
        prompt = (f"You were stopped after {silent / 60:g} minutes with no output (a hung command). "
                  "Don't rerun it the same way: background long servers, add timeouts. Carry on with the task.")
    if hung:
        label = extra_env.get("AVEL_FEATURE") or agent
        msg.send("osa", f"{label}: silent {silent / 60:g} min after {resumes} resumes; lane moved on.", agent)
    res["total_cost_usd"] = cost
    return res


def tree(pid):
    """pid and all its descendants (Linux /proc), so a killed run leaves no dev server behind."""
    kids = {}
    for d in Path("/proc").glob("[0-9]*"):
        try:
            ppid = int((d / "stat").read_text().rsplit(")", 1)[1].split()[1])
        except (OSError, ValueError, IndexError):
            continue
        kids.setdefault(ppid, []).append(int(d.name))
    out, todo = [], [pid]
    while todo:
        p = todo.pop()
        out.append(p)
        todo += kids.get(p, [])
    return out


def kill_tree(p):
    pids = tree(p.pid)
    for sig in (signal.SIGTERM, signal.SIGKILL):
        for target in [("group", p.pid)] + [("pid", x) for x in pids]:
            try:
                os.killpg(target[1], sig) if target[0] == "group" else os.kill(target[1], sig)
            except (ProcessLookupError, PermissionError):
                pass
        try:
            p.wait(timeout=10)
        except subprocess.TimeoutExpired:
            pass
        time.sleep(1)


def run_claude(agent, role, prompt, cwd, extra_env, session, silent):
    cmd = ["claude", "-p", prompt, "--agent", "builder" if role == "build" else "checker",
           "--append-system-prompt", f"Your name is {agent.capitalize()}.",
           "--max-turns", ENV.get("MAX_TURNS", "100"), "--output-format", "stream-json", "--verbose",
           *words(ENV.get("CLAUDE_FLAGS_MIOSA" if ENV.get("AVEL_HOST") == "miosa" else "CLAUDE_FLAGS",
                          "--permission-mode acceptEdits"))]
    if ENV.get("FEATURE_BUDGET_USD"):
        cmd += ["--max-budget-usd", ENV["FEATURE_BUDGET_USD"]]
    if ENV.get("BUILD_MODEL") and role == "build":
        cmd += ["--model", ENV["BUILD_MODEL"]]
    if ENV.get("CHECK_MODEL") and role == "check":
        cmd += ["--model", ENV["CHECK_MODEL"]]
    if session:
        cmd += ["--resume", session]
    own, dbs = lane_env(agent)
    ensure_dbs(agent, dbs)
    env = {**os.environ, **own, **extra_env, "PATH": f"{KIT}:{os.environ.get('PATH', '')}"}
    p = subprocess.Popen(cmd, cwd=cwd, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                         stderr=subprocess.STDOUT, text=True, start_new_session=True)
    seen = {"t": time.monotonic(), "sid": session, "result": None, "tail": ""}

    def read():
        for line in p.stdout:
            seen["t"] = time.monotonic()
            try:
                ev = json.loads(line)
            except ValueError:
                seen["tail"] = (seen["tail"] + line)[-400:]
                continue
            if isinstance(ev, dict):
                seen["sid"] = ev.get("session_id") or seen["sid"]
                if ev.get("type") == "result":
                    seen["result"] = ev

    reader = threading.Thread(target=read, daemon=True)
    reader.start()
    hung, poll = False, max(0.2, min(5.0, silent / 4))
    while p.poll() is None:
        time.sleep(poll)
        if p.poll() is None and time.monotonic() - seen["t"] > silent:
            hung = True
            kill_tree(p)
            break
    reader.join(timeout=5)
    res = seen["result"] or {"is_error": True, "subtype": "watchdog" if hung else f"exit {p.returncode}",
                             "result": seen["tail"]}
    res.setdefault("session_id", seen["sid"])
    return res, hung


def touched(branch):
    return git("diff", "--name-only", f"origin/main...{branch}", cwd=ROOT).splitlines()


def auto_merge(agent, label, pr, branch, cwd):
    """Turn on auto-merge (with a merge queue on main, this queues the PR); tell OSA if GitHub refuses.
    Then heal a conflict with main. No --delete-branch: from a worktree it tries to check out main locally
    and fails, and the repo deletes merged branches itself.
    A lane's PR is final once its run is done, so a draft (which auto-merge refuses) is marked ready first."""
    sh(["gh", "pr", "ready", str(pr)], cwd=cwd)  # no-op when it isn't a draft
    code, out = sh(["gh", "pr", "merge", str(pr), "--auto"], cwd=cwd)
    if code and "--squash" in out:  # no merge queue on this repo: gh needs a merge method
        code, out = sh(["gh", "pr", "merge", str(pr), "--auto", "--squash"], cwd=cwd)
    if code:
        msg.send("osa", f"{label}: auto-merge on PR #{pr} failed: {out.strip()[:200]}", agent)
    heal.heal_pr(branch, pr, cwd=cwd)
    return code == 0


def build_one(agent, fid):
    f = json.loads(subprocess.run([sys.executable, str(KIT / "plan.py"), "show", fid],
                                  capture_output=True, text=True, cwd=ROOT).stdout)
    st = plan.state()["features"].get(fid, {})
    branch = plan.branch_of(fid, st)
    wt = ROOT / ".wt" / branch[2:]
    report = f"plan/reports/{fid}.md"
    worktree(branch, wt)
    env = {"AVEL_AGENT": agent, "AVEL_KIND": "build", "AVEL_FEATURE": fid,
           "AVEL_BRANCH": branch, "AVEL_REPORT": report}
    if st.get("session") and (wt / ".git").exists():
        prompt = (f"Continue feature {fid}. Your last run ended before the report said done. "
                  f"Notes since then: {f.get('notes') or 'none'}. Finish it the same way.")
        res = claude(agent, "build", prompt, wt, env, st["session"])
    else:
        prompt = (f"Build feature {fid} on branch {branch}.\n\n```json\n{json.dumps(f, indent=2)}\n```\n\n"
                  f"Follow RULES.md and CLAUDE.md. Every check above must pass and be covered by a test. "
                  f"Write {report} (first line `status: done` or `status: stuck`), commit, "
                  f"`git push -u origin {branch}`, then `gh pr create --head {branch} --fill` with the "
                  f"checks and any `amend:` lines in the body. Don't merge.")
        holdouts = sorted(str(p.relative_to(wt)) for p in (wt / "plan" / "holdouts").glob(f"{fid}.*"))
        if st.get("round") and holdouts:
            prompt += (f"\n\nThis is a redo: a holdout reopened it. {', '.join(holdouts)} must pass on your "
                       f"branch. Don't edit it; it is the checker's.")
        res = claude(agent, "build", prompt, wt, env)
    cost, sid = res.get("total_cost_usd", 0), res.get("session_id")
    status = report_status(wt / report)
    code, out = sh(["gh", "pr", "view", branch, "--json", "number,state"], cwd=wt)
    why = auth_failure(res) or (f"gh: {out.strip()[:160]}" if code and AUTH_RE.search(out) else None)
    if why:
        attempts = plan.state()["features"].get(fid, {}).get("attempts", 1)
        plan.set_status(fid, "ready", cost=cost or None, attempts=max(0, attempts - 1),
                        note=f"lane stopped, attempt not counted: {why}")
        raise LaneStop(f"{fid}: {why}")
    pr = json.loads(out).get("number") if code == 0 else None
    if status == "done" and pr:
        held = [p for p in touched(branch) if glob_hit(p, words(ENV.get("PROTECT_MERGE", "")))]
        if held:
            plan.set_status(fid, "hold", pr=pr, cost=cost, session=sid)
            msg.send("leads", f"{fid}: PR #{pr} touches {', '.join(held[:3])}. Review and merge by hand.", agent)
            return "hold"
        auto_merge(agent, fid, pr, branch, wt)
        plan.set_status(fid, "review", pr=pr, cost=cost, session=sid)
        sh(["git", "worktree", "remove", "--force", str(wt)], cwd=ROOT)
        return "review"
    why = res.get("subtype") or status or "no report"
    if status.startswith("stuck") or status.startswith("stopped"):
        plan.set_status(fid, "stuck", cost=cost, session=sid, note=why)
        msg.send("osa", f"{fid}: {status}. Report: {report} on {branch}.", agent)
        return "stuck"
    plan.set_status(fid, "ready", cost=cost, session=sid, note=f"run ended: {why}")
    return "retry"


def check_batch(agent, ids):
    branch = f"h/{agent}-{time.strftime('%m%d%H%M')}"
    wt = worktree(branch, ROOT / ".wt" / f"check-{agent}", reset_to="origin/main")
    feats = [json.loads(subprocess.run([sys.executable, str(KIT / "plan.py"), "show", i],
                                       capture_output=True, text=True, cwd=ROOT).stdout) for i in ids]
    env = {"AVEL_AGENT": agent, "AVEL_KIND": "check", "AVEL_BRANCH": branch}
    prompt = (f"Check these merged features: {', '.join(ids)}.\n\n```json\n{json.dumps(feats, indent=2)}\n```\n\n"
              "Follow your agent file: 1–3 holdout tests per feature, from the checks alone. "
              "Passing holdouts go in tests/holdout/ (<id>.test.ts for Vitest, <id>.spec.ts for Playwright). "
              "For each failing one, move it to plan/holdouts/ (same name) "
              "and run `kit/plan.py reopen <id> --note \"<what fails>\"`. Before you commit, run "
              f"`{ENV.get('TYPECHECK_CMD') or 'the typecheck'}` and your holdout tests, and fix your own errors. "
              "For each feature whose holdouts pass, run `kit/plan.py set <id> checking` "
              "(it becomes checked when your PR merges). "
              f"Commit, `git push -u origin {branch}`, `gh pr create --head {branch} --fill`. Don't merge. "
              "If every holdout a feature needs is already on main and passes, there is nothing to commit for it: "
              "still run `kit/plan.py set <id> checking`, and open no PR if no feature has changes.")
    res = claude(agent, "check", prompt, wt, env)
    code, out = sh(["gh", "pr", "view", branch, "--json", "number"], cwd=wt)
    why = auth_failure(res) or (f"gh: {out.strip()[:160]}" if code and AUTH_RE.search(out) else None)
    if why:
        for i in ids:
            plan.set_status(i, "merged", checker="")
        raise LaneStop(f"{', '.join(ids)}: {why}")
    pr = json.loads(out).get("number") if code == 0 else None
    if pr:
        auto_merge(agent, ", ".join(ids), pr, branch, wt)
    elif (not git("status", "--porcelain", "--untracked-files=no", cwd=wt)
          and not git("status", "--porcelain", "--", "tests/holdout", "plan/holdouts", cwd=wt)
          and git("rev-list", "--count", "origin/main..HEAD", cwd=wt) == "0"):
        # Holdouts already on main pass and nothing changed: no PR to wait for, so checked now (no re-check loop).
        # Only a feature that has a holdout on main: no holdout at all is a missing check, not a pass.
        done = [i for i in ids if plan.state()["features"].get(i, {}).get("status") == "checking"
                and any((wt / "tests" / "holdout").glob(f"{i}.*"))]
        for i in done:
            plan.set_status(i, "checked", note="holdouts on main pass")
        if done:
            msg.send("osa", f"{agent}: {', '.join(done)} checked: holdouts on main pass, no PR needed.", agent)
    for i in ids:  # anything the checker didn't settle, or settled without a PR, goes back to the queue
        if plan.state()["features"].get(i, {}).get("status") in (("merged",) if pr else ("merged", "checking")):
            plan.set_status(i, "merged", checker="")
    msg.send("osa", f"{agent}: holdouts for {', '.join(ids)} in PR #{pr or '?'}, checked once it merges "
                    f"(${res.get('total_cost_usd', 0):.2f}).", agent)
    return "checked"


def in_flight():
    st = plan.state()
    return [f["id"] for f in plan.features() if plan.status_of(f, st) in ("doing", "review")]


PULL_FAILING = set()


def pull_main(agent):
    """Fast-forward the main checkout to origin/main before a claim. A claim from a stale plan can hand out work
    whose deps or touches changed, so a failure is logged, OSA hears once per run of failures, and the lane
    doesn't claim. A bare `git pull` breaks when FETCH_HEAD holds several heads, so name the branch."""
    branch = git("rev-parse", "--abbrev-ref", "HEAD", cwd=ROOT)
    if branch != "main":
        code, out = 1, f"the main checkout is on {branch or '(no branch)'}, not main"
    else:
        code, out = sh(["git", "pull", "-q", "--ff-only", "origin", "main"], cwd=ROOT)
    if not code:
        PULL_FAILING.discard(agent)
        return True
    why = " ".join(out.split())[-200:]
    log(agent, f"can't update the main checkout: {why}")
    if agent not in PULL_FAILING:
        PULL_FAILING.add(agent)
        msg.send("osa", f"{agent}: lane can't update the main checkout, so it isn't claiming: {why}", agent)
    return False


def stop(agent, e):
    log(agent, f"lane stopped: {e}")
    lane_state(agent, "stopped", why=str(e)[:200])
    msg.send("osa", f"{agent}: lane STOPPED on {ENV.get('AVEL_HOST', 'local')}: {str(e)[:200]}. "
                    "Log in on that host, then press Enter in the lane. Attempt not counted.", agent)
    return 3


def main(a):
    agent = a[a.index("--agent") + 1] if "--agent" in a else "lane"
    role = a[a.index("--role") + 1] if "--role" in a else "build"
    once, refreshed = "--once" in a, False
    waited, wait_s = 0, int(ENV.get("LANE_WAIT_S", "60"))
    if "--feature" in a:  # a reserved feature, e.g. the cutover's proof run on a new host
        fid = a[a.index("--feature") + 1]
        lane_state(agent, "busy", feature=fid)
        try:
            outcome = build_one(agent, fid)
        except LaneStop as e:
            return stop(agent, e)
        log(agent, f"{fid} → {outcome}")
        lane_state(agent, "idle")
        return 0 if outcome in ("review", "hold") else 1
    while True:
        if not pull_main(agent):
            if once:
                return 1
            time.sleep(int(ENV.get("LANE_PULL_RETRY_S", "60")))
            continue
        code, out = sh([sys.executable, str(KIT / "plan.py"), "claim", "--agent", agent, "--role", role], cwd=ROOT)
        ids = out.split()
        if code or not ids:
            if not refreshed:
                plan.refresh()
                refreshed = True
                continue
            # Work still in flight may unblock deps soon: wait a little, then go idle.
            if in_flight() and waited < int(ENV.get("LANE_WAIT_MAX_MIN", "20")) * 60:
                if not waited:
                    lane_state(agent, "waiting")
                time.sleep(wait_s)
                waited += wait_s
                refreshed = False
                continue
            log(agent, "nothing ready. Lane idle.")
            lane_state(agent, "idle")
            msg.send("osa", f"{agent}: lane idle, nothing ready for {role}.", agent)
            return 0
        refreshed, waited = False, 0
        log(agent, f"{role}: {' '.join(ids)}")
        lane_state(agent, "busy", feature=" ".join(ids))
        try:
            outcome = build_one(agent, ids[0]) if role == "build" else check_batch(agent, ids)
        except LaneStop as e:
            return stop(agent, e)
        except Exception as e:  # a lane never dies silently
            plan.set_status(ids[0], "stuck", note=str(e)[:300])
            msg.send("osa", f"{ids[0]}: lane error: {str(e)[:200]}", agent)
            outcome = "error"
        log(agent, f"{ids[0]} → {outcome}")
        if once:
            lane_state(agent, "idle")
            return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
