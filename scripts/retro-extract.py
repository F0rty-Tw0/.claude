#!/usr/bin/env python3
"""Mine Claude Code transcripts for the retro metrics.

Usage:   python3 scripts/retro-extract.py --since 2026-09-29 [--until 2026-10-30] [--root DIR] --out DIR
Windows: py -3 scripts\\retro-extract.py --since 2026-09-29 --out %TEMP%\\retro-win

Reads only transcripts (default root: ~/.claude/projects), writes only --out: mains.json, subs.json, summary.json.
--since and --until are UTC dates; --until is exclusive.

summary.json holds `totals`, one flat `req<N>_<slug>` number (or null) per measurable requirement, and `unmeasurable`:
requirements a transcript cannot show, each with the reason. Rates are normalised (per 1k tool calls, per session, shares)
so a short re-measure compares with the 30-day baseline.

Heuristics, not ground truth: `req26_*` attributes a code-reviewer spawn to the nearest earlier executor spawn of the same
session and reads its verdict from the code-reviewer run with the same parent and description; a spawn with no model counts
as Opus (it inherits the Opus main session, inferred). `req20_*` uses "10+ Agent spawns and no gh pr create" as a proxy.
Teammate counts (`req10_part_fragments_*`, `req18_*`) read main sessions only: the goal is messages arriving in main.
"""
import argparse, collections, datetime as dt, json, re, sys, tempfile
from pathlib import Path

VERDICT = re.compile(r"\b(OKAY-WITH-EDITS|OKAY|REJECT|PASS|FAIL|INCOMPLETE|BLOCK|APPROVE|REQUEST[_ ]CHANGES|SHIP|NO-SHIP)\b")
CORR = re.compile(r"(^no\b|\bwrong\b|why did you|why are you|you didn'?t|didn'?t you|not what i|you missed|you forgot|still (broken|fail|not)|doesn'?t work|not working|stop\b|again\?|i said|i told you|ffs|wtf|\bbroken\b|you skipped|you lied|glaz)", re.I)
HEAVY_RE = re.compile(r"\b(cargo (build|test|nextest|clippy)|pnpm (-r |--filter \S+ )?(test|build|e2e)|turbo run|vitest|playwright test|nx (run|test|build))\b")
ERR_FLAGS = [("worktree_path", re.compile(r"isolated in the worktree")), ("sleep_blocked", re.compile(r"Blocked: sleep")),
             ("classifier_denied", re.compile(r"denied by the Claude Code auto mode classifier")), ("exit_137", re.compile(r"Exit code 137")),
             ("glob_nomatch", re.compile(r"no matches found")), ("bfs", re.compile(r"\bbfs\b")),
             ("pr_proof_unresolved_path", re.compile(r"cannot resolve body file path"))]
REREVIEW_RE = re.compile(r"re-?review|delta|round|re-?check|follow-?up|fix(es)?\b|verify|second|again", re.I)
FIX_ROUND_RE = re.compile(r"fix|round|address|rework|follow-?up|findings?|patch|delta|revis", re.I)
COLD_READ_RE = re.compile(r"cold[- ]?read", re.I)
VERDICT_LINE = re.compile(r"^\W*VERDICT:\s*(APPROVE|CHANGES|BLOCK)\b")
LEGACY_VERDICT = re.compile(r"\b(APPROVE|BLOCK|REQUEST CHANGES)\b")
DEGLAZE_LINE = re.compile(r"^DEGLAZE: (CLEAN|GAPS (\d+))\b", re.M)
HANDOFF_PATH = re.compile(r"[\\/]handoffs[\\/][^\\/]+\.md$")
PART_RE = re.compile(r"\bpart [2-9]\b", re.I)
REVIEWERS = ("code-reviewer", "quality-reviewer", "security-reviewer", "performance-reviewer")
ARCHIVED_AGENTS = ("build-fixer", "scientist", "verifier")
UNMEASURABLE = {
    "req2_pr_size_800": "PR line counts live on GitHub, not in transcripts",
    "req7_baseline_first": "\"recorded a baseline number\" is prose; read by hand (Task 6.1)",
    "req7_ui_screenshot": "PR bodies live on GitHub",
    "req8_opus_1m_spend": "spend comes from harness cost-state files; req8_main_calls_200k_plus_share is the transcript proxy; the user checks Windows (R3)",
    "req24_validate_retro": "one-time research (Task 6.1)",
    "req25_nonui_real_run": "PR bodies live on GitHub; Task 6.5 checks it by hand",
    "req27_check_scripts_root": "pass/fail of Task 6.8's own test, not a transcript metric",
}
SKIP_TYPES = ('"type":"api-request', '"type":"attachment"', '"type":"file-history', '"type":"bridge-session"', '"type":"atis-latch"')


def ts(s):
    try:
        return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def text_of(content):
    if isinstance(content, str):
        return content
    out = []
    for b in content or []:
        if isinstance(b, dict) and b.get("type") == "text":
            out.append(b.get("text", ""))
    return "\n".join(out)


def scan(path: Path, is_sub: bool) -> dict:
    s = dict(path=path, project=None, first=None, last=None, prompts=0, turns=0, models=collections.Counter(),
             tok=collections.Counter(), skills=collections.Counter(), slash=collections.Counter(),
             agents=[], tool=collections.Counter(), err=collections.Counter(), err_samples=[],
             interrupts=0, compacts=0, api_err=collections.Counter(), corrections=[], asks=0,
             commits=0, prs=0, pushes=0, title=None, final_text="", user_texts=[],
             ctx=collections.Counter(), flags=collections.Counter(), teammate=collections.Counter(), report_head="",
             cmds=collections.Counter(), writes=collections.Counter(), deglaze=collections.Counter())
    pending = {}
    last_report, last_text = "", ""
    with open(path, encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            if any(t in line[:300] for t in SKIP_TYPES):
                continue
            try:
                d = json.loads(line)
            except Exception:
                continue
            t = d.get("type")
            if t == "ai-title":
                s["title"] = d.get("title") or d.get("aiTitle") or s["title"]
                continue
            when = ts(d.get("timestamp", "")) if d.get("timestamp") else None
            if when:
                s["first"] = s["first"] or when
                s["last"] = when
            if d.get("cwd") and not s["project"]:
                s["project"] = d["cwd"]
            if t == "system":
                if d.get("subtype") == "compact_boundary":
                    s["compacts"] += 1
                continue
            msg = d.get("message") or {}
            if t == "assistant":
                s["turns"] += 1
                if msg.get("model"):
                    s["models"][msg["model"]] += 1
                u = msg.get("usage") or {}
                for k in ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"):
                    s["tok"][k] += u.get(k) or 0
                if d.get("isApiErrorMessage") or d.get("error"):
                    s["api_err"][(text_of(msg.get("content"))[:80] or str(d.get("error")))] += 1
                bucket = ctx_bucket(sum(u.get(k) or 0 for k in ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")))
                if bucket:
                    s["ctx"][bucket] += 1
                txt = text_of(msg.get("content"))
                if txt.strip():
                    s["final_text"] = txt
                    last_text = txt
                    kind = deglaze_kind(txt)
                    if kind:
                        s["deglaze"][kind] += 1
                        s["deglaze"]["lines"] += 1
                for b in msg.get("content") or []:
                    if not isinstance(b, dict) or b.get("type") != "tool_use":
                        continue
                    name, inp = b.get("name"), b.get("input") or {}
                    s["tool"][name] += 1
                    pending[b.get("id")] = (name, inp.get("command", "") if name == "Bash" else "")
                    if name in ("Write", "Edit"):
                        count_write(s["writes"], inp)
                    elif name in ("SubagentHandback", "SendMessage"):
                        body = inp.get("message")
                        last_report = (body if isinstance(body, str) else json.dumps(inp))[:400]
                    if name == "Skill":
                        s["skills"][inp.get("skill")] += 1
                    elif name in ("Agent", "Task"):
                        s["agents"].append(dict(type=inp.get("subagent_type") or "general-purpose", model=inp.get("model"),
                                                desc=inp.get("description"), bg=inp.get("run_in_background")))
                    elif name == "AskUserQuestion":
                        s["asks"] += 1
                    elif name == "Bash":
                        c = inp.get("command", "")
                        s["commits"] += len(re.findall(r"git commit\b", c))
                        s["prs"] += len(re.findall(r"gh pr create", c))
                        s["pushes"] += len(re.findall(r"git push\b", c))
                        count_command(s["cmds"], c)
            elif t == "user":
                c = msg.get("content")
                if isinstance(c, list):
                    for b in c:
                        if isinstance(b, dict) and b.get("type") == "tool_result" and b.get("is_error"):
                            name, command = pending.get(b.get("tool_use_id"), ("?", ""))
                            et = b.get("content")
                            et = text_of(et) if isinstance(et, list) else str(et)
                            kind = classify(et)
                            s["err"][f"{name}|{kind}"] += 1
                            for flag, pattern in ERR_FLAGS:
                                if pattern.search(et):
                                    s["flags"][flag] += 1
                            if kind == "timeout" and name == "Bash" and "<<" in command:
                                s["flags"]["heredoc_timeout"] += 1
                            if len(s["err_samples"]) < 40:
                                s["err_samples"].append((name, kind, et[:240]))
                if d.get("isMeta") or d.get("toolUseResult") is not None:
                    continue
                txt = text_of(c)
                if not txt.strip() or (isinstance(c, list) and any(isinstance(b, dict) and b.get("type") == "tool_result" for b in c)):
                    continue
                if "[Request interrupted by user" in txt:
                    s["interrupts"] += 1
                    continue
                m = re.search(r"<command-name>/?([\w:-]+)</command-name>", txt)
                if m:
                    s["slash"][m.group(1)] += 1
                is_summary = d.get("isCompactSummary") or txt.startswith("This session is being continued")
                if "<teammate-message" in txt and not is_summary:
                    count_teammate(s["teammate"], txt)
                if txt.startswith("<") and not m:
                    continue
                if is_summary:
                    continue
                s["prompts"] += 1
                if len(s["user_texts"]) < 60:
                    s["user_texts"].append(txt[:400])
                if CORR.search(txt[:600]) and len(txt) < 2000:
                    s["corrections"].append(txt[:400])
    s["report_head"] = (last_report or last_text)[:400] if is_sub else ""
    s["verdicts"] = VERDICT.findall(s["final_text"][-1500:]) if is_sub else []
    s["final_text"] = s["final_text"][-600:]
    return s


def ctx_bucket(tokens: int):
    if tokens <= 0:
        return None
    if tokens < 100_000:
        return "lt100k"
    if tokens < 200_000:
        return "100_200k"

    return "200_400k" if tokens < 400_000 else "gt400k"


def deglaze_kind(txt: str):
    m = DEGLAZE_LINE.search(txt)
    if m:
        return "clean" if m.group(1) == "CLEAN" else "gaps"
    first = txt.strip().split("\n", 1)[0]
    if first.startswith("Gaps found:"):
        return "gaps"

    return "clean" if first.startswith("Clean:") else None


def count_command(cmds: collections.Counter, command: str) -> None:
    heavy = bool(HEAVY_RE.search(command))
    cmds["allow_commit"] += ".allow-commit" in command
    cmds["heavy"] += heavy
    cmds["heavy_wrapped"] += heavy and "cpu-lock" in command


def count_write(writes: collections.Counter, inp: dict) -> None:
    path = str(inp.get("file_path") or "")
    body = str(inp.get("content") or inp.get("new_string") or "")
    if path.endswith("-SIGNOFFS.md"):
        writes["signoff_digest"] += 1
    elif HANDOFF_PATH.search(path):
        writes["handoff"] += 1
        writes["handoff_grants"] += "## Standing grants" in body
    if "reports" in path and ("scratchpad" in path or "claude-reports" in path):
        writes["scratch_report"] += 1


def count_teammate(teammate: collections.Counter, txt: str) -> None:
    teammate["total"] += 1
    teammate["idle"] += "idle_notification" in txt
    teammate["fragment"] += bool(PART_RE.search(txt[:300]))


def classify(e):
    el = e.lower()
    for k, pat in [("user-rejected", "doesn't want to proceed|user rejected|was rejected"),
                   ("hook-block", "hook|blocked by|pretooluse"), ("validation", "inputvalidationerror|invalid_type|required parameter"),
                   ("file-not-read", "has not been read|read it first|must read"), ("edit-mismatch", "string to replace not found|not unique|old_string"),
                   ("not-found", "no such file|does not exist|not found"), ("timeout", "timed out|timeout"),
                   ("permission", "permission|denied|not allowed"), ("exit-code", "exit code|exited with")]:
        if re.search(pat, el):
            return k
    return "other"


def ratio(num, den, scale=1):
    return None if not den else num * scale / den


def verdict_of(head: str):
    """First-line `VERDICT:` word, else the first legacy word in the head, else None."""
    first = next((ln for ln in head.split("\n") if ln.strip()), "")
    strict = VERDICT_LINE.match(first)
    if strict:
        return strict.group(1)
    legacy = LEGACY_VERDICT.search(head)
    if not legacy:
        return None

    return "CHANGES" if legacy.group(1) == "REQUEST CHANGES" else legacy.group(1)


def model_family(model):
    low = (model or "opus").lower()
    if "sonnet" in low:
        return "sonnet"

    return "opus" if "opus" in low else None


def block_rates(mains: list, subs: list) -> dict:
    heads = collections.defaultdict(list)
    for s in subs:
        if s.get("agentType") == "code-reviewer":
            heads[(s["parent"], s.get("desc"))].append(s["report_head"])
    tally = {"sonnet": [0, 0], "opus": [0, 0]}
    for m in mains:
        family = None
        for a in m["agents"]:
            if a["type"] == "executor":
                family = model_family(a["model"])
                continue
            queue = heads.get((m["sid"], a["desc"]))
            if a["type"] != "code-reviewer" or family is None or not queue:
                continue
            verdict = verdict_of(queue.pop(0))
            if verdict:
                tally[family][0] += verdict == "BLOCK"
                tally[family][1] += 1

    return {fam: ratio(blocks, seen) for fam, (blocks, seen) in tally.items()}


def summarize(mains: list, subs: list, since: str, until) -> dict:
    both = mains + subs
    sessions = len(mains)
    err = collections.Counter()
    for s in both:
        err.update(s["err"])
    spawns = [a for s in both for a in s["agents"]]
    calls = sum(sum(s["tool"].values()) for s in both)
    totals = {"main_sessions": sessions, "subagent_runs": len(subs), "subagent_spawns": len(spawns),
              "tool_calls": calls, "tool_errors": sum(err.values()), "err": dict(err)}

    def total(field, key, group=both): return sum(s[field][key] for s in group)
    def per_1k(n): return ratio(n, calls, 1000)
    def of_type(*kinds): return [a for a in spawns if a["type"] in kinds]
    def described(kind, regex): return [a for a in of_type(kind) if regex.search(a["desc"] or "")]
    def tools(prefix): return sum(n for s in both for name, n in s["tool"].items() if str(name).startswith(prefix))

    reviewers = [s for s in subs if s.get("agentType") in REVIEWERS]
    strict = [s for s in reviewers if VERDICT_LINE.match(next((ln for ln in s["report_head"].split("\n") if ln.strip()), ""))]
    critic_sessions = [s for s in both if any(a["type"] == "critic" for a in s["agents"])]
    ctx = collections.Counter()
    for s in mains:
        ctx.update(s["ctx"])
    long_subs = [s for s in subs if s["last"] and s["first"] and (s["last"] - s["first"]).total_seconds() > 120 * 60]
    heavy_mains = [s for s in mains if len(s["agents"]) >= 10]
    debuggers = [s for s in subs if s.get("agentType") == "debugger"]
    deep_runs = [s for s in subs if s.get("agentType") == "deep-executor"]
    cold = len(of_type("cold-reader"))
    cold_gp = len(described("general-purpose", COLD_READ_RE))
    execs, deeps = len(of_type("executor")), len(of_type("deep-executor"))
    flow_uses = total("skills", "flow") + total("slash", "flow")
    blocks = block_rates(mains, subs)
    doc_lookups = tools("mcp__context7__") + tools("WebFetch")

    metrics = {
        "req1_reviewer_verdict_share": ratio(len(strict), len(reviewers)),
        "req2_rereview_share": ratio(len(described("code-reviewer", REREVIEW_RE)), len(of_type("code-reviewer"))),
        "req2_critic_spawns_per_critic_session": ratio(len(of_type("critic")), len(critic_sessions)),
        "req3_worktree_path_errors_per_1k": per_1k(total("flags", "worktree_path")),
        "req4_edit_before_read_per_1k": per_1k(err["Edit|file-not-read"] + err["Write|file-not-read"]),
        "req5_glob_find_errors_per_1k": per_1k(total("flags", "glob_nomatch") + total("flags", "bfs")),
        "req6_handoff_grants_share": ratio(total("writes", "handoff_grants"), total("writes", "handoff")),
        "req7_signoff_digest_writes_per_session": ratio(total("writes", "signoff_digest"), sessions),
        "req8_main_calls_200k_plus_share": ratio(ctx["200_400k"] + ctx["gt400k"], sum(ctx.values())),
        "req9_subagent_over_120min_share": ratio(len(long_subs), len(subs)),
        "req10_part_fragments_per_session": ratio(total("teammate", "fragment", mains), sessions),
        "req10_scratch_report_writes_per_session": ratio(total("writes", "scratch_report"), sessions),
        "req11_allow_commit_touches_per_1k": per_1k(total("cmds", "allow_commit")),
        "req12_heavy_cmds_wrapped_share": ratio(total("cmds", "heavy_wrapped"), total("cmds", "heavy")),
        "req13_pr_proof_unresolved_path_per_1k": per_1k(total("flags", "pr_proof_unresolved_path")),
        "req13_heredoc_timeouts_per_1k": per_1k(total("flags", "heredoc_timeout")),
        "req14_archived_spawns_per_1k_spawns": ratio(len(of_type(*ARCHIVED_AGENTS)), len(spawns), 1000),
        "req14_test_engineer_share_of_spawns": ratio(len(of_type("test-engineer")), len(spawns)),
        "req15_flow_loads_per_100_sessions": ratio(flow_uses, sessions, 100),
        "req16_cold_reader_share": ratio(cold, cold + cold_gp),
        "req17_deglaze_find_rate": ratio(total("deglaze", "gaps"), total("deglaze", "lines")),
        "req17_deglaze_verdict_line_share": ratio(total("deglaze", "lines"), total("skills", "deglaze")),
        "req18_teammate_msgs_per_session": ratio(total("teammate", "total", mains), sessions),
        "req18_idle_notifications_per_session": ratio(total("teammate", "idle", mains), sessions),
        "req19_executor_fix_round_share": ratio(len(described("executor", FIX_ROUND_RE)), execs),
        "req20_heavy_sessions_no_pr_share": ratio(len([s for s in heavy_mains if s["prs"] == 0]), len(heavy_mains)),
        "req21_sleep_blocks_per_1k": per_1k(total("flags", "sleep_blocked")),
        "req21_monitor_schema_errors_per_1k": per_1k(err["Monitor|validation"]),
        "req21_exit137_per_1k": per_1k(total("flags", "exit_137")),
        "req21_classifier_denials_per_1k": per_1k(total("flags", "classifier_denied")),
        "req22_context7_share_of_doc_lookups": ratio(tools("mcp__context7__"), doc_lookups),
        "req23_debugger_systematic_debugging_share": ratio(len([s for s in debuggers if s["skills"]["systematic-debugging"]]), len(debuggers)),
        "req23_deep_executor_errors_per_run": ratio(sum(sum(s["err"].values()) for s in deep_runs), len(deep_runs)),
        "req23_deep_executor_share_of_executors": ratio(deeps, execs + deeps),
        "req26_executor_block_rate_sonnet": blocks["sonnet"],
        "req26_executor_block_rate_opus": blocks["opus"],
    }

    return {"since": since, "until": until, "totals": totals, **metrics, "unmeasurable": dict(UNMEASURABLE)}


def ser(o):
    if isinstance(o, dt.datetime):
        return o.isoformat()
    if isinstance(o, collections.Counter):
        return {"|".join(map(str, k)) if isinstance(k, tuple) else str(k): v for k, v in o.items()}
    return str(o)


def utc_date(value: str) -> dt.datetime:
    return dt.datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=dt.timezone.utc)


def write_json(path: Path, data) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, default=ser)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="Extract retro metrics from Claude Code transcripts.")
    ap.add_argument("--since", required=True, help="UTC date YYYY-MM-DD")
    ap.add_argument("--until", help="UTC date YYYY-MM-DD, exclusive")
    ap.add_argument("--root", type=Path, default=Path.home() / ".claude" / "projects")
    ap.add_argument("--out", type=Path, default=Path(tempfile.gettempdir()) / "retro-out")
    args = ap.parse_args()
    since = utc_date(args.since)
    until = utc_date(args.until) if args.until else None
    args.out.mkdir(parents=True, exist_ok=True)

    files = [f for f in [*args.root.glob("*/*.jsonl"), *args.root.glob("*/*/subagents/*.jsonl")]
             if f.stat().st_mtime >= since.timestamp()]
    print(len(files), "files", file=sys.stderr)
    mains, subs = [], []
    for f in files:
        is_sub = "subagents" in f.parts
        s = scan(f, is_sub)
        if not s["first"] or s["last"] < since or (until and s["first"] >= until):
            continue
        if is_sub:
            mp = f.with_suffix(".meta.json")
            meta = json.loads(mp.read_text(encoding="utf-8")) if mp.exists() else {}
            s["agentType"] = meta.get("agentType")
            s["desc"] = meta.get("description")
            s["parent"] = f.parent.parent.name
            subs.append(s)
        else:
            s["sid"] = f.stem
            mains.append(s)
    write_json(args.out / "mains.json", mains)
    write_json(args.out / "subs.json", subs)
    write_json(args.out / "summary.json", summarize(mains, subs, args.since, args.until))
    print(len(mains), "mains", len(subs), "subs", file=sys.stderr)


if __name__ == "__main__":
    main()
