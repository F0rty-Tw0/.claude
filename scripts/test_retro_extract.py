#!/usr/bin/env python3
"""Tests for retro-extract.py. Run: python3 scripts/test_retro_extract.py"""
import datetime as dt, importlib.util, json, os, subprocess, sys, tempfile, unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("retro-extract.py")
BASELINE = Path(__file__).resolve().parent.parent / "reports" / "data" / "retro-baseline-2026-10-29.json"
DAY = "2026-10-10"


def ts(day=DAY, minute=0): return f"{day}T10:{minute:02d}:00.000Z"
def text(t): return {"type": "text", "text": t}
def tool_use(id_, name, **inp): return {"type": "tool_use", "id": id_, "name": name, "input": inp}
def assistant(blocks, minute=0, usage=None, model="claude-opus-5-5"):
    return {"type": "assistant", "timestamp": ts(minute=minute), "cwd": "/w",
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


def load_extractor():
    sys.dont_write_bytecode = True  # keep scripts/ free of __pycache__
    spec = importlib.util.spec_from_file_location("retro_extract", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


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

    def test_half_written_meta_and_vanished_transcripts_are_skipped(self):
        meta = self.root / "proj" / "s1" / "subagents" / "agent-a1.meta.json"
        meta.write_text('{"agentType": "exec', encoding="utf-8")
        (self.root / "proj" / "unreadable.jsonl").mkdir()  # open() fails, as for a transcript deleted mid-scan
        try:
            os.symlink(self.root / "missing", self.root / "proj" / "deleted.jsonl")  # stat() fails
        except OSError:
            pass  # no symlink privilege (Windows); the other two cases still run
        t = run_extract(self.root)["totals"]
        self.assertEqual((t["main_sessions"], t["subagent_runs"]), (1, 1))

    def test_baseline_file_carries_parity_numbers(self):
        b = json.loads(BASELINE.read_text(encoding="utf-8"))
        self.assertEqual(b["linux"]["edit_before_read"], 1081)
        self.assertEqual(b["linux"]["subagents_over_120min"], 101)
        self.assertEqual(b["windows"]["sessions"], 415)
        self.assertTrue(418 <= b["extractor_totals"]["main_sessions"] <= 435)


def spawn(i, kind, desc, model=None):
    extra = {"model": model} if model else {}
    return tool_use(f"a{i}", "Agent", subagent_type=kind, description=desc, **extra)


def text_msg(t, minute=0): return assistant([text(t)], minute)


class Metrics(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name) / "projects"
        self.addCleanup(self._tmp.cleanup)

    def user_msg(self, body, minute=0):
        return prompt(f'Another Claude session sent a message:\n<teammate-message teammate_id="a">{body}</teammate-message>', minute)

    def test_every_requirement_has_a_key_or_an_unmeasurable_reason(self):
        main_session(self.root, "s1", [prompt("go")])
        s = run_extract(self.root)
        metrics = [k for k in s if k.startswith("req")]
        keys = metrics + list(s["unmeasurable"])
        for n in range(1, 28):
            self.assertTrue(any(k.startswith(f"req{n}_") for k in keys), f"req{n} has no key")
        for k in keys:
            self.assertRegex(k, r"^req\d+_[a-z0-9_]+$")
        for k in metrics:
            self.assertIsInstance(s[k], (int, float, type(None)), k)

    def test_verdict_share_counts_only_a_first_line_verdict(self):
        main_session(self.root, "s1", [prompt("go")])
        for i, (kind, body) in enumerate([("code-reviewer", "VERDICT: APPROVE\nok"), ("quality-reviewer", "Review done.\nVERDICT: APPROVE"),
                                          ("security-reviewer", "**VERDICT: BLOCK**\nbad"), ("critic", "OKAY")]):
            sub_session(self.root, "s1", f"r{i}", [text_msg(body)], kind, f"d{i}")
        self.assertAlmostEqual(run_extract(self.root)["req1_reviewer_verdict_share"], 2 / 3)

    def test_per_1k_error_flag_rates(self):
        fnr = "File has not been read yet. Read it first before writing to it."
        calls = [tool_use("e1", "Edit", file_path="a.ts"), tool_use("w1", "Write", file_path="b.ts")]
        cmds = ["ls", "ls", "ls", "ls", "cat <<EOF\nx\nEOF", "gh pr create", "ls", "ls"]
        calls += [tool_use(f"b{i}", "Bash", command=c) for i, c in enumerate(cmds, 1)]
        errors = [("e1", fnr), ("w1", fnr), ("b1", "This agent is isolated in the worktree /x/y, but this command runs git in /z"),
                  ("b2", "<tool_use_error>Blocked: sleep 45 followed by: gh pr checks. To wait for a condition, use Monitor"),
                  ("b3", "Exit code 137"),
                  ("b4", "Permission for this action was denied by the Claude Code auto mode classifier. Reason: [x]."),
                  ("b5", "Command timed out after 120s"), ("b6", "cannot resolve body file path: $X/pr.md"),
                  ("b7", "zsh: no matches found: *.ts"), ("b8", "bfs: error: bad flag")]
        rows = [prompt("go"), assistant(calls, 1)]
        rows += [tool_error(i, e, 2) for i, e in errors]
        main_session(self.root, "s1", rows)
        s = run_extract(self.root)
        self.assertEqual(s["req4_edit_before_read_per_1k"], 200.0)
        for k in ("req3_worktree_path_errors_per_1k", "req21_sleep_blocks_per_1k", "req21_exit137_per_1k",
                  "req21_classifier_denials_per_1k", "req13_heredoc_timeouts_per_1k", "req13_pr_proof_unresolved_path_per_1k"):
            self.assertEqual(s[k], 100.0, k)
        self.assertEqual(s["req5_glob_find_errors_per_1k"], 200.0)

    def test_context_share_buckets_main_calls(self):
        rows = [prompt("go")] + [assistant([text("x")], i + 1, usage={"input_tokens": n})
                                 for i, n in enumerate((50_000, 150_000, 250_000, 450_000))]
        main_session(self.root, "s1", rows)
        self.assertEqual(run_extract(self.root)["req8_main_calls_200k_plus_share"], 0.5)

    def test_rereview_share_and_critic_rounds(self):
        descs = ["Review slice 1", "Delta review of fixes", "Round 2 review", "Adversarial PR review"]
        spawns = [spawn(i, "code-reviewer", d) for i, d in enumerate(descs)] + [spawn(10 + i, "critic", f"Critic {i}") for i in range(3)]
        main_session(self.root, "s1", [prompt("go"), assistant(spawns, 1)])
        s = run_extract(self.root)
        self.assertEqual(s["req2_rereview_share"], 0.5)
        self.assertEqual(s["req2_critic_spawns_per_critic_session"], 3.0)

    def test_teammate_noise_per_session(self):
        bodies = ['{"type":"idle_notification"}', '{"type":"idle_notification"}', "Rest of report (part 2): ...", "done"]
        main_session(self.root, "s1", [prompt("go")] + [self.user_msg(b, i + 1) for i, b in enumerate(bodies)])
        sub_session(self.root, "s1", "a1", [self.user_msg("sub-only noise"), text_msg("done", 2)], "executor", "Build")  # messages into subs are not main noise
        s = run_extract(self.root)
        got = (s["req18_teammate_msgs_per_session"], s["req18_idle_notifications_per_session"], s["req10_part_fragments_per_session"])
        self.assertEqual(got, (4.0, 2.0, 1.0))

    def test_deglaze_find_rate_and_verdict_line_share(self):
        texts = ["DEGLAZE: GAPS 2\n1. x", "DEGLAZE: CLEAN\nproof", "DEGLAZE: CLEAN\nproof", "Gaps found:\n1. x"]
        rows = [prompt("go")] + [text_msg(t, i + 1) for i, t in enumerate(texts)]
        rows.append(assistant([tool_use(f"k{i}", "Skill", skill="deglaze") for i in range(5)], 9))
        main_session(self.root, "s1", rows)
        s = run_extract(self.root)
        self.assertEqual(s["req17_deglaze_find_rate"], 0.5)
        self.assertEqual(s["req17_deglaze_verdict_line_share"], 0.8)

    def test_block_rate_by_executor_model(self):
        spawns = [spawn(1, "executor", "Build A", "sonnet"), spawn(2, "code-reviewer", "Review A"),
                  spawn(3, "executor", "Build B"), spawn(4, "code-reviewer", "Review B"),
                  spawn(5, "executor", "Build C", "sonnet"), spawn(6, "code-reviewer", "Review C")]
        main_session(self.root, "s1", [prompt("go"), assistant(spawns, 1)])
        for agent, desc, verdict in [("r1", "Review A", "BLOCK"), ("r2", "Review B", "APPROVE"), ("r3", "Review C", "APPROVE")]:
            sub_session(self.root, "s1", agent, [text_msg(f"VERDICT: {verdict}\nx")], "code-reviewer", desc)
        s = run_extract(self.root)
        self.assertEqual(s["req26_executor_block_rate_sonnet"], 0.5)
        self.assertEqual(s["req26_executor_block_rate_opus"], 0.0)

    def test_report_head_is_the_last_report_even_after_send_message_parts(self):
        main_session(self.root, "s1", [prompt("go"), assistant([spawn(1, "executor", "Build A"), spawn(2, "code-reviewer", "Review A")], 1)])
        report = [assistant([tool_use("m1", "SendMessage", to="main", message="Part 1/2: findings ...")], 1),
                  text_msg("VERDICT: BLOCK\nPart 2/2: ...", 2)]
        sub_session(self.root, "s1", "r1", report, "code-reviewer", "Review A")
        s = run_extract(self.root)
        self.assertEqual((s["req1_reviewer_verdict_share"], s["req26_executor_block_rate_opus"]), (1.0, 1.0))

    def test_reviewer_runs_sharing_a_description_pair_in_time_order(self):
        def run(minute, verdict):
            return {"agentType": "code-reviewer", "parent": "s1", "desc": "Review",
                    "first": dt.datetime(2026, 10, 10, 10, minute, tzinfo=dt.timezone.utc), "report_head": f"VERDICT: {verdict}"}
        agents = [dict(type="executor", model="sonnet", desc="Build A"), dict(type="code-reviewer", model=None, desc="Review"),
                  dict(type="executor", model=None, desc="Build B"), dict(type="code-reviewer", model=None, desc="Review")]
        rates = load_extractor().block_rates([{"sid": "s1", "agents": agents}], [run(30, "APPROVE"), run(5, "BLOCK")])
        self.assertEqual(rates, {"sonnet": 1.0, "opus": 0.0})

    def test_handoff_grants_share_for_both_slash_styles(self):
        writes = [tool_use("w1", "Write", file_path="/data/u/.claude/handoffs/p-1.md", content="## Standing grants\n- x"),
                  tool_use("w2", "Write", file_path=r"D:\work\u\.claude\handoffs\p-2.md", content="no grants"),
                  tool_use("w3", "Write", file_path="/h/handoffs/p-SIGNOFFS.md", content="digest"),
                  tool_use("w4", "Write", file_path=r"D:\work\u\Temp\claude-reports\executor-a.md", content="r")]
        main_session(self.root, "s1", [prompt("go"), assistant(writes, 1)])
        s = run_extract(self.root)
        self.assertEqual(s["req6_handoff_grants_share"], 0.5)
        self.assertEqual(s["req7_signoff_digest_writes_per_session"], 1.0)
        self.assertEqual(s["req10_scratch_report_writes_per_session"], 1.0)

    def test_command_ratios(self):
        cmds = ["touch ~/.claude/.allow-commit-x", "git commit -m x", "pnpm test", "~/.claude/scripts/cpu-lock gate pnpm test", "cargo build", "ls"]
        calls = [tool_use(f"b{i}", "Bash", command=c) for i, c in enumerate(cmds)]
        main_session(self.root, "s1", [prompt("go"), assistant(calls, 1)])
        s = run_extract(self.root)
        self.assertAlmostEqual(s["req11_allow_commit_touches_per_1k"], 1000 / 6)
        self.assertAlmostEqual(s["req12_heavy_cmds_wrapped_share"], 1 / 3)

    def test_roster_spawn_shares(self):
        kinds = [("cold-reader", "Read spec"), ("general-purpose", "Cold read the spec"), ("executor", "A"), ("executor", "B"),
                 ("executor", "C"), ("deep-executor", "D"), ("verifier", "V"), ("test-engineer", "T")]
        main_session(self.root, "s1", [prompt("go"), assistant([spawn(i, k, d) for i, (k, d) in enumerate(kinds)], 1)])
        s = run_extract(self.root)
        self.assertEqual(s["req16_cold_reader_share"], 0.5)
        self.assertEqual(s["req23_deep_executor_share_of_executors"], 0.25)
        self.assertEqual(s["req14_archived_spawns_per_1k_spawns"], 125.0)
        self.assertEqual(s["req14_test_engineer_share_of_spawns"], 0.125)

    def test_debugger_and_deep_executor_runs(self):
        main_session(self.root, "s1", [prompt("go")])
        loaded = [assistant([tool_use("k", "Skill", skill="systematic-debugging")], 1)]
        sub_session(self.root, "s1", "d1", loaded, "debugger", "Find cause")
        sub_session(self.root, "s1", "d2", [text_msg("hmm")], "debugger", "Find other cause")
        failing = [assistant([tool_use("x1", "Bash", command="ls"), tool_use("x2", "Bash", command="ls")], 1),
                   tool_error("x1", "Exit code 1", 2), tool_error("x2", "Exit code 1", 2)]
        sub_session(self.root, "s1", "e1", failing, "deep-executor", "Build big")
        sub_session(self.root, "s1", "e2", [text_msg("ok")], "deep-executor", "Build other")
        s = run_extract(self.root)
        self.assertEqual(s["req23_debugger_systematic_debugging_share"], 0.5)
        self.assertEqual(s["req23_deep_executor_errors_per_run"], 1.0)

    def test_debugger_skill_read_fallback_counts_as_a_load(self):
        main_session(self.root, "s1", [prompt("go")])
        for agent, path in [("d1", "/data/u/.claude/skills/systematic-debugging/SKILL.md"),
                            ("d2", r"D:\work\u\.claude\skills\systematic-debugging\SKILL.md"), ("d3", "/w/notes.md")]:
            sub_session(self.root, "s1", agent, [assistant([tool_use("r", "Read", file_path=path)], 1)], "debugger", f"Find {agent}")
        self.assertAlmostEqual(run_extract(self.root)["req23_debugger_systematic_debugging_share"], 2 / 3)

    def test_misc_ratios(self):
        descs = ["Fix review findings", "Build X", "Build Y", "Round 2 fixes"]
        calls = [spawn(i, "executor", d) for i, d in enumerate(descs)]
        calls += [tool_use("c1", "mcp__context7__query-docs")] + [tool_use(f"f{i}", "WebFetch") for i in range(3)]
        calls.append(tool_use("k1", "Skill", skill="flow"))
        main_session(self.root, "s1", [prompt("go"), assistant(calls, 1)])
        s = run_extract(self.root)
        self.assertEqual(s["req19_executor_fix_round_share"], 0.5)
        self.assertEqual(s["req22_context7_share_of_doc_lookups"], 0.25)
        self.assertEqual(s["req15_flow_loads_per_100_sessions"], 100.0)

    def test_heavy_sessions_without_a_pr_and_long_subagents(self):
        heavy = [spawn(i, "executor", f"Build {i}") for i in range(10)]
        main_session(self.root, "s1", [prompt("go"), assistant(heavy, 1)])
        main_session(self.root, "s2", [prompt("go"), assistant(heavy + [tool_use("p", "Bash", command="gh pr create")], 1)])
        main_session(self.root, "s3", [prompt("go"), assistant([spawn(1, "executor", "Build")], 1)])
        long_run = [assistant([text("a")], 1), {**assistant([text("b")], 0), "timestamp": ts(day="2026-10-11", minute=30)}]
        sub_session(self.root, "s1", "l1", long_run, "executor", "Long")
        sub_session(self.root, "s1", "l2", [text_msg("quick")], "executor", "Quick")
        s = run_extract(self.root)
        self.assertEqual(s["req20_heavy_sessions_no_pr_share"], 0.5)
        self.assertEqual(s["req9_subagent_over_120min_share"], 0.5)


if __name__ == "__main__":
    unittest.main()
