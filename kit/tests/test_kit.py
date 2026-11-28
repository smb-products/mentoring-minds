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
[ -n "$CLAUDE_ENV_LOG" ] && env > "$CLAUDE_ENV_LOG"
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
printf 'status: %s\\n' "${FAKE_REPORT_STATUS:-done}" > "plan/reports/$AVEL_FEATURE.md"
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
  "pr ready") echo "ready $3" >> "$GH_LOG";;
  "api graphql") case "$*" in *timelineItems*) echo "${GH_DROPS:-null}";; *) echo "${GH_QUEUE:-null}";; esac;;
  "issue view") case "$*" in *state*) echo OPEN; exit 0;; esac; [ -n "$GH_COMMENTS" ] && { echo "$GH_COMMENTS"; exit 0; }
    echo '{"comments":[{"createdAt":"2026-11-22T10:00:00Z","body":"[to:osa][from:soap][id:abc123] hi from miosa"}]}';;
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
[ -n "${TMUX_ARGS_LOG:-}" ] && printf '%s\n' "$@" > "$TMUX_ARGS_LOG"
exit 0
"""

FAKE_SEAT_TMUX = """#!/usr/bin/env bash
t=""; prev=""; for a in "$@"; do [ "$prev" = -t ] && t="${a#=}"; prev="$a"; done
case "$1" in
  has-session) exit 0;;
  capture-pane) cat "$PANES/${t#t-}" 2>/dev/null; exit 0;;
  send-keys) echo "$t $*" >> "$KEYS_LOG"; exit 0;;
esac
exit 1
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

    def test_lane_doesnt_claim_when_the_main_checkout_cant_update(self):
        run(["git", "checkout", "-qb", "elsewhere"], self.repo)
        log = self.tmp / "claude.env"
        r = self.kit("lane.py", "--agent", "soap", "--once", env={"CLAUDE_ENV_LOG": str(log)})
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertFalse(log.exists(), "the lane built from a stale checkout")
        self.assertIn("isn't claiming: the main checkout is on elsewhere", self.kit("msg.py", "inbox", "osa").stdout)
        run(["git", "checkout", "-q", "main"], self.repo)
        other = self.tmp / "other"  # main moves on elsewhere; FETCH_HEAD holds several heads, as after others' fetches
        run(["git", "clone", "-q", str(self.tmp / "remote.git"), str(other)], self.tmp)
        run(["git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "newer"], other)
        run(["git", "push", "-q", "origin", "main:main", "main:side"], other)
        run(["git", "fetch", "-q", "origin", "main", "side"], self.repo)
        self.assertEqual(self.kit("lane.py", "--agent", "soap", "--once").returncode, 0)  # back on main: claims
        self.assertEqual(run(["git", "log", "-1", "--format=%s", "main"], self.repo).stdout.strip(), "newer")

    def test_billing_or_usage_limit_mid_run_stops_the_lane_without_using_an_attempt(self):
        for text in ("Claude Code can't use your Claude subscription, usually because a payment is past due",
                     "Claude AI usage limit reached, resets 9pm"):
            run(["rm", "-f", ".git/avel/state.json"], self.repo)
            r = self.kit("lane.py", "--agent", "soap", "--once", env={"FAKE_ERR_TEXT": text})  # cost $0.50: mid-run
            self.assertEqual(r.returncode, 3, text + r.stdout + r.stderr)
            st = json.loads(run(["cat", ".git/avel/state.json"], self.repo).stdout)["features"]["A"]
            self.assertEqual((st["status"], st["attempts"]), ("ready", 0), text)

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

    def test_watch_wakes_the_seat_that_claimed_a_held_pr(self):
        old = "2026-01-01T00:00:00Z"
        pr = lambda n, labels, mergeable="MERGEABLE": {"number": n, "headRefName": f"h/rigg-{n}", "headRefOid": f"sha{n}", "isDraft": False, "mergeable": mergeable,
                                "autoMergeRequest": None, "labels": [{"name": l} for l in labels],
                                "statusCheckRollup": [{"name": "check", "conclusion": "SUCCESS", "completedAt": old}]}
        prs = json.dumps([pr(14, ["owner:axis"]), pr(15, []), pr(16, ["owner:axis"]), pr(17, ["owner:axis"], "CONFLICTING"),
                          pr(18, ["owner:atlas"]), pr(19, ["owner:atlas", "owner:zero"])])
        queue = json.dumps({"data": {"repository": {"mergeQueue": {"entries": {"nodes": [{"pullRequest": {"number": 16}}]}}}}})
        (self.tmp / "bin" / "tmux").write_text("#!/usr/bin/env bash\nexit 0\n")  # every seat is up; never the real tmux
        (self.tmp / "bin" / "tmux").chmod(0o755)
        self.kit("watch.py", "--seats", env={"GH_OPEN": prs, "GH_QUEUE": queue})
        axis, zero = self.kit("msg.py", "inbox", "axis").stdout, self.kit("msg.py", "inbox", "zero").stdout
        self.assertIn("PR #14", axis)
        self.assertNotIn("PR #14", zero)  # claimed by axis: zero isn't woken for it
        self.assertIn("PR #15", zero)     # unclaimed and not in the plan: HELD_OWNER
        self.assertNotIn("PR #16", axis + zero)  # already in the merge queue: waiting on CI, not on a lead
        self.assertNotIn("PR #17", axis + zero)  # conflicts with main: waiting on its author, not a lead to merge
        atlas = self.kit("msg.py", "inbox", "atlas").stdout
        self.assertIn("PR #18", axis)     # ops seat's own PR: it can't merge it, so OPS_REVIEWER (axis) is told
        self.assertNotIn("PR #18", atlas + zero)
        self.assertIn("PR #19", zero)     # a lead claimed the ops seat's PR: that lead
        self.assertNotIn("PR #19", atlas + axis)

    def test_watch_wakes_an_idle_lead_or_ops_seat_with_unread_work(self):
        (self.tmp / "bin" / "tmux").write_text(FAKE_SEAT_TMUX)
        (self.tmp / "bin" / "tmux").chmod(0o755)
        panes, keys = self.tmp / "panes", self.tmp / "keys.log"
        panes.mkdir()
        idle, busy, asking = "some output\n❯ \n", "✻ Working… (esc to interrupt)\n❯ \n", "Do you want to proceed?\n❯ 1. Yes\n"
        for seat, pane in (("axis", idle), ("zero", idle), ("atlas", busy), ("osa", idle)):
            (panes / seat).write_text(pane)
        with open(self.repo / "kit" / "project.env", "a") as fh:
            fh.write("WATCH_WAKE_MIN=0\n")  # wake on the first pass; the real default waits a minute
        env = {"PANES": str(panes), "KEYS_LOG": str(keys)}
        send = lambda to, text, by="osa": self.kit("msg.py", "send", to, text, env={"AVEL_AGENT": by})
        typed = lambda: [l for l in (keys.read_text().splitlines() if keys.exists() else []) if " -l " in l]
        send("axis", "please review #3")
        send("zero", "FYI #2 is queued")
        send("atlas", "please check the domain")
        send("osa", "lane soap idle", by="guard")
        for _ in range(2):
            self.kit("watch.py", "--seats", env=env)
        self.assertEqual(typed(), ["t-axis send-keys -t t-axis -l New message from OSA: run kit/msg.py inbox axis and act on it."])
        # zero has only an FYI, atlas is working, and osa isn't a lead or ops seat: none are typed into.
        (panes / "atlas").write_text(asking)
        self.kit("watch.py", "--seats", env=env)
        self.assertEqual(len(typed()), 1, "typed into a permission prompt")
        (panes / "atlas").write_text(idle)
        self.kit("watch.py", "--seats", env=env)
        self.assertIn("New message from OSA: run kit/msg.py inbox atlas", typed()[-1])
        lines = keys.read_text().splitlines()
        self.assertEqual(lines[1], "t-axis send-keys -t t-axis Enter")  # its own call, after the text
        (panes / "axis").write_text("❯ New message from OSA: run kit/msg.py inbox axis and act on it.\n")
        self.kit("watch.py", "--seats", env=env)  # the Enter was lost: the line still sits in the box
        self.assertEqual(keys.read_text().splitlines()[-1], "t-axis send-keys -t t-axis Enter")
        self.assertEqual(len(typed()), 2, "typed the line again instead of pressing Enter")
        (panes / "axis").write_text(idle)
        send("axis", "and #4", by="zero")
        self.kit("watch.py", "--seats", env=env)
        self.assertIn("New message from OSA, zero: run kit/msg.py inbox axis", typed()[-1])
        self.kit("msg.py", "inbox", "axis")
        self.kit("watch.py", "--seats", env=env)
        self.assertEqual(len(typed()), 3, "woke a seat that had already read its inbox")

    def test_a_pr_the_merge_queue_drops_is_reported_once_and_not_nudged_as_waiting(self):
        self.kit("plan.py", "set", "A", "review")
        green = lambda n, head, labels=(): {"number": n, "headRefName": head, "headRefOid": f"sha{n}", "isDraft": False,
                                           "mergeable": "MERGEABLE", "autoMergeRequest": None,
                                           "labels": [{"name": l} for l in labels],
                                           "statusCheckRollup": [{"name": "check", "conclusion": "SUCCESS",
                                                                  "completedAt": "2026-01-01T00:00:00Z"}]}
        prs = json.dumps([green(7, "f/A"), green(8, "ops/x", ["owner:atlas"]), green(9, "f/B")])
        event = lambda n, kind, reason="": {"number": n, "timelineItems": {"nodes": [
            {"__typename": kind, "createdAt": "2026-01-01T00:05:00Z", "reason": reason}]}}
        drops = json.dumps({"data": {"repository": {"pullRequests": {"nodes": [
            event(7, "RemovedFromMergeQueueEvent", "Required status check \"check\" failed"),
            event(8, "RemovedFromMergeQueueEvent", "Required status check \"check\" failed"),
            event(9, "AddedToMergeQueueEvent")]}}}})
        env = {"GH_OPEN": prs, "GH_DROPS": drops}
        for _ in range(2):
            self.kit("plan.py", "refresh", env=env)
        osa = self.kit("msg.py", "inbox", "osa").stdout
        self.assertEqual(osa.count("PR #7 (f/A) was dropped from the merge queue"), 1, osa)
        self.assertEqual(osa.count("PR #8 (ops/x) was dropped"), 1, osa)
        self.assertNotIn("PR #9", osa)  # last added, not removed: still queued
        self.assertIn("PR #7", self.kit("msg.py", "inbox", "axis").stdout)   # A has no `held`: the leads
        self.assertIn("PR #8", self.kit("msg.py", "inbox", "atlas").stdout)  # not a plan PR: its owner label
        self.kit("msg.py", "inbox", "zero")  # the leads alert, read: only the watch pass below is left
        (self.tmp / "bin" / "tmux").write_text("#!/usr/bin/env bash\nexit 0\n")
        (self.tmp / "bin" / "tmux").chmod(0o755)
        self.kit("watch.py", "--seats", env=env)
        nudges = self.kit("msg.py", "inbox", "axis").stdout + self.kit("msg.py", "inbox", "zero").stdout
        self.assertNotIn("PR #7", nudges)  # dropped after its checks passed: not "waiting for you to merge"
        self.assertNotIn("PR #8", nudges)
        self.assertIn("PR #9", nudges)     # a green PR the queue didn't drop is still nudged

    def test_checker_skips_tickets_a_seat_runs_itself(self):
        self.kit("plan.py", "set", "E", "merged")  # role ops: no holdouts
        self.assertEqual(self.kit("plan.py", "claim", "--agent", "rigg", "--role", "check").returncode, 1)
        self.kit("plan.py", "set", "A", "merged")
        self.assertEqual(self.kit("plan.py", "claim", "--agent", "rigg", "--role", "check").stdout.split(), ["A"])

    def test_check_batch_and_reopen(self):
        self.kit("plan.py", "set", "A", "merged")
        self.assertEqual(self.kit("plan.py", "claim", "--agent", "rigg", "--role", "check").stdout.strip(), "A")
        self.assertEqual(self.kit("plan.py", "claim", "--agent", "fenn", "--role", "check").returncode, 1)
        self.kit("plan.py", "reopen", "A", "--note", "holdout 2 fails")
        shown = json.loads(self.kit("plan.py", "show", "A").stdout)
        self.assertEqual(shown["notes"], ["holdout 2 fails"])
        # Held until a lead writes the failing case into its checks: no lane builds it blind.
        self.assertIn("A          needs_checks", self.kit("plan.py", "board").stdout)
        self.assertEqual(self.kit("plan.py", "claim", "--agent", "soap").stdout.split(), ["B"])
        self.assertIn("A reopened by its holdout (holdout 2 fails)", self.kit("msg.py", "inbox", "axis").stdout)
        self.kit("plan.py", "set", "B", "merged")  # B shares A's folder: out of the way
        self.kit("plan.py", "set", "A", "ready")
        self.assertEqual(self.kit("plan.py", "claim", "--agent", "fantem").stdout.split(), ["A"])

    def test_reused_worktree_is_refreshed_and_reinstalled_on_lockfile_change(self):
        log = self.tmp / "setup.log"
        with open(self.repo / "kit" / "project.env", "a") as fh:
            fh.write(f"WT_SETUP_CMD='echo setup >> {log}'\nWT_SETUP_KEY=\"package-lock.json\"\n"
                     f"WT_REFRESH_CMD='echo refresh >> {log}'\n")
        batch = lambda: (self.kit("plan.py", "set", "A", "merged"),
                         self.kit("lane.py", "--agent", "rigg", "--role", "check", "--once", env={"GH_NO_PR": "1"}))
        r = batch()[1]
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(log.read_text().split(), ["setup"])  # a new worktree installs
        batch()
        self.assertEqual(log.read_text().split(), ["setup", "refresh"])  # reused: regenerate only
        (self.repo / "package-lock.json").write_text('{"v": 2}\n')
        for c in (["add", "-A"], ["commit", "-qm", "new dep"], ["push", "-q", "origin", "main"]):
            run(["git", *c], self.repo)
        batch()
        self.assertEqual(log.read_text().split(), ["setup", "refresh", "setup"])  # lockfile changed: reinstall
        self.assertTrue((self.repo / ".wt" / "check-rigg" / "package-lock.json").exists())  # on the new main

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
        self.assertIn("A          needs_checks", self.kit("plan.py", "board").stdout)
        self.kit("plan.py", "set", "A", "ready")
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
        with open(self.repo / "kit" / "project.env", "a") as fh:
            fh.write("LANES_ON=miosa\nMSG_BACKEND=fs\n")
        self.assertIn("FAIL  MSG_BACKEND=fs but LANES_ON=miosa", run(["bash", "kit/preflight.sh"], self.repo, self.env).stdout)

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

    def test_seat_panes_unset_project_keys_whatever_the_server_holds(self):
        (self.tmp / "bin" / "tmux").write_text(FAKE_TMUX)
        (self.tmp / "bin" / "tmux").chmod(0o755)
        args = self.tmp / "tmux.args"
        env = {k: v for k, v in self.env.items() if k != "TMUX"}
        r = run(["bash", "kit/seat.sh", "board"], self.repo,
                {**env, "TMUX_ENV_LOG": str(self.tmp / "tmux.env"), "TMUX_ARGS_LOG": str(args)})
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        cmd = args.read_text().splitlines()[-1]  # the pane's command, tmux's last argument
        self.assertTrue(cmd.startswith("unset "), cmd)
        unset = cmd.split(";", 1)[0].split()[1:]
        self.assertTrue({"PROJECT", "OPS_ISSUE", "LEADS", "CHECK_MIN"} <= set(unset), unset)
        self.assertIn("kit/plan.py board", cmd)

    def test_another_projects_environment_is_ignored(self):
        probe = ("import json, sys; sys.path.insert(0, 'kit'); import lib; e = lib.load_env(); "
                 "print(json.dumps([e['PROJECT'], e['OPS_ISSUE'], e.get('AVEL_AGENT')]))")
        mine = json.loads(run([sys.executable, "-c", probe], self.repo, {**self.env}).stdout)
        foreign = run([sys.executable, "-c", probe], self.repo,
                      {**self.env, "PROJECT": "midwest-motion", "OPS_ISSUE": "2", "AVEL_AGENT": "osa"})
        self.assertEqual(json.loads(foreign.stdout), [mine[0], mine[1], "osa"])
        self.assertIn("ignoring midwest-motion", foreign.stderr)
        same = run([sys.executable, "-c", probe], self.repo, {**self.env, "PROJECT": mine[0], "OPS_ISSUE": "99"})
        self.assertEqual(json.loads(same.stdout)[1], "99")  # this project's own override still works

    def test_lanes_get_their_own_databases_and_ports(self):
        made = self.tmp / "created.txt"
        with open(self.repo / "kit" / "project.env", "a") as fh:
            fh.write('LANE_DB_VARS="TEST_DATABASE_URL E2E_DATABASE_URL UNSET_URL"\n'
                     'LANE_PORT_VARS="E2E_PORT=3210 PORT=3010"\n'
                     f"LANE_DB_CREATE_CMD='echo {{db}} >> {made}'\n")
        base = {"TEST_DATABASE_URL": "postgresql://postgres:pw@127.0.0.1:54330/mm_test",
                "E2E_DATABASE_URL": "postgresql://postgres:pw@127.0.0.1:54330/mm_e2e_test?schema=public"}
        log = self.tmp / "claude.env"
        r = self.kit("lane.py", "--agent", "soap", "--once", env={**base, "CLAUDE_ENV_LOG": str(log)})
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        seen = dict(line.split("=", 1) for line in log.read_text().splitlines() if "=" in line)
        self.assertEqual(seen["TEST_DATABASE_URL"], "postgresql://postgres:pw@127.0.0.1:54330/mm_test_soap")
        self.assertEqual(seen["E2E_DATABASE_URL"],
                         "postgresql://postgres:pw@127.0.0.1:54330/mm_e2e_test_soap?schema=public")
        self.assertEqual((seen["E2E_PORT"], seen["PORT"]), ("3210", "3010"))
        self.assertNotIn("UNSET_URL", seen)
        self.assertEqual(sorted(made.read_text().split()), ["mm_e2e_test_soap", "mm_test_soap"])
        probe = ("import json, sys; sys.path.insert(0, 'kit'); import lane; "
                 "print(json.dumps({a: lane.lane_env(a)[0] for a in ('fantem', 'rigg')}))")
        other = json.loads(run([sys.executable, "-c", probe], self.repo, {**self.env, **base}).stdout)
        self.assertEqual(other["fantem"]["E2E_PORT"], "3211")  # BUILDERS then CHECKERS: no two lanes share one
        self.assertEqual(other["rigg"]["E2E_PORT"], "3212")
        self.assertTrue(other["rigg"]["TEST_DATABASE_URL"].endswith("/mm_test_rigg"))

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

    def test_set_and_reopen_refuse_an_unknown_id(self):
        for args in (("reopen", "--help"), ("set", "NOPE", "ready"), ("reopen", "NOPE")):
            r = self.kit("plan.py", *args)
            self.assertEqual(r.returncode, 2, args)
            self.assertIn("no feature", r.stderr)
        path = self.repo / ".git" / "avel" / "state.json"
        st = json.loads(path.read_text()) if path.exists() else {"features": {}}
        self.assertFalse({"--help", "NOPE"} & set(st.get("features", {})))

    def test_lint_allows_a_leads_small_fix_entry_within_limits(self):
        fs = {"features": [
            {"id": "OK", "status": "review", "checks": ["it works"], "touches": ["kit/x.py", "src/app/api/y/route.ts"]},
            {"id": "OLD", "status": "superseded"},
            {"id": "TYPO", "status": "done"},
            {"id": "BARE", "status": "review", "checks": [], "touches": ["docs/x.md"]},
            {"id": "SCREEN", "status": "review", "checks": ["c"], "touches": ["src/ui/a.jsx", "src/app/page.tsx"]}]}
        (self.tmp / "f.json").write_text(json.dumps(fs))
        out = self.kit("plan.py", "lint", str(self.tmp / "f.json")).stdout
        self.assertNotIn("OK:", out)
        self.assertNotIn("OLD:", out)
        self.assertIn('TYPO: status "done" isn\'t one of ready, review, superseded', out)
        self.assertIn("BARE: a review entry needs real checks", out)
        self.assertIn("SCREEN: touches src/ui/a.jsx, src/app/page.tsx, which is feature code", out)

    def test_a_leads_small_fix_is_never_claimed_and_joins_the_check_flow_when_it_merges(self):
        fs = {"features": [{"id": "F", "status": "review", "deps": [], "touches": ["kit/x.py"], "checks": ["c"]},
                           {"id": "G", "deps": ["F"], "touches": ["src/g.ts"], "checks": []}]}
        (self.repo / "plan" / "features.json").write_text(json.dumps(fs))
        claim = lambda role="build": self.kit("plan.py", "claim", "--agent", "soap", "--role", role).stdout.strip()
        self.assertEqual(claim(), "")         # F is the lead's, and G waits on it: review isn't done for deps
        self.assertEqual(claim("check"), "")  # not merged yet, so nothing to check
        self.kit("plan.py", "refresh", env={"GH_MERGED": json.dumps([{"headRefName": "f/F", "number": 12}])})
        state = json.loads((self.repo / ".git" / "avel" / "state.json").read_text())
        self.assertEqual(state["features"]["F"]["status"], "merged")
        self.assertEqual(claim(), "G")
        self.assertEqual(claim("check"), "F")

    def test_messages_from_the_ops_issue_carry_local_time(self):
        import time
        now = time.time()
        utc = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now - 60))
        comments = json.dumps({"comments": [{"createdAt": utc, "body": "[to:axis][from:osa][id:gh1] please review #9"}]})
        env = {"MSG_BACKEND": "both", "OPS_ISSUE": "5", "GH_COMMENTS": comments, "TZ": "America/Chicago"}
        self.kit("msg.py", "send", "axis", "and #10", env={**env, "AVEL_AGENT": "zero"})
        code = ("import sys; sys.path.insert(0, 'kit'); import msg, watch; ms = msg.read_all(); "
                "print(' '.join(m['id'] for m in ms)); print(int(watch.age_s(ms[0])))")
        ids, age = run([sys.executable, "-c", code], self.repo, {**self.env, **env}).stdout.split("\n")[:2]
        self.assertTrue(ids.startswith("gh1 "), ids)  # the older GitHub message sorts first
        self.assertTrue(55 <= int(age) <= 120, age)    # a minute old, not six hours in the future

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

    def test_a_blocked_run_with_a_pr_waits_in_review_without_another_attempt(self):
        r = self.kit("lane.py", "--agent", "soap", "--once", env={"FAKE_REPORT_STATUS": "blocked (waiting for OSA's screenshot)"})
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        st = json.loads((self.repo / ".git" / "avel" / "state.json").read_text())["features"]["A"]
        self.assertEqual((st["status"], st.get("pr"), st["attempts"]), ("review", 7, 1))
        gh_log = self.tmp / "gh.log"
        log = gh_log.read_text() if gh_log.exists() else ""
        self.assertNotIn("merge", log)  # a lead queues it after the screenshot
        self.assertNotIn("A", self.kit("plan.py", "claim", "--agent", "fantem").stdout.split())

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
        log = (self.tmp / "gh.log").read_text()
        self.assertIn("pr merge 7 --auto", log)  # queued (merge queue or auto-merge)
        self.assertLess(log.index("ready 7"), log.index("pr merge 7"))  # a lane's draft is made ready first
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
