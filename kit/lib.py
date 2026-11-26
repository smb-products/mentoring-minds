"""Shared helpers for the AVEL client kit. Standard library only."""
import contextlib, fcntl, json, os, re, shlex, subprocess, sys, time
from pathlib import Path


def sh(cmd, cwd=None, check=False):
    """Run a command, return (code, combined output)."""
    p = subprocess.run(cmd, cwd=cwd, shell=isinstance(cmd, str), capture_output=True, text=True)
    out = (p.stdout or "") + (p.stderr or "")
    if check and p.returncode:
        raise RuntimeError(f"{cmd} failed: {out[-400:]}")
    return p.returncode, out


def git(*args, cwd=None):
    code, out = sh(["git", *args], cwd=cwd)
    return out.strip() if code == 0 else ""


def root():
    """The main checkout (not a worktree), so every lane shares one plan and one state."""
    common = Path(git("rev-parse", "--path-format=absolute", "--git-common-dir") or ".git").resolve()
    return common.parent if common.name == ".git" else Path.cwd()


def avel_dir():
    common = git("rev-parse", "--path-format=absolute", "--git-common-dir")
    d = Path(common or ".git") / "avel"
    (d / "logs").mkdir(parents=True, exist_ok=True)
    return d


def load_env():
    """kit/project.env overlaid by the real environment. KEY=VALUE lines, # comments.

    The environment wins only when it belongs to this project. A shell that exported another project's
    project.env (a different PROJECT) would otherwise run this kit with its install command, databases and
    issue numbers, so then only AVEL_* keys are taken from it."""
    vals = {}
    f = root() / "kit" / "project.env"
    if f.exists():
        for line in f.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
                v = v[1:-1]
            vals[k.strip()] = v
    other = os.environ.get("PROJECT")
    foreign = bool(other and vals.get("PROJECT") and other != vals["PROJECT"])
    if foreign:
        print(f"kit: ignoring {other}'s project settings in this shell's environment; "
              f"using kit/project.env ({vals['PROJECT']})", file=sys.stderr)
    vals.update({k: v for k, v in os.environ.items()
                 if k.startswith("AVEL_") or (k in vals and not foreign)})
    return vals


def words(s):
    return shlex.split(s or "")


@contextlib.contextmanager
def locked(name):
    with open(avel_dir() / f"{name}.lock", "w") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)


def read_json(path, default):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return default


def write_json(path, data):
    path = Path(path)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2))
    os.replace(tmp, path)


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def report_status(path):
    """First `status: x` line of a feature report, or ''."""
    try:
        m = re.search(r"^status:\s*(\S+)", Path(path).read_text(), re.M)
        return m.group(1).lower() if m else ""
    except OSError:
        return ""


def glob_hit(path, globs):
    from fnmatch import fnmatch
    return any(fnmatch(path, g) or path.startswith(g.rstrip("*")) and g.endswith("/**") for g in globs)
