#!/usr/bin/env python3
"""Tests for retro-extract.py. Run: python3 scripts/test_retro_extract.py"""
import json, os, subprocess, sys, tempfile, unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("retro-extract.py")
BASELINE = Path(__file__).resolve().parent.parent / "reports" / "data" / "retro-baseline-2026-10-29.json"
DAY = "2026-10-10"


def ts(day=DAY, minute=0): return f"{day}T10:{minute:02d}:00.000Z"
def text(t): return {"type": "text", "text": t}
def tool_use(id_, name, **inp): return {"type": "tool_use", "id": id_, "name": name, "input": inp}
def assistant(blocks, minute=0, usage=None, model="claude-opus-5-5", cwd="/w"):
    return {"type": "assistant", "timestamp": ts(minute=minute), "cwd": cwd,
            "message": {"model": model, "usage": usage or {}, "content": blocks}}
def prompt(t, minute=0): return {"type": "user", "timestamp": ts(minute=minute), "message": {"content": t}}
def tool_error(id_, t, minute=0):
    return {"type": "user", "timestamp": ts(minute=minute),
            "message": {"content": [{"type": "tool_result", "tool_use_id": id_, "is_error": True, "content": t}]}}


def write_jsonl(path: Path, rows, mtime=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf-8")
    if mtime:
        os.utime(path, (mtime, mtime))


def main_session(root: Path, sid: str, rows, mtime=None): write_jsonl(root / "proj" / f"{sid}.jsonl", rows, mtime)


def sub_session(root: Path, parent: str, agent: str, rows, agent_type: str, desc: str):
    p = root / "proj" / parent / "subagents" / f"agent-{agent}.jsonl"
    write_jsonl(p, rows)
    p.with_suffix(".meta.json").write_text(json.dumps({"agentType": agent_type, "description": desc}), encoding="utf-8")


def run_extract(root, *extra, env=None) -> dict:
    with tempfile.TemporaryDirectory() as out:
        cmd = [sys.executable, "-I", str(SCRIPT), "--since", "2026-09-29", "--out", out, *extra]
        if root:
            cmd += ["--root", str(root)]
        subprocess.run(cmd, check=True, capture_output=True, text=True, env=env)
        return json.loads((Path(out) / "summary.json").read_text(encoding="utf-8"))


class ExtractorCli(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name) / "projects"
        self.addCleanup(self._tmp.cleanup)
        main_session(self.root, "s1", [prompt("go"), assistant([tool_use("e1", "Edit", file_path="a.ts")], 1),
                                       tool_error("e1", "File has not been read yet. Read it first before writing to it.", 2)])
        sub_session(self.root, "s1", "a1", [assistant([text("done")], 3)], "executor", "Build A")

    def test_writes_three_files_and_counts(self):
        with tempfile.TemporaryDirectory() as out:
            subprocess.run([sys.executable, "-I", str(SCRIPT), "--root", str(self.root), "--since", "2026-09-29", "--out", out],
                           check=True, capture_output=True, text=True)
            self.assertEqual(sorted(os.listdir(out)), ["mains.json", "subs.json", "summary.json"])
            t = json.loads((Path(out) / "summary.json").read_text(encoding="utf-8"))["totals"]
        self.assertEqual((t["main_sessions"], t["subagent_runs"], t["tool_calls"]), (1, 1, 1))
        self.assertEqual(t["err"]["Edit|file-not-read"], 1)

    def test_since_excludes_old_session(self):
        old = [prompt("old")]
        old[0]["timestamp"] = "2026-09-01T10:00:00.000Z"
        main_session(self.root, "old", old, mtime=1788000000)  # 2026-08-29
        self.assertEqual(run_extract(self.root)["totals"]["main_sessions"], 1)

    def test_until_excludes_later_session(self):
        self.assertEqual(run_extract(self.root, "--until", "2026-10-01")["totals"]["main_sessions"], 0)

    def test_default_root_is_home(self):
        home = Path(self._tmp.name) / "home"
        (home / ".claude").mkdir(parents=True)
        self.root.rename(home / ".claude" / "projects")
        env = {**os.environ, "HOME": str(home), "USERPROFILE": str(home)}  # Path.home() reads USERPROFILE on Windows
        self.assertEqual(run_extract(None, env=env)["totals"]["main_sessions"], 1)

    def test_source_has_no_posix_only_assumptions(self):
        src = SCRIPT.read_text(encoding="utf-8")
        for bad in ('"/tmp', "'/tmp", '"/subagents/"', 'rsplit("/"', 'split("/")', "expanduser"):
            self.assertNotIn(bad, src)

    def test_baseline_file_carries_parity_numbers(self):
        b = json.loads(BASELINE.read_text(encoding="utf-8"))
        self.assertEqual(b["linux"]["edit_before_read"], 1081)
        self.assertEqual(b["linux"]["subagents_over_120min"], 101)
        self.assertEqual(b["windows"]["sessions"], 415)
        self.assertTrue(418 <= b["extractor_totals"]["main_sessions"] <= 435)


if __name__ == "__main__":
    unittest.main()
