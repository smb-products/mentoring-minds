#!/usr/bin/env python3
"""Stop hook: a builder can't finish with `status: done`, and a checker can't finish at all, while fast checks fail.

Runs for headless build sessions (AVEL_KIND=build) whose report says done, and for every headless
check session (AVEL_KIND=check), so holdout PRs don't go red on type errors.
Fast checks = TYPECHECK_CMD plus TEST_RELATED_CMD on the changed files (kit/project.env).
The full suite runs in CI. Blocks at most twice, then marks the report stopped and tells OSA,
so it can never loop. Always exits 0.
"""
import json, os, re, shlex, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib import git, load_env, sh, avel_dir, report_status

SRC = re.compile(r"\.(ts|tsx|js|jsx|mjs|cjs)$")


def changed_files():
    base = git("merge-base", "HEAD", "origin/main") or "HEAD"
    files = set(git("diff", "--name-only", base).splitlines())
    files |= set(git("ls-files", "--others", "--exclude-standard").splitlines())
    return sorted(f for f in files if SRC.search(f) and Path(f).exists())


def checks(env):
    if env.get("AVEL_DONE_CHECK_CMD"):
        return [env["AVEL_DONE_CHECK_CMD"]]
    cmds = [c for c in (env.get("TYPECHECK_CMD"), env.get("LINT_FAST_CMD")) if c]
    files = changed_files()
    if env.get("TEST_RELATED_CMD") and files:
        cmds.append(env["TEST_RELATED_CMD"].replace("{files}", " ".join(shlex.quote(f) for f in files)))
    return cmds


def give_up(env, report, why):
    p = Path(report) if report else None
    if p and p.is_file():
        p.write_text(re.sub(r"^status:\s*\S+", "status: stopped (checks failing)", p.read_text(), count=1, flags=re.M))
        sh(["git", "add", report])
        sh(["git", "commit", "-qm", f"report: {env.get('AVEL_FEATURE', '')} stopped, checks failing"])
    kit = Path(__file__).resolve().parent.parent
    sh([sys.executable, str(kit / "msg.py"), "send", "osa",
        f"{env.get('AVEL_FEATURE') or env.get('AVEL_BRANCH', '?')}: stopped, fast checks still failing after 2 fixes. {why}"])


def main():
    try:
        data = json.load(sys.stdin)
    except ValueError:
        data = {}
    env = load_env()
    report = env.get("AVEL_REPORT", "")
    kind = env.get("AVEL_KIND")
    if kind == "build":
        if not report or report_status(report) != "done":
            return
    elif kind != "check":
        return
    counter = avel_dir() / "logs" / f"done-check-{data.get('session_id', 'x')}.count"
    blocks = int(counter.read_text()) if counter.exists() else 0
    failed = None
    for cmd in checks(env):
        code, out = sh(cmd)
        if code:
            failed = (cmd, "\n".join(out.splitlines()[-60:]))
            break
    if not failed:
        return
    if data.get("stop_hook_active") or blocks >= 2:
        give_up(env, report, f"Last failing command: {failed[0]}")
        return
    counter.write_text(str(blocks + 1))
    print(json.dumps({"decision": "block", "reason":
          f"Before you stop, `{failed[0]}` must pass, and it fails. Fix it, then stop again.\n\n{failed[1]}"}))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # a broken hook must never trap a session
        print(f"done_check: {e}", file=sys.stderr)
    sys.exit(0)
