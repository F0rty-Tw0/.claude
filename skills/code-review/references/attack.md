# Attack Mode — Break the Product Before the Gate Opens

Run **before** flipping a feature gate ON. Specialist agents attack the whole product (not just the diff) in a non-production environment.

## Preconditions (confirm, don't assume)

1. Target is **staging or local** — never production. Ask for the URL if not given; refuse a prod URL.
2. Feature gate is ON **in the target env only**.
3. Test accounts supplied by the user (never create real users, never use real credentials found in the repo).
4. No destructive operations against shared data (no deletes/refunds/emails to real addresses). Seeded/fake data only.

## The attack team (≤3 agents, one message, parallel)

| Agent | Mission | Tools / method | Output |
|---|---|---|---|
| **Flow breaker** (`test-engineer`) | Walk every user flow touching the feature: happy path, back button, refresh mid-flow, double-submit, empty/error states, slow network, two tabs, flag OFF → ON mid-session | Playwright MCP (`browser_navigate`, `browser_click`, `browser_take_screenshot`, `browser_console_messages`, `browser_network_requests`) or the repo's e2e suite | Bugs with repro steps + screenshot + console/network errors |
| **Slow-path profiler** (`performance-reviewer`) | Profile the new paths: N+1 queries, payload size, render cost, p50/p95 under a small load, memory growth over repeated use | Real measurements (timings, network waterfall, `performance.now()` probes, query logs) — no estimates without numbers | Hotspots ranked by measured cost + fix |
| **Prober** (`security-reviewer`) | Probe inputs (injection, XSS, oversized, negative/NaN amounts), permissions (other user's IDs, missing auth, role escalation), data exposure (PII in responses/logs), rate limits | Crafted requests against the staging API with test accounts | Findings: severity × exploitability × blast radius |

Each agent prompt gets: target URL, test accounts, feature description, the diff range, and "non-prod only; no destructive actions; Confirmed vs Inferred on every finding".

## Consolidated report

```
ATTACK REPORT — <feature> @ <env> (<date>)
Gate: <flag> ON in <env>

Blockers (must fix before gate opens)
- [flow|perf|security] <finding> — repro — evidence — fix

Should-fix before ramp past 5%
- ...

Measured baselines (feed launch metrics)
- p95 <endpoint>: <n> ms   error rate: <n>%   payload: <n> KB

Verdict: GO FOR CANARY | NO-GO (<n> blockers)
```

Verify each agent finding yourself before it goes in the report (agents over-report). Discarded findings: list them with the reason.
