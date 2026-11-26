"""Kit self-test: python3 kit/tests/test_kit.py. Builds a throwaway repo with a fake `claude` and `gh`."""
import json, os, shutil, subprocess, sys, tempfile, textwrap, unittest
from pathlib import Path

KIT = Path(__file__).resolve().parent.parent
FEATURES = {"features": [
    {"id": "A", "title": "first", "deps": [], "touches": ["src/a/"], "checks": []},
    {"id": "B", "title": "same folder", "deps": [], "touches": ["src/a/b.ts"], "checks": []},
    {"id": "C", "title": "after A", "deps": ["A"], "touches": ["src/c.ts"], "checks": []},
    {"id": "D", "title": "real data", "deps": [], "touches": ["x"], "where": "local", "checks": []},
    {"id": "E", "title": "ops only", "role": "ops", "deps": [], "touches": [], "checks": []},
]}
FAKE_CLAUDE = """#!/usr/bin/env bash
if [ -n "$HANG_ONCE" ] && [[ " $* " != *" --resume "* ]]; then
  echo '{"type":"system","subtype":"init","session_id":"s-hung"}'
  sleep 300 & echo $! > "$HANG_ONCE"; wait; exit 1
fi
if [ -n "$AVEL_PROBE" ]; then
  [ -n "$FAKE_LOGIN_FAIL" ] && { echo '{"type":"result","is_error":true,"result":"Not logged in","total_cost_usd":0}'; exit 1; }
  echo '{"type":"result","is_error":false,"result":"ok","total_cost_usd":0.001}'; exit 0
fi
if [ -n "$FAKE_ERR_TEXT" ]; then
  printf '{"type":"result","subtype":"error_max_turns","is_error":true,"result":"%s","session_id":"s-e","total_cost_usd":0.5}\\n' "$FAKE_ERR_TEXT"; exit 1
fi
if [ -n "$FAKE_LOGIN_FAIL" ]; then
  echo '{"type":"result","subtype":"success","is_error":false,"result":"Not logged in · Please run /login","total_cost_usd":0}'; exit 1
fi
if [ "$AVEL_KIND" = check ]; then  # holdouts already on main pass: nothing to commit
  python3 kit/plan.py set A checking
  echo '{"type":"result","subtype":"success","is_error":false,"session_id":"s-c","total_cost_usd":0.1}'; exit 0
fi
mkdir -p plan/reports src && echo "$AVEL_FEATURE" > "src/$AVEL_FEATURE.txt"
printf 'status: done\\n' > "plan/reports/$AVEL_FEATURE.md"
git add -A && git commit -qm "feat $AVEL_FEATURE" && git push -q -u origin "$AVEL_BRANCH"
echo '{"type":"result","subtype":"success","is_error":false,"session_id":"s-1","total_cost_usd":0.42}'
"""
FAKE_GH = """#!/usr/bin/env bash
case "$1 $2" in
  "pr view") [ -n "$GH_NO_PR" ] && { echo "no pull requests found" >&2; exit 1; }; echo '{"number":7,"state":"OPEN"}';;
  "pr merge") echo "merge $*" >> "$GH_LOG"; [ -z "$GH_MERGE_FAIL" ] || { echo "auto-merge is not allowed" >&2; exit 1; };;
  "api repos/{owner}/{repo}/branches/main/protection") [ "$GH_REQ" = 404 ] && { echo '{"message":"Not Found","status":"404"}'; exit 1; }; echo "${GH_REQ-check}";;
  "api repos/{owner}/{repo}/rules/branches/main") echo "";;
  "api repos/{owner}/{repo}") echo "${GH_AUTOMERGE-true}";;
  "api -X") git push -q origin --delete "${4#*/heads/}" 2>/dev/null;;
  "pr list") case "$*" in *open*) echo "${GH_OPEN:-[]}";; *) echo "${GH_MERGED:-[]}";; esac;;
  "issue comment") echo "comment $*" >> "$GH_LOG";;
  "issue view") case "$*" in *state*) echo OPEN; exit 0;; esac; echo '{"comments":[{"createdAt":"2026-11-22T10:00:00Z","body":"[to:osa][from:soap][id:abc123] hi from miosa"}]}';;
esac
"""


KIT_KEYS = {line.split("=", 1)[0].strip() for line in (KIT / "project.env").read_text().splitlines()
            if "=" in line and not line.lstrip().startswith("#")} | {
            "PROJECT", "LEADS", "BUILDERS", "CHECKERS", "OPS", "MSG_BACKEND", "OPS_ISSUE", "PROTECT_WRITE",
            "PROTECT_MERGE", "MAX_ATTEMPTS", "LANE_WAIT_MAX_MIN", "WATCHDOG_SILENT_MIN", "LANES_ON", "CHECK_MIN",
            "CHECK_WAIT_MIN"}
FAKE_TMUX = """#!/usr/bin/env bash
[ "$1" = info ] && exit 1   # no server running yet
env > "$TMUX_ENV_LOG"
"""


def run(args, cwd, env=None, inp=None):
    return subprocess.run(args, cwd=cwd, env=env, input=inp, capture_output=True, text=True)


class Kit(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        remote, self.repo, bin_ = self.tmp / "remote.git", self.tmp / "repo", self.tmp / "bin"
        run(["git", "init", "-q", "--bare", "-b", "main", str(remote)], self.tmp)
        run(["git", "clone", "-q", str(remote), str(self.repo)], self.tmp)
        shutil.copytree(KIT, self.repo / "kit", ignore=shutil.ignore_patterns("tests", "__pycache__"))
        (self.repo / "kit" / "project.env").write_text(textwrap.dedent("""\
            PROJECT=t
            LEADS="axis zero"
            BUILDERS="soap fantem"
            CHECKERS="rigg fenn"
            OPS="atlas"
            MSG_BACKEND=fs
            OPS_ISSUE=
            PROTECT_WRITE="plan/features.json kit/*"
            PROTECT_MERGE="prisma/schema.prisma"
            MAX_ATTEMPTS=2
            LANE_WAIT_MAX_MIN=0
            WATCHDOG_SILENT_MIN=15
            LANES_ON=
            CHECK_MIN=1
            CHECK_WAIT_MIN=30
            SHARED_TOUCHES=
            """))
        (self.repo / "plan").mkdir()
        (self.repo / "plan" / "features.json").write_text(json.dumps(FEATURES))
        for c in (["config", "user.email", "t@t"], ["config", "user.name", "t"], ["add", "-A"],
                  ["commit", "-qm", "init"], ["push", "-q", "origin", "main"]):
            run(["git", *c], self.repo)
        bin_.mkdir()
        for name, body in (("claude", FAKE_CLAUDE), ("gh", FAKE_GH)):
            (bin_ / name).write_text(body)
            (bin_ / name).chmod(0o755)
        # Hermetic: a seat's environment can carry project.env keys (CHECK_MIN, OPS_ISSUE…), which would override
        # the test repo's project.env.
        self.env = {k: v for k, v in os.environ.items() if not k.startswith("AVEL_") and k not in KIT_KEYS}
        self.env.update(PATH=f"{bin_}:{os.environ['PATH']}", GH_LOG=str(self.tmp / "gh.log"))

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def kit(self, script, *args, env=None, inp=None):
        return run([sys.executable, f"kit/{script}", *args], self.repo, {**self.env, **(env or {})}, inp)

    def test_claim_respects_deps_touches_where_role_attempts(self):
        self.assertEqual(self.kit("plan.py", "claim", "--agent", "soap").stdout.strip(), "A")
        r = self.kit("plan.py", "claim", "--agent", "fantem", env={"AVEL_HOST": "miosa"})
        self.assertEqual(r.returncode, 1, r.stdout)  # B clashes with A's folder, C waits on A, D is local-only
        self.assertEqual(self.kit("plan.py", "claim", "--agent", "fantem").stdout.strip(), "D")  # laptop may take D
        self.kit("plan.py", "set", "A", "merged")
        self.assertEqual(self.kit("plan.py", "claim", "--agent", "fantem").stdout.strip(), "B")
        self.assertEqual(self.kit("plan.py", "claim", "--agent", "soap").stdout.strip(), "C")
        for _ in range(2):  # two failed attempts on B, then it's stuck, not retried
            self.kit("plan.py", "set", "B", "ready")
            self.kit("plan.py", "claim", "--agent", "fantem")
        self.kit("plan.py", "set", "B", "ready")
        self.kit("plan.py", "claim", "--agent", "fantem")
        self.assertIn("B          stuck", self.kit("plan.py", "board").stdout)

    def test_shared_touches_never_block_a_claim(self):
        (self.repo / "plan" / "features.json").write_text(json.dumps({"features": [
            {"id": "P", "title": "one", "deps": [], "touches": ["src/hot.js", "src/p.ts"], "checks": []},
            {"id": "Q", "title": "two", "deps": [], "touches": ["src/hot.js", "src/q.ts"], "checks": []},
            {"id": "R", "title": "clash", "deps": [], "touches": ["src/hot.js", "src/p.ts"], "checks": []},
        ]}))
        env = {"SHARED_TOUCHES": "src/hot.js"}
        self.assertEqual(self.kit("plan.py", "claim", "--agent", "soap", env=env).stdout.strip(), "P")
        self.assertEqual(self.kit("plan.py", "claim", "--agent", "fantem", env=env).stdout.strip(), "Q")
        self.assertEqual(self.kit("plan.py", "claim", "--agent", "kade", env=env).returncode, 1)  # R shares p.ts

    def test_real_data_feature_never_claimed_on_miosa(self):
        for i in "ABC":
            self.kit("plan.py", "set", i, "merged")
        r = self.kit("plan.py", "claim", "--agent", "soap", env={"AVEL_HOST": "miosa"})
        self.assertEqual(r.returncode, 1, r.stdout)

    def test_lanes_claim_only_on_the_lanes_host(self):
        r = self.kit("plan.py", "claim", "--agent", "soap", env={"LANES_ON": "miosa"})
        self.assertEqual((r.returncode, r.stdout.strip()), (1, ""), r.stderr)
        r = self.kit("plan.py", "claim", "--agent", "rigg", "--role", "check", env={"LANES_ON": "miosa"})
        self.assertEqual(r.returncode, 1)
        r = self.kit("plan.py", "claim", "--agent", "soap", env={"LANES_ON": "miosa", "AVEL_HOST": "miosa"})
        self.assertEqual(r.stdout.strip(), "A")

    def test_checker_waits_for_a_batch_or_the_oldest_to_age(self):
        gate = {"CHECK_MIN": "3", "CHECK_WAIT_MIN": "30"}
        self.kit("plan.py", "set", "A", "merged")
        self.assertEqual(self.kit("plan.py", "claim", "--agent", "rigg", "--role", "check", env=gate).returncode, 1)
        self.assertEqual(self.kit("plan.py", "ready", env=gate).stdout.split()[1], "0")  # the guard won't wake rigg
        self.assertEqual(self.kit("plan.py", "claim", "--agent", "rigg", "--role", "check",
                                  env={**gate, "CHECK_WAIT_MIN": "0"}).stdout.strip(), "A")  # waited long enough
        for st in ("ready", "merged"):  # back in the queue, as check_batch does when a batch settles nothing
            self.kit("plan.py", "set", "A", st)
        for i in "BC":
            self.kit("plan.py", "set", i, "merged")
        self.assertEqual(self.kit("plan.py", "claim", "--agent", "rigg", "--role", "check", env=gate).stdout.split(),
                         ["A", "B", "C"])

    def test_drain_any_host_export_merge_in(self):
        (self.repo / ".git" / "avel").mkdir(exist_ok=True)
        (self.repo / ".git" / "avel" / "drain").touch()
        self.assertEqual(self.kit("plan.py", "claim", "--agent", "soap").returncode, 1)
        self.assertEqual(self.kit("plan.py", "claim", "--agent", "proof", "--any-host",
                                  env={"LANES_ON": "miosa"}).stdout.strip(), "A")
        rec = json.loads(self.kit("plan.py", "export", "A").stdout)
        self.assertEqual(rec["A"]["owner"], "proof")
        rec["A"].update(status="review", pr=40)
        self.kit("plan.py", "merge-in", inp=json.dumps(rec))
        self.assertIn("A          review", self.kit("plan.py", "board").stdout)

    def test_login_failure_stops_the_lane_without_using_an_attempt(self):
        r = self.kit("lane.py", "--agent", "soap", "--once", env={"FAKE_LOGIN_FAIL": "1"})
        self.assertEqual(r.returncode, 3, r.stdout + r.stderr)
        st = json.loads(run(["cat", ".git/avel/state.json"], self.repo).stdout)["features"]["A"]
        self.assertEqual((st["status"], st["attempts"]), ("ready", 0))
        self.assertIn("lane STOPPED", self.kit("msg.py", "inbox", "osa").stdout)
        lane = json.loads((self.repo / ".git" / "avel" / "lanes" / "soap.json").read_text())
        self.assertEqual(lane["state"], "stopped")

    def test_a_features_own_auth_words_never_stop_the_lane(self):
        r = self.kit("lane.py", "--agent", "soap", "--once",
                     env={"FAKE_ERR_TEXT": "authentication: OAuth credentials step left; ran out of turns"})
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        st = json.loads(run(["cat", ".git/avel/state.json"], self.repo).stdout)["features"]["A"]
        self.assertEqual((st["status"], st["attempts"]), ("ready", 1))  # an ordinary retry, attempt counted
        self.assertNotIn("lane STOPPED", self.kit("msg.py", "inbox", "osa").stdout)

    def test_checker_with_nothing_to_commit_sets_checked(self):
        (self.repo / "tests" / "holdout").mkdir(parents=True)
        (self.repo / "tests" / "holdout" / "A.test.ts").write_text("// holdout for A, already on main\n")
        for c in (["add", "-A"], ["commit", "-qm", "holdout A"], ["push", "-q", "origin", "main"]):
            run(["git", *c], self.repo)
        self.kit("plan.py", "set", "A", "merged")
        r = self.kit("lane.py", "--agent", "rigg", "--role", "check", "--once", env={"GH_NO_PR": "1"})
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        st = json.loads(run(["cat", ".git/avel/state.json"], self.repo).stdout)["features"]["A"]
        self.assertEqual(st["status"], "checked")
        self.assertIn("holdouts on main pass", st["notes"])
        self.assertEqual(self.kit("plan.py", "claim", "--agent", "rigg", "--role", "check").returncode, 1)  # no re-check

    def test_checker_with_nothing_to_commit_and_no_holdout_is_not_checked(self):
        self.kit("plan.py", "set", "A", "merged")  # no tests/holdout/A.* on main: a missing check, not a pass
        r = self.kit("lane.py", "--agent", "rigg", "--role", "check", "--once", env={"GH_NO_PR": "1"})
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        st = json.loads(run(["cat", ".git/avel/state.json"], self.repo).stdout)["features"]["A"]
        self.assertEqual(st["status"], "merged")

    def test_watch_alerts_osa_once_for_a_lane_idle_with_ready_work(self):
        lanes = self.repo / ".git" / "avel" / "lanes"
        lanes.mkdir(parents=True, exist_ok=True)
        (lanes / "soap.json").write_text(json.dumps({"state": "idle", "since": int(__import__("time").time()) - 600}))
        (lanes / "fantem.json").write_text(json.dumps({"state": "busy", "since": 0}))
        for _ in range(2):
            self.kit("watch.py", "--lanes")
        inbox = self.kit("msg.py", "inbox", "osa").stdout
        self.assertEqual(inbox.count("soap: idle 10 min"), 1, inbox)
        self.assertNotIn("fantem", inbox)

    def test_check_batch_and_reopen(self):
        self.kit("plan.py", "set", "A", "merged")
        self.assertEqual(self.kit("plan.py", "claim", "--agent", "rigg", "--role", "check").stdout.strip(), "A")
        self.assertEqual(self.kit("plan.py", "claim", "--agent", "fenn", "--role", "check").returncode, 1)
        self.kit("plan.py", "reopen", "A", "--note", "holdout 2 fails")
        shown = json.loads(self.kit("plan.py", "show", "A").stdout)
        self.assertEqual(shown["notes"], ["holdout 2 fails"])

    def test_red_builder_pr_tells_osa_and_leads_once_per_head(self):
        self.kit("plan.py", "set", "A", "review", "--pr", "9")
        red = lambda sha: json.dumps([{"headRefName": "f/A", "headRefOid": sha, "number": 9,
                                       "statusCheckRollup": [{"name": "check", "conclusion": "FAILURE"}]}])
        for _ in range(2):  # same head: told once
            self.kit("plan.py", "refresh", env={"GH_OPEN": red("aaa")})
        self.assertEqual(self.kit("msg.py", "inbox", "osa").stdout.count("A: builder PR #9 is red"), 1)
        self.assertEqual(self.kit("msg.py", "inbox", "axis").stdout.count("A: builder PR #9 is red"), 1)  # leads
        self.kit("plan.py", "refresh", env={"GH_OPEN": red("bbb")})  # a new push that's still red: told again
        self.assertEqual(self.kit("msg.py", "inbox", "osa").stdout.count("A: builder PR #9 is red"), 1)
        green = json.dumps([{"headRefName": "f/A", "headRefOid": "ccc", "number": 9,
                             "statusCheckRollup": [{"name": "check", "conclusion": "SUCCESS"}]}])
        self.kit("plan.py", "refresh", env={"GH_OPEN": green})
        self.assertIn("no new messages", self.kit("msg.py", "inbox", "osa").stdout)
        self.assertIn("A          review", self.kit("plan.py", "board").stdout)

    def test_checked_only_after_holdout_pr_merges(self):
        self.kit("plan.py", "set", "A", "merged")
        self.kit("plan.py", "set", "A", "checking", env={"AVEL_BRANCH": "h/rigg-1"})
        self.assertEqual(self.kit("plan.py", "claim", "--agent", "soap").stdout.strip(), "B")
        self.assertEqual(self.kit("plan.py", "claim", "--agent", "fantem").stdout.strip(), "C")  # checking counts as done
        failing = json.dumps([{"headRefName": "h/rigg-1", "number": 9,
                               "statusCheckRollup": [{"name": "check", "conclusion": "FAILURE"}]}])
        for _ in range(2):  # CI failed: still checking, OSA told once
            self.kit("plan.py", "refresh", env={"GH_OPEN": failing})
        self.assertIn("A          checking", self.kit("plan.py", "board").stdout)
        self.assertEqual(self.kit("msg.py", "inbox", "osa").stdout.count("holdout PR #9 CI failed"), 1)
        self.kit("plan.py", "refresh", env={"GH_MERGED": json.dumps([{"headRefName": "h/rigg-1", "number": 9}])})
        self.assertIn("A          checked", self.kit("plan.py", "board").stdout)

    def test_reopen_survives_refresh(self):
        old = json.dumps([{"headRefName": "f/A", "number": 7}])
        self.kit("plan.py", "refresh", env={"GH_MERGED": old})
        self.kit("plan.py", "reopen", "A", "--note", "holdout 1 fails")
        self.kit("plan.py", "refresh", env={"GH_MERGED": old})  # the old PR must not flip it back
        self.assertIn("A          ready", self.kit("plan.py", "board").stdout)
        r = self.kit("lane.py", "--agent", "soap", "--once")
        self.assertIn("f/A-r1", run(["git", "ls-remote", "origin"], self.repo).stdout, r.stdout + r.stderr)
        new = json.dumps([{"headRefName": "f/A", "number": 7}, {"headRefName": "f/A-r1", "number": 12}])
        self.kit("plan.py", "refresh", env={"GH_MERGED": new})
        st = json.loads(run(["cat", ".git/avel/state.json"], self.repo).stdout)["features"]["A"]
        self.assertEqual((st["status"], st["pr"], st["round"]), ("merged", 12, 1))

    def push_branch(self, name, path, text, base="main"):
        run(["git", "checkout", "-q", "-B", name, f"origin/{base}" if base != "main" else "main"], self.repo)
        (self.repo / path).parent.mkdir(parents=True, exist_ok=True)
        with open(self.repo / path, "a") as fh:
            fh.write(text + "\n")
        for c in (["add", "-A"], ["commit", "-qm", f"{name} {path}"], ["push", "-q", "-f", "origin", f"{name}:{name}"]):
            run(["git", *c], self.repo)
        run(["git", "checkout", "-q", "main"], self.repo)

    def test_refresh_heals_conflicting_lane_prs(self):
        for path in ("CHANGES.md", "src/x.txt", "prisma/schema.prisma"):
            (self.repo / path).parent.mkdir(parents=True, exist_ok=True)
            (self.repo / path).write_text("base\n")
        (self.repo / ".gitattributes").write_text("CHANGES.md merge=union\n")
        for c in (["add", "-A"], ["commit", "-qm", "base"], ["push", "-q", "origin", "main"]):
            run(["git", *c], self.repo)
        self.push_branch("f/A", "CHANGES.md", "from A")            # union file: heals
        self.push_branch("f/B", "src/x.txt", "from B")              # same line as main: real conflict
        self.push_branch("f/C", "prisma/schema.prisma", "from C")   # protected file on both sides: a lead
        self.push_branch("plan/y", "CHANGES.md", "from plan")       # a lead's PR, union file only: heals
        self.push_branch("plan/z", "src/x.txt", "from plan z")      # a lead's PR, real overlap: theirs
        for path in ("CHANGES.md", "src/x.txt", "prisma/schema.prisma"):
            with open(self.repo / path, "a") as fh:
                fh.write("from main\n")
        for c in (["add", "-A"], ["commit", "-qm", "main moves"], ["push", "-q", "origin", "main"]):
            run(["git", *c], self.repo)
        tips = {b: run(["git", "rev-parse", f"origin/{b}"], self.repo).stdout for b in ("f/B", "f/C", "plan/z")}
        dirty = json.dumps([{"headRefName": b, "number": n, "mergeable": "CONFLICTING"}
                            for b, n in (("f/A", 7), ("f/B", 8), ("f/C", 9), ("plan/x", 10), ("plan/y", 11),
                                         ("plan/z", 12))])
        self.kit("plan.py", "refresh", env={"GH_OPEN": dirty})
        run(["git", "fetch", "-q", "origin"], self.repo)
        self.assertEqual(run(["git", "merge-base", "--is-ancestor", "origin/main", "origin/f/A"], self.repo).returncode, 0)
        self.assertEqual(run(["git", "merge-base", "--is-ancestor", "origin/main", "origin/plan/y"], self.repo).returncode, 0)
        for b in ("f/B", "f/C", "plan/z"):
            self.assertEqual(run(["git", "rev-parse", f"origin/{b}"], self.repo).stdout, tips[b])
        leads = self.kit("msg.py", "inbox", "axis").stdout
        self.assertNotIn("PR #12", leads)
        self.assertIn("PR #8 (f/B) has a real conflict", leads)
        self.assertIn("PR #9 (f/C) conflicts with main in protected files: prisma/schema.prisma", leads)
        self.assertIn("PR #7 (f/A) conflicted with main: merged main in", self.kit("msg.py", "inbox", "osa").stdout)
        self.kit("plan.py", "refresh", env={"GH_OPEN": dirty})  # same heads: not retried, no new messages
        self.assertIn("no new messages", self.kit("msg.py", "inbox", "axis").stdout)

    def test_auto_merge_failure_tells_osa(self):
        r = self.kit("lane.py", "--agent", "soap", "--once", env={"GH_MERGE_FAIL": "1"})
        self.assertIn("A: auto-merge on PR #7 failed", self.kit("msg.py", "inbox", "osa").stdout, r.stderr)

    def test_preflight_and_board_pr_line(self):
        (self.repo / ".claude").mkdir()
        (self.repo / ".claude" / "settings.json").write_text('{"attribution": {"commit": "", "pr": ""}}')
        (self.repo / ".gitattributes").write_text("CHANGES.md merge=union\nprogress.md merge=union\n")
        (self.repo / "package.json").write_text("{}")
        with open(self.repo / "kit" / "project.env", "a") as fh:
            fh.write("OPS_ISSUE=1\n")
        r = run(["bash", "kit/preflight.sh"], self.repo, self.env)
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("ok    Claude answers on this host", r.stdout)
        self.assertIn("ok    GitHub takes a push and an API write", r.stdout)
        self.assertNotIn("avel/probe-", run(["git", "ls-remote", "origin"], self.repo).stdout)
        r = run(["bash", "kit/preflight.sh"], self.repo, {**self.env, "FAKE_LOGIN_FAIL": "1"})
        self.assertIn("FAIL  Claude doesn't answer on this host", r.stdout)
        (self.repo / ".git" / "avel" / "drain").touch()
        self.assertIn("FAIL  this host is drained", run(["bash", "kit/preflight.sh"], self.repo, self.env).stdout)
        (self.repo / ".git" / "avel" / "drain").unlink()
        r = run(["bash", "kit/preflight.sh"], self.repo, {**self.env, "GH_AUTOMERGE": "false", "GH_REQ": ""})
        self.assertEqual(r.returncode, 1)
        self.assertIn("FAIL  repo auto-merge is off", r.stdout)
        self.assertIn("2 failed, lanes not started", r.stdout)
        r = run(["bash", "kit/preflight.sh", "--skip-db"], self.repo, {**self.env, "GH_REQ": "404", "AVEL_HOST": "miosa"})
        self.assertEqual(r.returncode, 0, r.stdout)  # in the workspace, protection is checked on the laptop
        today = json.dumps([{"headRefName": "f/A", "number": 7}, {"headRefName": "plan/x", "number": 8}])
        self.assertIn("PRs merged today: 1 feature (f/*), 1 process", self.kit("plan.py", "board", env={"GH_MERGED": today}).stdout)

    def test_seat_keeps_project_env_out_of_tmux(self):
        (self.tmp / "bin" / "tmux").write_text(FAKE_TMUX)
        (self.tmp / "bin" / "tmux").chmod(0o755)
        log = self.tmp / "tmux.env"
        env = {k: v for k, v in self.env.items() if k != "TMUX"}
        r = run(["bash", "kit/seat.sh", "board"], self.repo, {**env, "TMUX_ENV_LOG": str(log), "OPS_ISSUE": "2"})
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        seen = {line.split("=", 1)[0] for line in log.read_text().splitlines()}
        self.assertTrue(seen & {"PATH", "HOME"}, seen)  # the fake tmux ran
        self.assertFalse(seen & {"OPS_ISSUE", "PROJECT", "LEADS", "CHECK_MIN"}, "project.env reached tmux")

    def test_ci_scope(self):
        sys.path.insert(0, str(KIT))
        from ci_scope import scope
        yes = lambda p: True
        full = scope(["src/a.ts", "kit/lane.py"], exists=yes)
        self.assertEqual((full["app"], full["kit"], full["holdout"]), (True, True, False))
        self.assertTrue(scope([], exists=yes)["app"])  # unknown diff: everything
        self.assertTrue(scope(["kit/x.py"], full=True, exists=yes)["app"])  # main always runs everything
        kit = scope(["kit/lane.py"], exists=yes)
        self.assertEqual((kit["app"], kit["kit"], kit["plan"]), (False, True, False))
        plan = scope(["plan/features.json", "plan/reports/A.md"], exists=yes)
        self.assertEqual((plan["app"], plan["plan"], plan["holdout"]), (False, True, False))
        h = scope(["tests/holdout/A.test.ts", "tests/holdout/B.spec.ts", "plan/holdouts/C.test.ts"],
                  exists=lambda p: p != "tests/holdout/gone.test.ts")
        self.assertEqual((h["app"], h["plan"], h["holdout_tests"], h["holdout_specs"]),
                         (False, False, "tests/holdout/A.test.ts", "tests/holdout/B.spec.ts"))
        moved = scope(["tests/holdout/gone.test.ts", "plan/holdouts/gone.test.ts"], exists=lambda p: False)
        self.assertEqual((moved["app"], moved["holdout"]), (False, False))  # parked: nothing to run
        self.assertTrue(scope(["tests/holdout/helpers.ts"], exists=yes)["app"])  # a helper can break any holdout
        out = run([sys.executable, "kit/ci_scope.py"], self.repo, self.env, inp="plan/features.json\n").stdout
        self.assertIn("app=false\n", out)
        self.assertIn("plan=true\n", out)

    def test_plan_lint(self):
        self.assertEqual(self.kit("plan.py", "lint").returncode, 0)
        bad = {"features": [{"id": "A", "deps": ["B"]}, {"id": "B", "deps": ["A"]}, {"id": "A", "deps": ["Z"]},
                            {"title": "no id"}, {"id": "C", "touches": "src/"}]}
        (self.tmp / "bad.json").write_text(json.dumps(bad))
        r = self.kit("plan.py", "lint", str(self.tmp / "bad.json"))
        self.assertEqual(r.returncode, 1)
        for want in ("A: duplicate id", "depends on unknown Z", "feature #4: needs a string id",
                     "C: touches must be a list", "dependency cycle"):
            self.assertIn(want, r.stdout)
        (self.tmp / "broken.json").write_text("{")
        self.assertIn("not a features file", self.kit("plan.py", "lint", str(self.tmp / "broken.json")).stdout)

    def test_guard_one_pass_then_hard_cap(self):
        self.kit("plan.py", "set", "A", "stuck")
        r = run(["bash", "kit/guard.sh", "0", "0"], self.repo, self.env)
        self.assertIn("guard up: lanes soap fantem rigg fenn", r.stdout)
        self.assertIn("EVENT stuck A", r.stdout)
        self.assertIn("CAP hard $0 reached", r.stdout)

    def test_plan_lint_wants_held_for_protected_touches(self):
        fs = {"features": [
            {"id": "H", "touches": ["prisma/schema.prisma"]},                  # held path, no lead named
            {"id": "I", "touches": ["prisma/schema.prisma"], "held": "zero"},  # fine
            {"id": "J", "touches": ["prisma/"], "held": "bob"},                # a folder holding one; bob isn't a lead
            {"id": "K", "touches": ["src/k.ts"], "held": "axis"},              # nothing held here
        ]}
        (self.tmp / "held.json").write_text(json.dumps(fs))
        r = self.kit("plan.py", "lint", str(self.tmp / "held.json"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("H: touches prisma/schema.prisma (PROTECT_MERGE)", r.stdout)
        self.assertNotIn("I:", r.stdout)
        self.assertIn("J: touches prisma/", r.stdout)
        self.assertIn("K: \"held\" is set but no touch is in PROTECT_MERGE", r.stdout)

    def test_fyi_messages_never_make_a_seat_look_frozen(self):
        self.kit("msg.py", "send", "atlas", "FYI #2 is queued", env={"AVEL_AGENT": "axis"})
        self.kit("msg.py", "send", "atlas", "zero: fyi, plan merged", env={"AVEL_AGENT": "zero"})
        code = "import sys; sys.path.insert(0, 'kit'); import msg, watch; print(watch.unread('atlas', msg.read_all()))"
        self.assertEqual(run([sys.executable, "-c", code], self.repo, self.env).stdout.strip(), "0")
        self.kit("msg.py", "send", "atlas", "please merge #3", env={"AVEL_AGENT": "osa"})
        self.assertEqual(run([sys.executable, "-c", code], self.repo, self.env).stdout.strip(), "1")

    def test_messages_groups_cursor_and_gh(self):
        self.kit("msg.py", "send", "builders", "pull main", env={"AVEL_AGENT": "axis"})
        self.kit("msg.py", "send", "osa", "A stuck", env={"AVEL_AGENT": "soap"})
        self.assertIn("pull main", self.kit("msg.py", "inbox", "fantem").stdout)
        self.assertIn("no new messages", self.kit("msg.py", "inbox", "fantem").stdout)
        self.assertNotIn("A stuck", self.kit("msg.py", "inbox", "soap").stdout)
        gh = self.kit("msg.py", "inbox", "osa", env={"MSG_BACKEND": "both", "OPS_ISSUE": "1"}).stdout
        self.assertIn("A stuck", gh)
        self.assertIn("hi from miosa", gh)

    def guard(self, tool, inp, **env):
        payload = json.dumps({"tool_name": tool, "tool_input": inp})
        out = self.kit("hooks/push_guard.py", inp=payload, env=env).stdout
        return "deny" if '"deny"' in out else "allow"

    def test_push_guard(self):
        b = {"AVEL_KIND": "build", "AVEL_BRANCH": "f/A"}
        self.assertEqual(self.guard("Bash", {"command": "git push -u origin f/A"}, **b), "allow")
        self.assertEqual(self.guard("Bash", {"command": "git push origin main"}, **b), "deny")
        self.assertEqual(self.guard("Bash", {"command": "git push --force origin f/A"}, **b), "deny")
        self.assertEqual(self.guard("Bash", {"command": "git add -A && git push origin f/B"}, **b), "deny")
        self.assertEqual(self.guard("Bash", {"command": "gh pr merge 7 --squash"}, **b), "deny")
        self.assertEqual(self.guard("Bash", {"command": "gh pr create --head f/B --fill"}, **b), "deny")
        self.assertEqual(self.guard("Write", {"file_path": str(self.repo / "plan/features.json")}, **b), "deny")
        self.assertEqual(self.guard("Write", {"file_path": str(self.repo / "plan/reports/A.md")}, **b), "allow")
        self.assertEqual(self.guard("Read", {"file_path": str(self.repo / ".env.local")}), "deny")
        self.assertEqual(self.guard("Read", {"file_path": str(self.repo / ".env.example")}), "allow")
        self.assertEqual(self.guard("Bash", {"command": "cat .env"}), "deny")
        self.assertEqual(self.guard("Bash", {"command": "git push origin main"}), "allow")  # Javaris's own seat
        holdout = str(self.repo / "tests/holdout/A.test.ts")  # holdouts are the checkers'
        self.assertEqual(self.guard("Write", {"file_path": holdout}, **b), "deny")
        self.assertEqual(self.guard("Edit", {"file_path": str(self.repo / "plan/holdouts/A.spec.ts")}, **b), "deny")
        self.assertEqual(self.guard("Bash", {"command": "git rm -q plan/holdouts/A.test.ts"}, **b), "deny")
        self.assertEqual(self.guard("Bash", {"command": "echo x > tests/holdout/A.test.ts"}, **b), "deny")
        self.assertEqual(self.guard("Bash", {"command": "pnpm exec vitest run tests/holdout/A.test.ts"}, **b), "allow")
        self.assertEqual(self.guard("Bash", {"command": "cp plan/holdouts/A.test.ts tests/unit/A.test.ts"}, **b), "allow")
        c = {"AVEL_KIND": "check", "AVEL_BRANCH": "h/rigg-1"}
        self.assertEqual(self.guard("Write", {"file_path": holdout}, **c), "allow")
        self.assertEqual(self.guard("Write", {"file_path": str(self.repo / "src/a.ts")}, **c), "deny")  # checkers: holdouts only
        self.assertEqual(self.guard("Write", {"file_path": "/tmp/scratch.txt"}, **c), "allow")
        run(["git", "checkout", "-q", "-b", "h/rigg-1"], self.repo)
        (self.repo / "src").mkdir(exist_ok=True)
        (self.repo / "src" / "a.ts").write_text("x\n")
        run(["git", "add", "-A"], self.repo); run(["git", "commit", "-qm", "app change"], self.repo)
        self.assertEqual(self.guard("Bash", {"command": "git push -u origin h/rigg-1"}, **c), "deny")
        run(["git", "checkout", "-q", "main"], self.repo)

    def test_stuck_fires_on_third_repeat(self):
        p = json.dumps({"tool_name": "Bash", "session_id": "s", "tool_input": {"command": "npm test"},
                        "error": "Exit code 1\nTypeError: x is undefined"})
        outs = [self.kit("hooks/stuck.py", inp=p).stdout for _ in range(3)]
        self.assertEqual(outs[:2], ["", ""])
        self.assertIn("same failure 3 times", outs[2])

    def test_done_check_blocks_twice_then_stops(self):
        (self.repo / "plan" / "reports").mkdir()
        (self.repo / "plan" / "reports" / "A.md").write_text("status: done\n")
        env = {"AVEL_KIND": "build", "AVEL_REPORT": "plan/reports/A.md", "AVEL_FEATURE": "A",
               "AVEL_DONE_CHECK_CMD": "echo boom; false"}
        p = json.dumps({"session_id": "s1"})
        for _ in range(2):
            self.assertIn('"block"', self.kit("hooks/done_check.py", inp=p, env=env).stdout)
        self.assertEqual(self.kit("hooks/done_check.py", inp=p, env=env).stdout, "")
        self.assertIn("stopped (checks failing)", (self.repo / "plan/reports/A.md").read_text())
        self.assertIn("stopped", self.kit("msg.py", "inbox", "osa").stdout)
        chk = {"AVEL_KIND": "check", "AVEL_BRANCH": "h/rigg-1", "AVEL_DONE_CHECK_CMD": "false"}
        self.assertIn('"block"', self.kit("hooks/done_check.py", inp=json.dumps({"session_id": "c1"}), env=chk).stdout)
        env["AVEL_DONE_CHECK_CMD"] = "true"  # passing checks never block
        self.assertEqual(self.kit("hooks/done_check.py", inp=json.dumps({"session_id": "s2"}), env=env).stdout, "")

    def test_lane_builds_merges_and_goes_idle(self):
        r = self.kit("lane.py", "--agent", "soap", "--once")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        st = json.loads(run(["cat", ".git/avel/state.json"], self.repo).stdout)["features"]["A"]
        self.assertEqual((st["status"], st["pr"], st["session"], st["cost_usd"]), ("review", 7, "s-1", 0.42))
        self.assertIn("pr merge 7 --auto", (self.tmp / "gh.log").read_text())  # queued (merge queue or auto-merge)
        self.assertIn("f/A", run(["git", "ls-remote", "origin"], self.repo).stdout)
        merged = json.dumps([{"headRefName": "f/A", "number": 7}])
        r = self.kit("lane.py", "--agent", "soap", "--once", env={"GH_MERGED": merged})
        self.assertIn("B", r.stdout)  # refresh marked A merged; B no longer clashes with it

    def test_watchdog_kills_silent_session_and_resumes(self):
        pidfile = self.tmp / "hung.pid"
        r = self.kit("lane.py", "--agent", "soap", "--once",
                     env={"HANG_ONCE": str(pidfile), "WATCHDOG_SILENT_MIN": "0.02"})
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("resuming s-hung", r.stdout)
        st = json.loads(run(["cat", ".git/avel/state.json"], self.repo).stdout)["features"]["A"]
        self.assertEqual(st["status"], "review")
        self.assertFalse(Path(f"/proc/{pidfile.read_text().strip()}").exists())  # the child died too


if __name__ == "__main__":
    unittest.main(verbosity=1)
