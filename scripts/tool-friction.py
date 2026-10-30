#!/usr/bin/env python3
"""Count tool friction in Claude Code transcripts: harness sleep blocks, Monitor schema
errors, exit 137 by shape, and auto-mode classifier denials. One JSON object on stdout.
Usage: python3 scripts/tool-friction.py [--root DIR]   (default ~/.claude/projects)"""
import argparse, json, re
from collections import Counter
from pathlib import Path

POLL = re.compile(r"\b(until|while)\b.*\bsleep\b", re.S)
HEAVY = re.compile(r"\b(pnpm|npm|cargo|vitest|nx|turbo|playwright|tsc)\b")
DENIED = "denied by the Claude Code auto mode classifier"


def text_of(content):
    if isinstance(content, list):
        return " ".join(b.get("text", "") for b in content if isinstance(b, dict))
    return content if isinstance(content, str) else ""


def head_of(name, inp):
    if name != "Bash":
        return name
    cmd = re.sub(r"^\s*cd\s+\S+\s*&&\s*", "", (inp or {}).get("command", ""))
    return " ".join(re.sub(r"^rtk proxy\s+", "", cmd).split()[:2])


def scan(root):
    out = {"sleep_blocks": 0, "monitor_schema_errors": 0, "exit_137": {"poll_loop": 0, "heavy_run": 0, "other": 0}}
    denials = Counter()
    for path in Path(root).rglob("*.jsonl"):
        uses = {}
        try:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue
        for line in lines:
            try:
                content = json.loads(line)["message"]["content"]
            except (ValueError, KeyError, TypeError):
                continue
            for b in content if isinstance(content, list) else []:
                if not isinstance(b, dict):
                    continue
                if b.get("type") == "tool_use":
                    uses[b.get("id")] = (b.get("name", "?"), b.get("input"))
                elif b.get("type") == "tool_result" and b.get("is_error"):
                    name, inp = uses.get(b.get("tool_use_id"), ("?", None))
                    text = text_of(b.get("content"))
                    if "Blocked: sleep" in text:
                        out["sleep_blocks"] += 1
                    if name == "Monitor" and "InputValidationError" in text:
                        out["monitor_schema_errors"] += 1
                    if "Exit code 137" in text:
                        cmd = (inp or {}).get("command", "")
                        out["exit_137"]["poll_loop" if POLL.search(cmd) else "heavy_run" if HEAVY.search(cmd) else "other"] += 1
                    if DENIED in text:
                        m = re.search(r"Reason: \[([^\]]*)\]", text)
                        denials[(m.group(1) if m else "?", name, head_of(name, inp))] += 1
    out["denials"] = [{"reason": r, "tool": t, "head": h, "count": n} for (r, t, h), n in denials.most_common()]
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(Path.home() / ".claude" / "projects"))
    print(json.dumps(scan(ap.parse_args().root)))
