# Archive

Agents and skills moved out of `agents/` and `skills/` on 2026-09-18 because the usage audit
(`reports/usage-audit-2026-09-17.md`) found ≤2 uses across all tools and machines in 3+ months.

Nothing here is loaded by Claude Code, Codex or omp. To restore one: `git mv archive/skills/<name> skills/<name>`
(or `archive/agents/<name>.md agents/`), then re-add any references the audit report lists as removed.

Re-run `python scripts/usage-audit.py` before archiving more.

2026-10-29: `build-fixer`, `scientist`, `verifier` (agents) and `using-agentic-mcp`, `rdx-audit` (skills) archived after the Oct 2026 retro (0-1 uses in 30 days on two machines). Restore as above.
