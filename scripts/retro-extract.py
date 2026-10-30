#!/usr/bin/env python3
"""Mine Claude Code transcripts for the retro metrics.

Usage:   python3 scripts/retro-extract.py --since 2026-09-29 [--until 2026-10-30] [--root DIR] --out DIR
Windows: py -3 scripts\\retro-extract.py --since 2026-09-29 --out %TEMP%\\retro-win

Reads only transcripts (default root: ~/.claude/projects), writes only --out: mains.json, subs.json, summary.json.
--since and --until are UTC dates; --until is exclusive.
"""
import argparse, collections, datetime as dt, json, re, sys, tempfile
from pathlib import Path

VERDICT = re.compile(r"\b(OKAY-WITH-EDITS|OKAY|REJECT|PASS|FAIL|INCOMPLETE|BLOCK|APPROVE|REQUEST[_ ]CHANGES|SHIP|NO-SHIP)\b")
CORR = re.compile(r"(^no\b|\bwrong\b|why did you|why are you|you didn'?t|didn'?t you|not what i|you missed|you forgot|still (broken|fail|not)|doesn'?t work|not working|stop\b|again\?|i said|i told you|ffs|wtf|\bbroken\b|you skipped|you lied|glaz)", re.I)
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
             commits=0, prs=0, pushes=0, title=None, final_text="", user_texts=[])
    pending = {}
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
                txt = text_of(msg.get("content"))
                if txt.strip():
                    s["final_text"] = txt
                for b in msg.get("content") or []:
                    if not isinstance(b, dict) or b.get("type") != "tool_use":
                        continue
                    name, inp = b.get("name"), b.get("input") or {}
                    s["tool"][name] += 1
                    pending[b.get("id")] = name
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
            elif t == "user":
                c = msg.get("content")
                if isinstance(c, list):
                    for b in c:
                        if isinstance(b, dict) and b.get("type") == "tool_result" and b.get("is_error"):
                            name = pending.get(b.get("tool_use_id"), "?")
                            et = b.get("content")
                            et = text_of(et) if isinstance(et, list) else str(et)
                            kind = classify(et)
                            s["err"][f"{name}|{kind}"] += 1
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
                if txt.startswith("<") and not m:
                    continue
                if d.get("isCompactSummary") or txt.startswith("This session is being continued"):
                    continue
                s["prompts"] += 1
                if len(s["user_texts"]) < 60:
                    s["user_texts"].append(txt[:400])
                if CORR.search(txt[:600]) and len(txt) < 2000:
                    s["corrections"].append(txt[:400])
    s["verdicts"] = VERDICT.findall(s["final_text"][-1500:]) if is_sub else []
    s["final_text"] = s["final_text"][-600:]
    return s


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


def summarize(mains: list, subs: list, since: str, until) -> dict:
    err = collections.Counter()
    for s in mains + subs:
        err.update(s["err"])
    totals = {"main_sessions": len(mains), "subagent_runs": len(subs),
              "tool_calls": sum(sum(s["tool"].values()) for s in mains + subs),
              "tool_errors": sum(err.values()), "err": dict(err)}
    return {"since": since, "until": until, "totals": totals, "unmeasurable": {}}


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
