#!/usr/bin/env python3
"""kit/heal.py: a lane PR that conflicts with main heals itself.

GitHub calls a PR CONFLICTING (mergeable_state "dirty") when its own merge fails, even where git's
union driver (.gitattributes: CHANGES.md, progress.md) would merge cleanly. For an f/* or h/* PR:
merge origin/main into the branch in a temporary detached worktree, rerun the fast checks
(WT_SETUP_CMD, TYPECHECK_CMD, with LANE_ENV), and push without force. A real conflict, a failing
check, or a PROTECT_MERGE file changed on both sides goes to OSA and the leads instead.
Held plan/* and ops/* PRs heal the same way, but only when every file both sides changed is a union
file (CHANGES.md, progress.md); anything else stays with the lead who owns the PR.
Each (branch head, main) pair is tried once.

  heal.py            heal every conflicting open f/*, h/*, plan/* and ops/* PR (refresh does this too)
"""
import fcntl, json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import avel_dir, git, glob_hit, load_env, read_json, root, sh, words, write_json

ENV = load_env()
LANE_BRANCH = re.compile(r"^(f|h|plan|ops)/")
LEAD_BRANCH = re.compile(r"^(plan|ops)/")


def with_env(cmd):
    return f"{ENV['LANE_ENV']}; {cmd}" if ENV.get("LANE_ENV") else cmd


def tell(text):
    from msg import send
    for to in ("osa", "leads"):
        send(to, text, "lane")


def heal(branch, pr):
    """Merge main into a conflicting lane branch. Returns healed | held | conflict | failed | seen."""
    top = root()
    sh(["git", "fetch", "-q", "origin", "main", branch], cwd=top)
    head, main = git("rev-parse", f"origin/{branch}", cwd=top), git("rev-parse", "origin/main", cwd=top)
    if not head or not main:
        return "failed"
    memo_file = avel_dir() / "heal.json"
    memo = read_json(memo_file, {})
    key = f"{branch}@{head[:12]}+{main[:12]}"
    if key in memo:
        return "seen"
    wt = top / ".wt" / ("heal-" + branch.replace("/", "-"))
    sh(["git", "worktree", "remove", "--force", str(wt)], cwd=top)
    sh(["git", "worktree", "add", "-q", "--detach", str(wt), f"origin/{branch}"], cwd=top, check=True)
    try:
        result = merge_check_push(branch, pr, wt)
    finally:
        sh(["git", "worktree", "remove", "--force", str(wt)], cwd=top)
    memo[key] = result
    write_json(memo_file, dict(list(memo.items())[-500:]))
    return result


def merge_check_push(branch, pr, wt):
    base = git("merge-base", "HEAD", "origin/main", cwd=wt)
    ours = set(git("diff", "--name-only", base, "HEAD", cwd=wt).splitlines())
    theirs = set(git("diff", "--name-only", base, "origin/main", cwd=wt).splitlines())
    union = {p for p in ours & theirs if git("check-attr", "merge", "--", p, cwd=wt).endswith(": union")}
    if LEAD_BRANCH.match(branch) and (ours & theirs) - union:
        return "lead"  # a real overlap in a lead's PR: theirs to merge (the guard reports the conflict)
    held = sorted(p for p in (ours & theirs) - union if glob_hit(p, words(ENV.get("PROTECT_MERGE", ""))))
    if held:
        tell(f"PR #{pr} ({branch}) conflicts with main in protected files: {', '.join(held[:4])}. A lead merges main by hand.")
        return "held"
    code, out = sh(["git", "merge", "-q", "--no-edit", "origin/main"], cwd=wt)
    if code:
        files = git("diff", "--name-only", "--diff-filter=U", cwd=wt).split()
        sh(["git", "merge", "--abort"], cwd=wt)
        tell(f"PR #{pr} ({branch}) has a real conflict with main in {', '.join(files[:4]) or 'unknown files'}. "
             "Needs a lead (or reopen the feature).")
        return "conflict"
    for cmd in (ENV.get("WT_SETUP_CMD"), ENV.get("TYPECHECK_CMD")):
        if cmd:
            code, out = sh(with_env(cmd), cwd=wt)
            if code:
                tell(f"PR #{pr} ({branch}): main merged in cleanly, but `{cmd}` fails, so nothing was pushed. "
                     f"{out.strip().splitlines()[-1][:160] if out.strip() else ''}")
                return "failed"
    code, out = sh(["git", "push", "-q", "origin", f"HEAD:refs/heads/{branch}"], cwd=wt)
    if code:
        tell(f"PR #{pr} ({branch}): push of the main merge was refused: {out.strip()[:160]}")
        return "failed"
    from msg import send
    send("osa", f"PR #{pr} ({branch}) conflicted with main: merged main in, checks pass, pushed.", "lane")
    return "healed"


def heal_open(prs):
    """prs: open PRs from `gh pr list --json headRefName,number,mergeable`. One healer at a time."""
    todo = [p for p in prs if LANE_BRANCH.match(p["headRefName"]) and p.get("mergeable") == "CONFLICTING"]
    if not todo:
        return {}
    with open(avel_dir() / "heal.lock", "w") as fh:
        try:
            fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            return {}  # another lane is healing; the next refresh retries
        done = {}
        for p in todo:
            try:
                done[p["number"]] = heal(p["headRefName"], p["number"])
            except Exception as e:  # never break refresh or a lane
                done[p["number"]] = "failed"
                print(f"heal: PR #{p['number']}: {e}", file=sys.stderr)
        return done


def heal_pr(branch, pr, cwd=None):
    """Right after a lane opens or updates its PR: GitHub computes mergeability a moment later."""
    for _ in range(3):
        code, out = sh(["gh", "pr", "view", str(pr), "--json", "mergeable"], cwd=cwd)
        state = (json.loads(out).get("mergeable") if code == 0 else None) or ""
        if state != "UNKNOWN":
            break
        time.sleep(5)
    return heal_open([{"headRefName": branch, "number": pr, "mergeable": state}]).get(pr, "clean")


if __name__ == "__main__":
    code, out = sh(["gh", "pr", "list", "--state", "open", "--limit", "100", "--json", "headRefName,number,mergeable"])
    print(json.dumps(heal_open(json.loads(out) if code == 0 else [])))
