#!/usr/bin/env python3
"""Scan Claude Code, Codex and omp data for skill/agent usage. Writes /tmp/usage-audit.json.

Sources:
  Claude  ~/.claude.json skillUsage (lifetime), ~/.claude/projects/*/*.jsonl (Agent/Skill tool calls)
  Codex   ~/.codex/sessions/**/*.jsonl (SKILL.md reads, spawn_agent)
  omp     ~/.omp/agent/sessions/**/*.jsonl (read skill://, task tool)
  MCP     ~/.cache/claude-cli-nodejs/*/mcp-logs-*/*.jsonl (Claude session census, "Calling MCP tool:" lines)
"""
import collections
import datetime
import glob
import json
import os
import re

H = os.path.expanduser("~")


def claude():
    cj = json.load(open(f"{H}/.claude.json"))
    skill = {k: v["usageCount"] for k, v in cj.get("skillUsage", {}).items()}
    last = {k: datetime.datetime.fromtimestamp(v["lastUsedAt"] / 1000).date().isoformat() for k, v in cj.get("skillUsage", {}).items()}
    agent = collections.Counter()
    for f in glob.glob(f"{H}/.claude/projects/*/*.jsonl"):
        for line in open(f, errors="ignore"):
            if '"tool_use"' not in line:
                continue
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            if d.get("type") != "assistant":
                continue
            for c in d.get("message", {}).get("content", []) or []:
                if isinstance(c, dict) and c.get("type") == "tool_use" and c["name"] in ("Agent", "Task"):
                    agent[(c.get("input") or {}).get("subagent_type", "?")] += 1
    return skill, last, agent


def codex():
    skill, agent = collections.Counter(), collections.Counter()
    for f in glob.glob(f"{H}/.codex/sessions/**/*.jsonl", recursive=True):
        for line in open(f, errors="ignore"):
            try:
                p = json.loads(line).get("payload", {}) or {}
            except json.JSONDecodeError:
                continue
            if p.get("type") not in ("function_call", "custom_tool_call", "local_shell_call"):
                continue
            a = p.get("arguments") or p.get("input") or json.dumps(p.get("action", {}))
            if isinstance(a, dict):
                a = json.dumps(a)
            for m in re.findall(r"skills/([\w-]+)/SKILL\.md", a):
                skill[m] += 1
            if p.get("name") == "spawn_agent":
                try:
                    agent[json.loads(p["arguments"]).get("agent_type") or "ad-hoc"] += 1
                except (json.JSONDecodeError, KeyError):
                    agent["ad-hoc"] += 1
    return skill, agent


def omp():
    skill, agent = collections.Counter(), collections.Counter()
    for f in glob.glob(f"{H}/.omp/agent/sessions/**/*.jsonl", recursive=True):
        for line in open(f, errors="ignore"):
            if '"toolCall"' not in line:
                continue
            try:
                m = json.loads(line).get("message", {})
            except json.JSONDecodeError:
                continue
            if not isinstance(m.get("content"), list):
                continue
            for b in m["content"]:
                if not isinstance(b, dict) or b.get("type") != "toolCall":
                    continue
                n, a = b.get("name"), b.get("arguments") or {}
                if n == "read":
                    path = str(a.get("path", ""))
                    mm = re.match(r"skill://([\w-]+)", path) or re.search(r"skills/([\w-]+)/SKILL\.md", path)
                    if mm:
                        skill[mm.group(1)] += 1
                if n == "task":
                    for t in a.get("tasks") or [{"agent": a.get("agent")}]:
                        agent[(t or {}).get("agent") or a.get("agent") or "?"] += 1
    return skill, agent


def claude_mcp():
    """Session census by month + MCP calls per server from Claude debug logs (skillopt tmp runs excluded)."""
    sessions = collections.defaultdict(set)
    calls, started, active = collections.Counter(), collections.Counter(), collections.defaultdict(set)
    for f in glob.glob(f"{H}/.cache/claude-cli-nodejs/*/mcp-logs-*/*.jsonl"):
        if "skillopt" in f:
            continue
        server = f.split("/")[-2].replace("mcp-logs-", "")
        started[server] += 1
        for line in open(f, errors="ignore"):
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
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


def main():
    c_skill, c_last, c_agent = claude()
    x_skill, x_agent = codex()
    o_skill, o_agent = omp()
    census, mcp_servers, mcp_calls = claude_mcp()
    agents = sorted(f[:-3] for f in os.listdir(f"{H}/.claude/agents"))
    skills = sorted(d for d in os.listdir(f"{H}/.claude/skills") if os.path.isdir(f"{H}/.claude/skills/{d}") and d != "synced")
    out = {
        "agents": [{"name": a, "claude_4d": c_agent.get(a, 0), "omp": o_agent.get(a, 0), "codex": x_agent.get(a, 0),
                    "kb": round(os.path.getsize(f"{H}/.claude/agents/{a}.md") / 1024, 1)} for a in agents],
        "skills": [{"name": s, "claude_life": c_skill.get(s, 0), "claude_last": c_last.get(s, ""),
                    "omp": o_skill.get(s, 0), "codex": x_skill.get(s, 0)} for s in skills],
        "other_agents_claude": {k: v for k, v in c_agent.items() if k not in agents},
        "other_agents_omp": {k: v for k, v in o_agent.items() if k not in agents},
        "codex_agents": dict(x_agent),
        "claude_sessions_by_month": census,
        "mcp_servers": sorted(mcp_servers, key=lambda r: -r["calls"]),
        "mcp_calls": mcp_calls,
    }
    json.dump(out, open("/tmp/usage-audit.json", "w"), indent=1)
    never_a = [r["name"] for r in out["agents"] if r["claude_4d"] + r["omp"] + r["codex"] == 0]
    never_s = [r["name"] for r in out["skills"] if r["claude_life"] + r["omp"] + r["codex"] == 0]
    print(f"agents never used: {len(never_a)}/{len(agents)}; skills never used: {len(never_s)}/{len(skills)}")
    print(f"claude sessions by month: {census}")
    print("wrote /tmp/usage-audit.json")


if __name__ == "__main__":
    main()
