#!/usr/bin/env python3
"""PostToolUseFailure hook on Bash: the same failure 3 times means stop.

Signature = sha256(command + first line of the error). Keeps the last 5 per session.
On the third repeat it tells the agent to stop changing code and report stuck.
"""
import hashlib, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib import avel_dir, read_json, write_json

MSG = ("You've hit the same failure 3 times. Stop changing code. Write your report with "
       "`status: stuck`, the command and the error, then run: kit/msg.py send osa \"<feature>: stuck on <error>\"")


def first_error_line(text):
    lines = [l for l in str(text).splitlines() if l.strip()]
    if lines and lines[0].lower().startswith("exit code"):
        lines = lines[1:]
    return lines[0][:300] if lines else ""


def main():
    data = json.load(sys.stdin)
    if data.get("tool_name") != "Bash":
        return
    cmd = (data.get("tool_input") or {}).get("command", "")
    err = data.get("error") or data.get("tool_response") or ""
    sig = hashlib.sha256((cmd + "\n" + first_error_line(err)).encode()).hexdigest()[:16]
    f = avel_dir() / "logs" / f"stuck-{data.get('session_id', 'x')}.json"
    recent = (read_json(f, []) + [sig])[-5:]
    write_json(f, recent)
    if recent.count(sig) >= 3:
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "PostToolUseFailure",
                                                 "additionalContext": MSG}}))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"stuck: {e}", file=sys.stderr)
    sys.exit(0)
