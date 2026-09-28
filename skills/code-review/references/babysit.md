# Babysit Mode — Agent Watches the PR, Human Makes Decisions

Automates the tedious loop: CI red → read log → fix → rerun. Pings the human only for decisions.

**Hard limits (user's commit-guard law):** fix in the **local working tree only**. Never `git commit`, never `git push`, never reply to / resolve review threads, never approve, never merge. The human commits and pushes.

## Start

Run on the PR branch, checked out locally, clean or with only babysit fixes pending.

```
/loop 1h /code-review babysit <PR#>
```

Use a fixed 1h interval, or omit the interval to self-pace (CI usually needs 5–15 min; wake ~10 min after the last push). Needs `gh auth status` OK.

## Each tick

1. **Snapshot state**
   ```bash
   gh pr view <PR#> --json headRefOid,statusCheckRollup,reviewDecision,mergeable,isDraft
   gh pr checks <PR#>
   git status --porcelain            # are my previous fixes still uncommitted?
   ```
2. **Pending local fixes not yet pushed?** → do not stack more. Report "N fixes waiting in working tree since <time>" and end the tick.
3. **New commits since last tick?** → `git fetch origin` first, then run a **delta review** (SKILL.md review mode, scoped to `git diff <last-reviewed-sha>..<headRefOid>` — the remote head, not the local checkout, which may be stale). Record the new reviewed SHA in the tick summary.
4. **Failing checks** → for each: `gh run view <run-id> --log-failed | tail -100`. Classify:

| Class | Examples | Action |
|---|---|---|
| **Mechanical, high-confidence** | lint/format errors, import order, obvious type error with one fix, snapshot needing update **only** where the diff intended the UI change | Fix locally, run the same check locally, leave uncommitted |
| **Infra flake** | runner timeout, network fetch failure, known flaky test passing on retry history Do NOT rerun (it is a remote action on shared CI). Put the exact `gh run rerun <run-id> --failed` command in the tick summary for the human |
| **Real failure** | assertion failure in a test related to the diff, build break with several possible fixes | Do NOT fix. Diagnose root cause, write it up, ping the human |
| **Ambiguous / judgment** | reviewer asked for a design change, conflicting requirements, security finding | Ping the human with 2–3 options + recommendation |

5. **New human review comments** → summarize each with a proposed response or fix. Do not post anything.
6. **Tick summary** (one block, scannable): reviewed SHA, checks (pass/fail/pending counts), fixes applied locally (files), reruns suggested, decisions needed.

## Stacks (`meaningful-prs`)

Babysit the whole stack: `/loop 1h /code-review babysit <n1> <n2> <n3>`. Each tick, per PR, also check:

- **Parent merged?** (`gh pr view <parent> --json state`) → the child needs retarget + restack. Don't switch branches or push — ping with the exact commands from `meaningful-prs` `references/mechanics.md` ("Parent squash-merged"). Until restacked, the child's diff still shows the parent's content.
- **Parent got new commits?** → the child is behind its base; list it as "restack needed" in the tick summary.
- Delta review per PR: `<last-reviewed-sha>..<headRefOid>` of that PR (after `git fetch`). `gh pr diff <n>` is the full view against that PR's own base.
- Local fixes go only on the checked-out PR's branch. Other PRs in the stack: report, don't touch.

## Pinging

Use `PushNotification` (load via `ToolSearch("select:PushNotification")`) only when a human decision is needed or the PR is ready. Everything else goes in the tick summary.

## Stop conditions

Stop the loop (`ScheduleWakeup` with `stop: true`, or tell the user to cancel the cron) when:

- All checks green + no unresolved review threads + no pending local fixes → report **"merge-ready — human decision"** with the final review verdict.
- PR merged or closed.
- Same failure persists across 3 ticks after a fix → stop, escalate (the fix is wrong; re-plan).
- Working tree has changes that are **not** babysit fixes → stop; never mix with the user's in-progress work.
