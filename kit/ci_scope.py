#!/usr/bin/env python3
"""kit/ci_scope.py [--full] < changed-paths: what CI runs for a change (.github/workflows/ci.yml).

Reads the changed paths, one per line, and prints key=value lines for $GITHUB_OUTPUT:
  app=true        the whole app suite (migrations, typecheck, npm test, build, e2e)
  kit=true        python3 kit/tests/test_kit.py
  plan=true       python3 kit/plan.py lint
  holdout=true    typecheck plus only the changed holdouts:
  holdout_tests=  tests/holdout/*.test.ts (vitest)   holdout_specs=  tests/holdout/*.spec.ts (Playwright)
On a pull_request, ci.yml runs only the fast part of app/holdout (migrations, typecheck, unit, contract; no
integration, holdouts, build or browser tests); the merge queue and pushes to main run all of it.
A change only to holdouts, the plan or the kit runs only what it touches. Anything else, an empty list or
--full (pushes to main) runs the app suite, which already includes every holdout. plan/holdouts/ holds parked
failing holdouts, so it is never run. A deleted holdout runs nothing.
"""
import sys
from pathlib import Path

HOLDOUT, PARKED = "tests/holdout/", "plan/holdouts/"


def is_holdout(p):
    return p.startswith(HOLDOUT) and p.endswith((".test.ts", ".spec.ts"))


def scope(paths, full=False, exists=lambda p: Path(p).exists()):
    paths = [p.strip() for p in paths if p.strip()]
    kit = any(p.startswith("kit/") for p in paths)
    plan = any(p.startswith("plan/") and not p.startswith(PARKED) for p in paths)
    # A holdout helper (not a test file) can break any holdout: that, like any app path, takes the full suite.
    other = [p for p in paths if not (p.startswith(("kit/", "plan/")) or is_holdout(p))]
    app = full or not paths or bool(other)
    held = [] if app else [p for p in paths if is_holdout(p) and exists(p)]
    tests = [p for p in held if p.endswith(".test.ts")]
    specs = [p for p in held if p.endswith(".spec.ts")]
    return {"app": app, "kit": kit, "plan": plan, "holdout": bool(held),
            "holdout_tests": " ".join(tests), "holdout_specs": " ".join(specs)}


def main(argv):
    out = scope(sys.stdin.read().splitlines(), full="--full" in argv)
    for k, v in out.items():
        print(f"{k}={str(v).lower() if isinstance(v, bool) else v}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
