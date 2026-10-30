# Babysit Mode — Agent Watches the PR, Human Makes Decisions

Automates the tedious loop: CI red → read log → fix → rerun. Pings the human only for decisions.

**Hard limits (AGENTS.md: commit or push only when the user asks):** fix in the **local working tree only**. Never `git commit`, never `git push`, never reply to / resolve review threads, never approve, never merge. The human commits and pushes.

## Start

Run on the PR branch, checked out locally, clean or with only babysit fixes pending.

```
/loop /code-review babysit <PR#> [<PR#>...]
/loop /code-review babysit --report-only <PR#> [<PR#>...]
```

Self-paced (no interval), one loop for the whole set of PRs. Needs `gh auth status` OK.

Ticks are event-driven: a background watcher blocks until a PR head's checks finish, and its exit re-invokes the loop within seconds. A 30-minute fallback wake covers a lost watcher and catches new review comments after CI is done.

**Watcher.** One background Bash job (`run_in_background: true`) per PR head:

```bash
node ~/.claude/skills/code-review/scripts/watch-pr-checks.mjs <PR#> <SHA> "$(git rev-parse --show-toplevel)/.claude/local/babysit/jobs/<PR#>-watch-<SHA>.exit"
```

`<SHA>` is the PR's `headRefOid` read at tick time. The script waits up to 10 min for checks to register on that head, then runs `gh pr checks --watch --fail-fast`. It writes its exit code to the exit file and exits with it, so a lost notification can still be read from the file. This section is the watcher contract; `flow --stacked` (`flow/references/stacked.md` Watcher) reuses it and lists only its differences.

| Exit | Meaning | Tick action |
|---|---|---|
| 0 | all checks passed | merge-ready check |
| 1 | a check failed (`--fail-fast`: others may still run), or another `gh` failure | `gh pr checks <PR#> --json name,bucket`: a `fail` bucket → classify (step 4); none → "watcher error" |
| 3 | head is `<SHA>` but no CI registered | report "no CI", mark the PR `final`, no more watchers for this PR |
| 5 | head never became `<SHA>` within 10 min | report "push not visible"; the next tick reads the results; still pending → one re-arm on the same head with `--no-fail-fast` |
| 7 | a check was cancelled, none failed | Infra flake (step 4): put `gh run rerun <run-id>` in the tick summary for the human |
| 2, 4, 6 | `gh` interrupted / auth / error while waiting, or a script crash (6) | report "watcher error"; the next tick reads the results; still pending → one re-arm on the same head with `--no-fail-fast` |
| 64 | usage error | report "watcher error"; fix the command |

- **One watcher per head SHA.** Start one only when the head differs from the state file's `watchedSha`. **Exception:** at most one re-arm on the same head, with `--no-fail-fast`, recorded in `rearmedSha`: for a watcher that exited with checks still pending, or one launched in another session with no recorded exit. The re-arm sets `watcherExit: null`, records the new `watcherTaskId` and `watcherAt`, and writes the `-r` exit file (`<PR#>-watch-<SHA>-r.exit` next to the first one).
- **Running watcher** = launched under the current session id less than 2 h ago (`watcherAt`), with no exit file and no recorded exit. After a re-arm the exit file that counts is the `-r` one (only when `rearmedSha` = `<SHA>`); the first watcher's plain file is stale.
- Unattended runs (`claude -p`, cloud) kill background commands after 30 min–2 h, so there the fallback tick is the real signal, and a watcher launched over 2 h ago counts as dead.
- **Wake vs event tick.** A wake tick (started by the loop's own prompt) always reschedules the fallback (the wake that fired was the pending one); an event tick (watcher exit, user message) inside an active loop reschedules only if `fallbackAt` is unset or past; no active loop (`loop` ≠ `"active"`) → never. A turn carrying both the loop prompt and a task notification counts as a wake tick. A second `ScheduleWakeup` call replaces the pending one, so rescheduling on every event would keep pushing the fallback out.

### State

`.claude/local/babysit/<PR#>.json` in the project root, written by every tick:

```json
{ "sessionId": "...", "loop": "active", "watchedSha": "...", "rearmedSha": null, "watcherTaskId": "...", "watcherAt": "...", "watcherExit": null, "pinged": [], "lastTickAt": "...", "fallbackAt": "...", "status": "watching" }
```

`status` is `watching` or `final`. `sessionId` is `$CLAUDE_CODE_SESSION_ID`. `loop` is `"active"` from the `/loop` call until a `ScheduleWakeup stop: true` (step 1 foreign changes, step 9), which sets `"stopped"` and clears `fallbackAt`. `pinged` lists `<head>:<failure signature>` pairs already pinged. `loop` and `fallbackAt` are per loop, not per PR: keep them in the file of the lowest PR# in the prompt and ignore them in the others.

## Each tick

A tick runs on a watcher exit or a fallback wake.

0. **Record exits.** For each PR, read a watcher exit from the notification or from its exit file into `watcherExit`, before anything else.
1. **Snapshot state**
   ```bash
   gh pr view <PR#> --json headRefOid,statusCheckRollup,reviewDecision,mergeable,isDraft
   gh pr checks <PR#>
   git status --porcelain --untracked-files=all   # are my previous fixes still uncommitted?
   git rev-parse HEAD                # checked-out PR only: must equal its headRefOid
   ```
   Untracked paths under `.claude/local/` are babysit's own state and never count as working-tree changes. `--untracked-files=all` lists them one by one; without it, a wholly untracked `.claude/` shows as `?? .claude/` and hides that.
   Foreign changes (not babysit fixes, not under `.claude/local/`) → `ScheduleWakeup` with `stop: true` now, `loop: "stopped"`, clear `fallbackAt`, skip steps 2-9, and ignore later watcher exits (Stop conditions).
   Review threads (`gh pr view` has no thread field): any `"isResolved":false` → not merge-ready; so is `reviewDecision` `CHANGES_REQUESTED`.
   ```bash
   gh api graphql -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewDecision reviewThreads(first:100){nodes{isResolved}}}}}' -f o=<owner> -f r=<repo> -F n=<PR#>
   ```
   For the checked-out PR, local HEAD differs from `headRefOid` → report "local checkout differs from PR head (unpulled or unpushed commits)" and apply no fixes this tick. Other PRs in a stack are report-only anyway.
2. **Pending local fixes not yet pushed?** → do not stack more. Report "N fixes waiting in working tree since <time>" and go to step 7.
3. **New commits since last tick?** → `git fetch origin` first, then run a **delta review** on `model: sonnet` (code-review Delta budget) (SKILL.md review mode, scoped to `git diff <last-reviewed-sha>..<headRefOid>` — the remote head, not the local checkout, which may be stale). Record the new reviewed SHA in the tick summary.
4. **Failing checks** → for each: `gh run view <run-id> --log-failed | tail -100`. Classify; a `cancel` bucket with no `fail` is Infra flake. Ping once per head + failure signature (`pinged`):

| Class | Examples | Action |
|---|---|---|
| **Mechanical, high-confidence** | lint/format errors, import order, obvious type error with one fix, snapshot needing update **only** where the diff intended the UI change | Fix locally, run the same check locally, leave uncommitted |
| **Infra flake** | runner timeout, network fetch failure, known flaky test passing on retry history | Do NOT rerun (it is a remote action on shared CI). Put the exact `gh run rerun <run-id> --failed` command in the tick summary for the human |
| **Real failure** | assertion failure in a test related to the diff, build break with several possible fixes | Do NOT fix. Diagnose root cause, write it up, ping the human |
| **Ambiguous / judgment** | reviewer asked for a design change, conflicting requirements, security finding | Ping the human with 2–3 options + recommendation |

5. **New human review comments** → summarize each with a proposed response or fix. Do not post anything.
6. **Tick summary** (one block, scannable): reviewed SHA, checks (pass/fail/pending counts), fixes applied locally (files), reruns suggested, decisions needed.
7. **Re-arm.** Per PR not `final`: head ≠ `watchedSha` → start a watcher for the head, record `watchedSha`, `watcherTaskId` and `watcherAt`. Head = `watchedSha`, no running watcher (one launched over 2 h ago counts as dead), checks still pending, `rearmedSha` ≠ head → one re-arm on that head with `--no-fail-fast`; record `rearmedSha`.
8. **Fallback.** Some PR not `final` → `ScheduleWakeup` 1800s with the same `/loop` prompt, and record `fallbackAt`, per the wake-vs-event-tick rule (Start). One fallback per loop, never one per PR.
9. **Stop** when every PR is `final` (see Stop conditions) → `ScheduleWakeup` with `stop: true`, `loop: "stopped"`, clear `fallbackAt`, and give the outcome as visible text.

## Report-only mode

`--report-only`, or a caller that says report-only (`flow --stacked`, `flow/references/stacked.md`): the class table's actions become "report the proposed fix". The tick never touches the working tree, so step 2 never fires and the checked-out-HEAD check only reports.

## Stacks (`open-pr` split)

Babysit the whole stack in one loop: `/loop /code-review babysit <n1> <n2> <n3>`. Each tick, per PR, also check:

- **Parent merged?** (`gh pr view <parent> --json state`) → the child needs retarget + restack. Don't switch branches or push — ping with the exact commands from `open-pr` `references/mechanics.md` ("Parent merged"). Until restacked, the child's diff still shows the parent's content.
- **Parent got new commits?** → the child is behind its base; list it as "restack needed" in the tick summary.
- Delta review per PR: `<last-reviewed-sha>..<headRefOid>` of that PR (after `git fetch`). `gh pr diff <n>` is the full view against that PR's own base.
- Local fixes go only on the checked-out PR's branch. Other PRs in the stack: report, don't touch.

## Pinging

Use `PushNotification` (load via `ToolSearch("select:PushNotification")`) only when a human decision is needed or the PR is ready. Everything else goes in the tick summary.

## Stop conditions

A PR becomes `final` when:

- All checks green + no unresolved review threads + no pending local fixes → report **"merge-ready — human decision"** with the final review verdict.
- PR merged or closed.
- No CI (watcher exit 3) → report "no CI" once.
- The same failure persists on 3 consecutive watched heads after fixes → escalate (the fix is wrong; re-plan).

The whole loop stops at once on working-tree changes that are **not** babysit fixes and not under `.claude/local/` (Each tick step 1: never mix with the user's in-progress work), and when every PR is `final` (step 9).

A closed session ends the loop, its watchers, and its fallback. They are not restored on `--resume`; restart the loop (`/loop /code-review babysit <PR#>...`), whose first tick picks up from the state and exit files.
