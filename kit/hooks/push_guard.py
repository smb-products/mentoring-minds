#!/usr/bin/env python3
"""PreToolUse hook: keeps headless agents inside their lane.

For AVEL_KIND build or check (interactive seats are not limited, except for secrets):
  - git push only to its own branch: `git push [-u] origin <AVEL_BRANCH>` or `HEAD:<AVEL_BRANCH>`
  - no force push, no push to main, no `gh pr merge` (the lane merges), no `--admin`
  - no edits to PROTECT_WRITE paths (plan, rules, kit, agent files)
  - builders only: no edits to holdouts (tests/holdout/, plan/holdouts/); they belong to the checkers
  - checkers only: edits only inside tests/holdout/ and plan/holdouts/ (files outside the repo are fine),
    and a push is refused if the branch changes anything else
For every agent: no reading .env files (dev keys stay out of transcripts).
"""
import json, re, shlex, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib import git, glob_hit, load_env, words

HOLDOUTS = ("tests/holdout/", "plan/holdouts/")
CHECK_MSG = ("Checkers change only tests/holdout/ and plan/holdouts/. If the app or another test is wrong, "
             "reopen the feature: kit/plan.py reopen <id> --note \"<what fails>\".")
HOLDOUT_MSG = ("Holdout tests belong to the checkers, so builders can't change tests/holdout/ or plan/holdouts/. "
               "Make the feature pass them; if one is wrong, add an `amend:` line to your PR body.")
SHELL_WRITE = re.compile(r"^(rm|mv|tee|truncate|git\s+(rm|mv)|sed\s+(-\w*i|--in-place))\b")
ENV_FILE = re.compile(r"(^|[\s/'\"])\.env(?!\.example)(\.[\w.-]+)?($|[\s'\"])")


def deny(reason):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
          "permissionDecision": "deny", "permissionDecisionReason": reason}}))
    sys.exit(0)


def check_push(cmd, branch):
    try:
        parts = shlex.split(cmd)
    except ValueError:
        deny("Couldn't parse the push command. Use: git push -u origin " + branch)
    i = parts.index("push")
    rest = [p for p in parts[i + 1:] if p not in ("-u", "--set-upstream")]
    if any(p.startswith("-") for p in rest):
        deny("Only a plain push is allowed: git push -u origin " + branch)
    if rest not in (["origin", branch], ["origin", f"HEAD:{branch}"]):
        deny(f"You may push only your own branch: git push -u origin {branch}")


def main():
    data = json.load(sys.stdin)
    env = load_env()
    tool, inp = data.get("tool_name", ""), data.get("tool_input") or {}
    kind, branch = env.get("AVEL_KIND", ""), env.get("AVEL_BRANCH", "")
    path = inp.get("file_path") or inp.get("path") or ""
    cmd = inp.get("command", "") if tool == "Bash" else ""

    if tool == "Read" and Path(path).name.startswith(".env") and not path.endswith(".env.example"):
        deny("Don't read .env files. Ask Atlas which variable you need.")
    if cmd and ENV_FILE.search(cmd) and re.search(r"\b(cat|less|head|tail|grep|sed|awk|source|\.)\b", cmd):
        deny("Don't read .env files. Ask Atlas which variable you need.")
    if kind not in ("build", "check"):
        return

    for seg in re.split(r"&&|\|\||;|\|", cmd):
        seg = seg.strip()
        if re.match(r"git\s+push\b", seg):
            if not branch:
                deny("No AVEL_BRANCH set for this session; only the lane may push.")
            check_push(seg, branch)
            if kind == "check":
                base = git("merge-base", "HEAD", "origin/main") or "origin/main"
                outside = [f for f in git("diff", "--name-only", base, "HEAD").splitlines()
                           if f and not f.startswith(HOLDOUTS)]
                if outside:
                    deny(f"{CHECK_MSG} Your branch also changes: {', '.join(outside[:5])}. "
                         "Restore them from origin/main and commit again.")
        if re.match(r"gh\s+pr\s+merge\b", seg) or "--admin" in seg:
            deny("Don't merge. The lane turns on auto-merge once your report says done.")
        if re.match(r"gh\s+pr\s+create\b", seg):
            head = re.search(r"--head[= ](\S+)", seg)
            current = git("rev-parse", "--abbrev-ref", "HEAD")
            if (head and head.group(1) != branch) or (not head and current != branch):
                deny(f"Open the PR from your own branch: gh pr create --head {branch} --fill")
        if re.match(r"git\s+(reset\s+--hard|clean\s+-\w*f|checkout\s+main|switch\s+main)", seg):
            deny("Stay on your branch and keep your work. Ask OSA if you think you need this.")
        if kind == "build" and any(h in seg for h in HOLDOUTS):
            into = re.search(r">>?\s*\S*(tests/holdout/|plan/holdouts/)", seg) or \
                (re.match(r"cp\b", seg) and any(h in seg.split()[-1] for h in HOLDOUTS))
            if SHELL_WRITE.match(seg) or into:
                deny(HOLDOUT_MSG)

    if tool in ("Edit", "Write", "MultiEdit", "NotebookEdit") and path:
        rel = str(Path(path).resolve()).replace(str(Path.cwd().resolve()) + "/", "")
        if glob_hit(rel, words(env.get("PROTECT_WRITE", ""))):
            deny(f"{rel} is owned by the leads. Put an `amend:` line in your PR body instead.")
        if kind == "build" and rel.startswith(HOLDOUTS):
            deny(HOLDOUT_MSG)
        inside = str(Path(path).resolve()).startswith(str(Path.cwd().resolve()) + "/")
        if kind == "check" and inside and not rel.startswith(HOLDOUTS):
            deny(CHECK_MSG)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        print(f"push_guard: {e}", file=sys.stderr)
    sys.exit(0)
