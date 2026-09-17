#!/usr/bin/env python3
"""Scan Claude Code, Codex and omp data for skill/agent usage on THIS machine.

Usage:
  python scripts/usage-audit.py            # collect -> reports/data/usage-audit-<hostname>.json, then print merged tables
  python scripts/usage-audit.py --tables   # only merge every reports/data/usage-audit-*.json and print markdown tables

~/.claude syncs across machines but the usage data does not, so each machine writes its own JSON
into the repo and --tables merges them into the holistic view used by reports/usage-audit-*.md.

Sources:
  Claude  ~/.claude.json skillUsage (lifetime), ~/.claude/projects/*/*.jsonl (Agent/Skill tool calls)
  Codex   ~/.codex/sessions/**/*.jsonl (SKILL.md reads via read verbs, spawn_agent). Sessions whose cwd is
          ~/.claude are skipped: reading a skill while editing the skills repo is maintenance, not usage.
  omp     ~/.omp/agent/sessions/**/*.jsonl (read skill://, task tool)
  MCP     ~/.cache/claude-cli-nodejs/*/mcp-logs-*/*.jsonl (Linux/Mac) or
          ~/AppData/Local/claude-cli-nodejs/Cache/*/mcp-logs-*/*.jsonl (Windows): session census + "Calling MCP tool:" lines
"""
import collections
import datetime
import glob
import json
import os
import platform
import re
import subprocess
import sys

H = os.path.expanduser("~")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "reports", "data")
SKILL_PATH = re.compile(r"skills[/\\]+([\w-]+)[/\\]+SKILL\.md")
READ_VERB = re.compile(r"\b(cat|sed|head|tail|less|bat|type|Get-Content|gc)\b")


def jsonl(path):
    with open(path, encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def date_range(files):
    if not files:
        return None
    ts = [os.path.getmtime(f) for f in files]
    return {"files": len(files),
            "from": datetime.date.fromtimestamp(min(ts)).isoformat(),
            "to": datetime.date.fromtimestamp(max(ts)).isoformat()}


def claude():
    with open(f"{H}/.claude.json", encoding="utf-8") as fh:
        cj = json.load(fh)
    skill = {k: v["usageCount"] for k, v in cj.get("skillUsage", {}).items()}
    last = {k: datetime.datetime.fromtimestamp(v["lastUsedAt"] / 1000).date().isoformat()
            for k, v in cj.get("skillUsage", {}).items()}
    agent, skill_tool, sessions = collections.Counter(), collections.Counter(), set()
    files = glob.glob(f"{H}/.claude/projects/*/*.jsonl")
    for f in files:
        for d in jsonl(f):
            if d.get("type") != "assistant":
                continue
            for c in d.get("message", {}).get("content", []) or []:
                if not isinstance(c, dict) or c.get("type") != "tool_use":
                    continue
                sessions.add(d.get("sessionId"))
                inp = c.get("input") or {}
                if c["name"] in ("Agent", "Task"):
                    agent[inp.get("subagent_type", "?")] += 1
                elif c["name"] == "Skill":
                    skill_tool[inp.get("skill", "?")] += 1
    return skill, last, agent, skill_tool, {"transcripts": date_range(files), "sessions": len(sessions)}


def codex():
    skill, agent, months = collections.Counter(), collections.Counter(), collections.Counter()
    files = glob.glob(f"{H}/.codex/sessions/**/*.jsonl", recursive=True)
    for f in files:
        maintenance = False
        for d in jsonl(f):
            p = d.get("payload") or {}
            if d.get("type") == "session_meta":
                months[(p.get("timestamp") or d.get("timestamp") or "")[:7]] += 1
                maintenance = os.path.normpath(p.get("cwd") or "").endswith(".claude")
                continue
            if p.get("type") not in ("function_call", "custom_tool_call", "local_shell_call"):
                continue
            a = p.get("arguments") or p.get("input") or json.dumps(p.get("action", {}))
            if isinstance(a, dict):
                a = json.dumps(a)
            if not maintenance and READ_VERB.search(a) and not a.lstrip('{"command":').lstrip().startswith("git "):
                for m in SKILL_PATH.findall(a):
                    skill[m] += 1
            if p.get("name") == "spawn_agent":
                try:
                    agent[json.loads(p["arguments"]).get("agent_type") or "ad-hoc"] += 1
                except (json.JSONDecodeError, KeyError, TypeError):
                    agent["ad-hoc"] += 1
    return skill, agent, {"sessions": date_range(files), "sessions_by_month": dict(sorted(months.items()))}


def omp():
    skill, agent, months = collections.Counter(), collections.Counter(), collections.Counter()
    files = glob.glob(f"{H}/.omp/agent/sessions/**/*.jsonl", recursive=True)
    for f in files:
        base = os.path.basename(f)
        if re.match(r"\d{4}-\d{2}", base):  # main sessions are <ISO date>_<id>.jsonl; subagent logs are nested and named by task
            months[base[:7]] += 1
        for d in jsonl(f):
            m = d.get("message", {})
            if not isinstance(m.get("content"), list):
                continue
            for b in m["content"]:
                if not isinstance(b, dict) or b.get("type") != "toolCall":
                    continue
                n, a = b.get("name"), b.get("arguments") or {}
                if n == "read":
                    path = str(a.get("path", ""))
                    mm = re.match(r"skill://([\w-]+)", path) or SKILL_PATH.search(path)
                    if mm:
                        skill[mm.group(1)] += 1
                if n == "task":
                    for t in a.get("tasks") or [{"agent": a.get("agent")}]:
                        agent[(t or {}).get("agent") or a.get("agent") or "?"] += 1
    return skill, agent, {"sessions": date_range(files), "sessions_by_month": dict(sorted(months.items()))}


def claude_mcp():
    """Session census by month + MCP calls per server from Claude debug logs (skillopt tmp runs excluded)."""
    files = glob.glob(f"{H}/.cache/claude-cli-nodejs/*/mcp-logs-*/*.jsonl") + \
        glob.glob(f"{H}/AppData/Local/claude-cli-nodejs/Cache/*/mcp-logs-*/*.jsonl")
    sessions = collections.defaultdict(set)
    calls, started, active = collections.Counter(), collections.Counter(), collections.defaultdict(set)
    for f in files:
        if "skillopt" in f:
            continue
        server = f.replace("\\", "/").split("/")[-2].replace("mcp-logs-", "")
        started[server] += 1
        for d in jsonl(f):
            if d.get("sessionId"):
                sessions[d.get("timestamp", "")[:7]].add(d["sessionId"])
            m = re.match(r"Calling MCP tool: (\S+)", d.get("debug", ""))
            if m:
                calls[f"{server}:{m.group(1)}"] += 1
                active[server].add(d.get("sessionId"))
    return ({k: len(v) for k, v in sorted(sessions.items())},
            [{"server": s, "started": started[s], "active_sessions": len(active[s]),
              "calls": sum(v for k, v in calls.items() if k.startswith(s + ":"))} for s in started],
            dict(calls))


def added(rel):
    """First commit date of a path in this repo ('' if untracked)."""
    out = subprocess.run(["git", "-C", ROOT, "log", "--follow", "--format=%as", "--", rel], capture_output=True, text=True).stdout.split()
    return out[-1] if out else ""


def collect():
    c_skill, c_last, c_agent, c_skill_tool, c_meta = claude()
    x_skill, x_agent, x_meta = codex()
    o_skill, o_agent, o_meta = omp()
    census, mcp_servers, mcp_calls = claude_mcp()
    agents = sorted(f[:-3] for f in os.listdir(f"{ROOT}/agents") if f.endswith(".md"))
    skills = sorted(d for d in os.listdir(f"{ROOT}/skills") if os.path.isdir(f"{ROOT}/skills/{d}") and d != "synced")
    out = {
        "machine": platform.node(),
        "platform": platform.system(),
        "collected": datetime.date.today().isoformat(),
        "windows": {"claude": c_meta, "codex": x_meta, "omp": o_meta},
        "agents": [{"name": a, "claude": c_agent.get(a, 0), "omp": o_agent.get(a, 0), "codex": x_agent.get(a, 0),
                    "kb": round(os.path.getsize(f"{ROOT}/agents/{a}.md") / 1024, 1), "added": added(f"agents/{a}.md")} for a in agents],
        "skills": [{"name": s, "claude_life": c_skill.get(s, 0), "claude_last": c_last.get(s, ""),
                    "claude_skill_tool": c_skill_tool.get(s, 0),
                    "omp": o_skill.get(s, 0), "codex": x_skill.get(s, 0), "added": added(f"skills/{s}")} for s in skills],
        "other_agents_claude": {k: v for k, v in c_agent.items() if k not in agents},
        "other_agents_omp": {k: v for k, v in o_agent.items() if k not in agents},
        "other_skills_claude_tool": {k: v for k, v in c_skill_tool.items() if k not in skills},
        "codex_agents": dict(x_agent),
        "claude_sessions_by_month": census,
        "mcp_servers": sorted(mcp_servers, key=lambda r: -r["calls"]),
        "mcp_calls": mcp_calls,
    }
    os.makedirs(DATA, exist_ok=True)
    path = os.path.join(DATA, f"usage-audit-{out['machine']}.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1, sort_keys=True)
    print(f"wrote {path}")


def merged():
    runs = []
    for f in sorted(glob.glob(os.path.join(DATA, "usage-audit-*.json"))):
        with open(f, encoding="utf-8") as fh:
            runs.append(json.load(fh))
    return runs


def table(header, rows):
    print("| " + " | ".join(header) + " |")
    print("|" + "|".join("---:" if i else "---" for i in range(len(header))) + "|")
    for r in rows:
        print("| " + " | ".join(str(x) for x in r) + " |")
    print()


def tables():
    runs = merged()
    print("Machines: " + ", ".join(f"{r['machine']} ({r['platform']}, {r['collected']})" for r in runs) + "\n")

    agents = collections.defaultdict(lambda: collections.Counter())
    for r in runs:
        for a in r["agents"]:
            for k in ("claude", "omp", "codex"):
                agents[a["name"]][k] += a.get(k, 0)
            agents[a["name"]]["kb"] = a["kb"]
            agents[a["name"]]["added"] = a.get("added") or agents[a["name"]].get("added", "")
    rows = sorted(agents.items(), key=lambda kv: (-(kv[1]["claude"] + kv[1]["omp"] + kv[1]["codex"]), kv[0]))
    print(f"## Agents ({len(rows)})\n")
    table(["Agent", "Claude", "omp", "Codex", "Total", "KB", "Added"],
          [(n, c["claude"], c["omp"], c["codex"], c["claude"] + c["omp"] + c["codex"], c["kb"], c["added"]) for n, c in rows])
    never = [n for n, c in rows if c["claude"] + c["omp"] + c["codex"] == 0]
    print(f"Never spawned ({len(never)}): " + ", ".join(f"`{n}`" for n in never) + "\n")

    skills = collections.defaultdict(lambda: collections.Counter())
    last, added_on = {}, {}
    for r in runs:
        for s in r["skills"]:
            if s.get("added"):
                added_on[s["name"]] = s["added"]
            for k in ("claude_life", "claude_skill_tool", "omp", "codex"):
                skills[s["name"]][k] += s.get(k, 0)
            if s.get("claude_last"):
                last[s["name"]] = max(last.get(s["name"], ""), s["claude_last"])
    tot = lambda c: c["claude_life"] + c["omp"] + c["codex"]
    rows = sorted(skills.items(), key=lambda kv: (-tot(kv[1]), kv[0]))
    print(f"## Skills ({len(rows)})\n")
    table(["Skill", "Claude lifetime", "Claude last used", "omp reads", "Codex reads", "Total", "Added"],
          [(n, c["claude_life"], last.get(n, ""), c["omp"], c["codex"], tot(c), added_on.get(n, "")) for n, c in rows])
    never = [n for n, c in rows if tot(c) == 0]
    print(f"Never used ({len(never)}): " + ", ".join(f"`{n}`" for n in never) + "\n")

    for key in ("other_agents_claude", "other_agents_omp", "codex_agents", "other_skills_claude_tool"):
        c = collections.Counter()
        for r in runs:
            c.update(r.get(key, {}))
        if c:
            print(f"{key}: " + ", ".join(f"`{k}` {v}" for k, v in c.most_common()))
    print()

    months = collections.defaultdict(lambda: collections.Counter())
    for r in runs:
        for m, n in r["claude_sessions_by_month"].items():
            months[m]["claude"] += n
        for m, n in r["windows"]["omp"].get("sessions_by_month", {}).items():
            months[m]["omp"] += n
        for m, n in r["windows"]["codex"].get("sessions_by_month", {}).items():
            months[m]["codex"] += n
    print("## Sessions by month\n")
    table(["Month", "Claude", "omp", "Codex"], [(m, c["claude"], c["omp"], c["codex"]) for m, c in sorted(months.items()) if m])

    servers = collections.defaultdict(lambda: collections.Counter())
    for r in runs:
        for s in r["mcp_servers"]:
            for k in ("started", "active_sessions", "calls"):
                servers[s["server"]][k] += s[k]
    calls = collections.Counter()
    for r in runs:
        calls.update(r["mcp_calls"])
    top = lambda s: ", ".join(f"{k.split(':', 1)[1]} {v}" for k, v in calls.most_common() if k.startswith(s + ":"))[:120] or "-"
    print("## MCP servers (Claude)\n")
    table(["Server", "Sessions started in", "Sessions with calls", "Calls", "Top tools"],
          [(s, c["started"], c["active_sessions"], c["calls"], top(s))
           for s, c in sorted(servers.items(), key=lambda kv: -kv[1]["calls"])])


if __name__ == "__main__":
    if "--tables" not in sys.argv:
        collect()
    tables()
