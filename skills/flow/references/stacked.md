# Stacked Mode (`flow --stacked`)

Build slice N+1 while slice N's gate or CI runs. Gate and CI results arrive as background events; the only synchronous user wait is a push approval (D1). A real red, a merge conflict, or a code-review BLOCK is a ping plus `blockedOn` on that slice, and the rest of the run keeps going.

## Inputs

- A plan folder whose `index.md` has a **PR Slices** table (skill:plan `references/task-format.md`, PR Slices).
- Commits authorized by the user at launch (D2). Missing either → stop and say which (flow Mode Selection).
- Worktree consent comes with the launch (flow Mode Selection): `git worktree add` below needs no extra question.

## Terms

- **Ancestors of slice N:** the slices on N's Base chain (N's Base, its Base, …) up to the default branch. Independent slices are not ancestors.
- **Task boundary:** the moment a plan task is ticked and committed, so the tree is clean.
- **Merge-ready (per PR):** babysit.md Stop conditions, first bullet — all checks green, no unresolved review threads (and no `CHANGES_REQUESTED`; command in babysit.md Each tick step 1), no pending local fixes — plus code-review not BLOCK. In stacked mode `ci: no-ci` (watcher exit 3) counts as green, because the D5 gate already ran; the report says "no CI" for that PR.
- **CI green (for D6 and the push scan):** `ci` is `green` or `no-ci`.
- **Plan folder:** always the absolute path in the main checkout (`<main root>/.claude/local/plans/<folder>`). Worktrees don't carry `.claude/local/`, so every slice reads and writes the same plan folder and state file.
- **Main root:** the main checkout. The session stays there for the whole run (ruling R1, see Worktrees).

## Decisions in force

- **D1** Each push needs the user's approval (AskUserQuestion), asked at push time. One approval covers: `git push` of that slice, `gh pr create` for it, and `gh pr edit` of bodies (`## Stack`, `## Proof`) on PRs in the same stack. Force-push is never covered. While the question waits, building pauses; that is an allowed wait.
- **D2** A launch that authorizes commits authorizes every commit and every `git merge` in the run, including turns re-invoked by background jobs with no user message. Every commit (task, fix, call-site repair) follows skill:meaningful-commits: one change plus its test, green before commit. The commit-guard one-shot flag is still set per commit (`open-pr/references/mechanics.md` Commit-guard bullet).
- **D3** D2's `git merge` covers every merge in the run: a parent slice into a child slice, pushed or not (local restack, Push scan step 1), and `origin/<default>` into a slice. Pushing the merged child is a normal push (D1). Merge conflict → ping + `blockedOn: "conflict"` (User blocks).
- **D4** Babysit ticks run in report-only mode: they never touch the working tree. The stacked loop applies and commits fixes under D2.
- **D5** Per-slice gate before open-pr proof/review: build + full test suite + the cheap CI jobs, fresh, in the slice's worktree, as a background job.
- **D6** Slice N has a real red, is unpushed, or its CI is pending → slices that have N as an ancestor keep building, gating and reviewing, but don't push. Independent slices are unaffected.
- **D7** In a new session, the user typing `flow --stacked --resume <plan folder>` re-authorizes commits and merges (D2/D3) for the resumed run.
- **D8** When the handoff-trigger mod (`/handoff`, then `/clear`, then work continues) interrupts the run, the continuation keeps D2/D3 if the handoff file names the run: `next: flow --stacked --resume <plan folder>` and `commits authorized: yes (flow --stacked launch <date>)`. Pushes still need D1.

## State

Single source of truth: `<plan folder>/stacked-state.json`, written after every step below. Exit files live in `<plan folder>/jobs/`.

```json
{ "sessionId": "...", "loop": "stopped", "fallbackAt": "...",
  "slices": [{ "slice": 1, "branch": "...", "base": "...", "worktree": "...", "built": false,
    "gate": "none|running|green|red", "gateTaskId": "...", "gateExit": null, "gatedSha": "...", "gateRerunSha": null,
    "reviewedSha": "...", "pushedSha": "...", "pr": null,
    "watchedSha": "...", "rearmedSha": null, "watcherTaskId": "...", "watcherAt": "...", "watcherExit": null,
    "ci": "none|pending|green|red|no-ci", "fixAttempts": { "<failure signature>": 0 }, "pinged": [], "blockedOn": null }] }
```

- `sessionId` is `$CLAUDE_CODE_SESSION_ID`. `blockedOn` is one of `"declined"`, `"block"`, `"red"`, `"conflict"`, `"depth"`, `"ruling"`, or null.
- `loop` is `"active"` from the `/loop` call (Waiting) until a `ScheduleWakeup stop: true` (Ending), which sets `"stopped"` and clears `fallbackAt`.
- Babysit's state files (`.claude/local/babysit/`) and its fallback are not used in stacked mode.
- **Running job** (gate or watcher) = its launch was recorded with the current `sessionId`, and neither its counting exit file (Stale exits) nor a recorded exit exists. A watcher launched over 2 h ago (`watcherAt`) counts as dead (babysit.md Start). An exit notification is recorded in the state file the moment it arrives, even mid-task; only its handling waits.
- **Stale exits.** Exit files are named `<slice>-<gate|watch>-<SHA>.exit` (a same-head watcher re-arm: `<slice>-watch-<SHA>-r.exit`; a gate re-run: `<slice>-gate-<SHA>-r.exit`); match them to slices by that name. An exit counts only if its `<SHA>` equals the slice's `gatedSha` with head still there (gate; the `-r` file only when `gateRerunSha` = `<SHA>`), or its `watchedSha` (watcher; the `-r` file only when `rearmedSha` = `<SHA>`). After a re-arm or re-run only the `-r` file counts for that SHA; the first job's plain file is stale. Any other exit file or notification is stale: ignore it.
- A slice's head moving past `pushedSha` (fix commit, restack merge) → `ci: "none"` until that head is pushed.

## Launch, resume, tick

| Invocation | When | Does |
|---|---|---|
| `flow --stacked "<task>"` | after PLAN | Writes the state, starts Per slice |
| `flow --stacked --resume <plan folder>` | new session (D7/D8) | Resume order below |
| `flow --stacked --tick <plan folder>` | in-session wake prompt (Waiting) | Reads exit files, trusts running task ids, handles only finished jobs |

**Resume order:**
1. Read every exit file in `<plan folder>/jobs/` into the state first.
2. Every job launched under the old `sessionId` with no exit is dead → re-run that gate, or re-arm that watcher once with `--no-fail-fast` (babysit.md Start, One watcher per head SHA).
3. Only then overwrite `sessionId`, set `loop: "stopped"` and clear `fallbackAt` (the old session's loop and wakeups are gone).
4. Run the push scan, then continue Per slice, or enter Waiting if nothing is buildable.

Background jobs, wakeups and loops die with the session and are not restored on `--resume` / `--continue`; the resumed run re-enters Waiting itself when it has nothing buildable. Unattended runs: babysit.md Start (the same limits apply to gate jobs).

**Context-limit handoff (D8):** when the handoff-trigger mod warns, checkpoint at the next task boundary and make sure the handoff file carries the two D8 lines.

## Worktrees

**No `EnterWorktree` / `ExitWorktree` in this mode (ruling R1, 2026-10-19).** Inside an EnterWorktree session the harness refuses writes to the main checkout, and the plan folder lives there. The session stays in the main root for the whole run.

First check the ignore rule in the main root; not ignored → add `.claude/worktrees` to the repo's exclude file (the common git dir's, so it also works when the main root is itself a linked worktree):

```bash
git -C <main root> check-ignore -q .claude/worktrees || echo '.claude/worktrees' >> "$(git -C <main root> rev-parse --git-common-dir)/info/exclude"
```

For slice N:

```bash
git -C <main root> fetch origin
git -C <main root> worktree add .claude/worktrees/stacked-<slice-branch-sanitized> -b <Branch> <Base ref>
```

`<Base ref>` is `origin/<Base>` when the table's Base is the default branch, else the Base slice's local branch. `<slice-branch-sanitized>` = `<Branch>` with every `/` replaced by `-`; the `stacked-` prefix keeps these dirs apart from `EnterWorktree` names. Record the absolute worktree path in `worktree`.

Working in a slice from the main root:

- Edit and Write slice files by absolute path: `<main root>/.claude/worktrees/stacked-<slice-branch-sanitized>/<file>`.
- Bash: `cd <worktree> && …` or `git -C <worktree> …`. Every Bash call that open-pr, code-review, babysit, ralph, SDD and using-git-worktrees make for a slice runs this way: their bare `git`/`gh`/`node` calls assume cwd is the work tree, and a bare call from the main root reads (and stamps) the default branch's HEAD.
- Every subagent dispatched for a slice (implementer, spec reviewer, code-review's reviewer, quality-reviewer, specialists) gets `Work from: <worktree>` in its prompt; reviewers also get the diff `<Base ref>...<Branch>` as the artifact.
- **Risk:** a wrong path edits the main checkout. Check that every edit path starts with the slice's worktree path before sending it.

Install deps per skill:using-git-worktrees step 3, run in the worktree. The baseline test run goes in the background and is read before the slice's first task ends. A slice whose Base is an already-gated slice skips the baseline (the parent's gate is its baseline). A red baseline is pre-existing failure and never starts the slice's tasks: `PushNotification` with the failing tests, `blockedOn: "red"` on that slice, build another slice; the user's answer clears it (using-git-worktrees' "ask whether to proceed" doesn't apply).

## Per slice

In PR Slices table order:

1. **Build.** Create the worktree (Base = default branch or any already-built slice, `task-format.md` PR Slices). Execute the slice with ralph or subagent-driven-development in **Slice mode** (flow's Mode Selection picks which): ralph SKILL.md step 1 "Slice mode" bullet and step 6; subagent-driven-development SKILL.md "Slice mode" paragraph and its "After all tasks" Slice-mode line. SDD's Before starting under this mode: step 2 is met by the slice worktree (the main root stays on the default branch); step 3's base is `git -C <worktree> merge-base HEAD <Base ref>`; its Per-task `BASE`/`git diff` commands run with `git -C <worktree>`. Each task ends committed (D2): implementer dispatches fill `Commit only if the user authorized commits: yes` and name skill:meaningful-commits. All slice tasks ticked → `built: true`.
2. **Gate (D5), background.** One background Bash job (`run_in_background: true`) in the worktree: build, full test suite, cheap jobs from `.github/workflows/*.yml` (lint, format check, typecheck, unit tests; skip e2e, deploy, release, anything needing secrets). No workflows dir → the repo's `build`/`test`/`lint`/`typecheck` scripts. Record `gatedSha`, `gateTaskId`, `gate: "running"`; list the commands in the slice report.
   ```bash
   mkdir -p "<plan folder>/jobs"
   ( cd "<worktree>" && <cmds> ) > "<plan folder>/jobs/<slice>-gate-<SHA>.log" 2>&1; rc=$?; echo $rc > "<plan folder>/jobs/<slice>-gate-<SHA>.exit"; exit $rc
   ```
   `<cmds>` are joined with `&&`. The trailing `exit $rc` keeps the job's own exit code. Diagnose a red gate from its `.log`. A failure that looks like a resource clash with the other worktree's tests (port in use, lock file, shared DB) → re-run once when no other test job runs, before calling it red: the same command writing `<slice>-gate-<SHA>-r.log` and `<slice>-gate-<SHA>-r.exit`, with `gateRerunSha: <SHA>`, a new `gateTaskId`, `gateExit: null` (Stale exits).
3. **Overlap.** Without waiting for the gate, start the next slice whose Base is the default branch or an already-built slice (within Chain depth). None left → Waiting.
4. **Events.** Gate exits and watcher exits are handled at the next task boundary of the slice in progress (or at once if nothing is in progress). Handling happens inside that pass, then work resumes. These event ticks during building never call `ScheduleWakeup`, unless `loop` is `"active"` (then Waiting's reschedule rule applies).
5. **Review.** Gate green on `gatedSha` = slice head → in that slice's worktree, run `open-pr` Steps 0-6 (proof + code-review), with the diff against the parent and the stack map (stacking.md step 6). These steps never push or create the PR; the push scan does that. Record `reviewedSha`. A Step 0 fix commit moves head past `gatedSha` → back to step 2.
   - **Base.** Step 1 runs `cd <worktree> && …` with `BASE=$(git merge-base HEAD <Base ref>)`: the local parent branch for a stacked slice (the parent may be unpushed), `origin/<default>` only for a default-branch Base. The same `<Base ref>` is code-review's `<base>`.
   - **No questions.** Step 0 item 3 never asks: BLOCK, a missing before/after pair, and a still-blocking verdict after 2 delta rounds each set `blockedOn: "block"` and send the ping with the findings. No draft PRs. Step 7 is skipped.
   - **Trunk sign-off.** `APPROVE — TRUNK, HUMAN SIGN-OFF REQUIRED` is signed off through the D1 push question, which states "TRUNK — sign-off required" and the review summary; no separate stop.
   - **PR text.** Write the title to `<plan folder>/pr/<slice>.title` and the body only to `<plan folder>/pr/<slice>.md` (`## Stack` without PR numbers yet), plus the slice's `--attach` paths in `<plan folder>/pr/<slice>.attach`, one per line.

## User blocks

Asynchronous. Only the D1 push question is asked with AskUserQuestion. A BLOCK, real red, or merge conflict is a `PushNotification` (load via `ToolSearch("select:PushNotification")`) with the diagnosis and options, plus `blockedOn` on that slice; the run keeps working on everything else. The user's answer arrives as a normal message and clears `blockedOn`.

Slice mode turns every ralph/SDD stop that would ask or end the turn (ruling row, Handoff patch to a protected section, unresolved BLOCKED, critical unknown, using-git-worktrees' red-baseline question) into the same ping plus `blockedOn: "ruling"` (red baseline: `"red"`) for that slice; the loop moves on to other slices.

## Push scan

Runs after every event: gate exit, review, watcher exit, push, fix, merge, user answer. For each slice in table order with `built`, `gate: "green"`, `gatedSha` = `reviewedSha` = head, its own `blockedOn` null (a declined or BLOCKed slice is not re-asked; the user's answer clears `blockedOn`), not pushed at this head:

1. Every ancestor pushed (its `pushedSha` equals its current head) with CI green (Terms) and not `blockedOn` (D6); and the slice contains each ancestor's current head:
   ```bash
   git -C <worktree> merge-base --is-ancestor <ancestor head> HEAD
   ```
   Missing a head → restack (below), which resets the gate (back to Per slice step 2).
2. Eligible → ask to push (D1). The question carries the slice report: gate commands, review verdict @ `reviewedSha` (with the TRUNK sign-off line, Per slice step 5), SDD's "left to the user" items.
3. Approved → `git -C <worktree> push -u origin <Branch>`; for a new PR, fill `## Stack` in `<plan folder>/pr/<slice>.md` with the PR numbers known now (stacking.md step 7), then `cd "<worktree>" && gh pr create --base <Base> --head <Branch> --title "$(cat "<plan folder>/pr/<slice>.title")" --body-file "<plan folder>/pr/<slice>.md"`, one `--attach <path>` per line of `<slice>.attach` (mechanics.md Push + open); an existing PR gets `gh pr edit <PR#> --body-file …` with the same flags instead; `gh pr edit` earlier PRs' `## Stack` with their own `--attach` flags; start a watcher (Waiting), `ci: pending`. Record `pushedSha`, `pr`. Push and `gh pr create` go in separate Bash calls, the push after its own one-shot flag (mechanics.md Commit-guard bullet). On Windows pass `--body-file` as `C:/…`, not `/c/…`: `pr-proof-guard` resolves `/c/…` wrongly and blocks the call.
4. Declined → `blockedOn: "declined"`.

**Restack** (D3). Checked on every event for every child slice with a worktree, built or not; don't wait for the ancestor's CI or for eligibility. As soon as the child's Base slice is gated green at a head the child lacks and the child's tree is clean (task boundary), merge it into the child:

```bash
git -C <child worktree> merge --no-edit <Base slice Branch>
```

No commit-guard flag (the hook doesn't match `git merge`). Fix call sites the change broke (mechanics.md Review changes) and commit them, then re-gate and re-review. Conflict → `git -C <child worktree> merge --abort`, `blockedOn: "conflict"`, ping. Repeat for each descendant, nearest first. mechanics.md's `git switch` lines don't apply: each branch is checked out in its own worktree.

## Waiting

Nothing buildable, and at least one background job running or a pushed slice not merge-ready (Ending, Waiting on GitHub) → invoke the loop skill, self-paced, only if `loop` ≠ `"active"` (then set `loop: "active"`); else end the turn:

```
/loop /flow --stacked --tick <plan folder>
```

Each wake: one pass as in Per slice step 4, then the push scan, then the fallback (`ScheduleWakeup` 1800 s with the same `/loop` prompt, record `fallbackAt`) per babysit.md Start's wake-vs-event-tick rule; a gate exit is an event tick too. `stop: true` ends the loop. Always read exit files first on `--tick` and `--resume`.

### Watcher

The watcher contract (exit codes, one watcher per head SHA, the one same-head re-arm, running watcher) is babysit.md Start. Stacked mode differs only here:

- One watcher per pushed head, launched only for `pushedSha`. Run with cwd = the slice worktree, or add `--repo <owner/repo>`. The script writes its own exit file; no shell wrapper. Record `watchedSha`, `watcherTaskId`, `watcherAt` in this state file; a re-arm writes `<slice>-watch-<SHA>-r.exit` in the same folder.

  ```bash
  cd "<worktree>" && node ~/.claude/skills/code-review/scripts/watch-pr-checks.mjs <PR#> <SHA> "<plan folder>/jobs/<slice>-watch-<SHA>.exit" [--no-fail-fast]
  ```

- **Exit → `ci`.** Record `watcherExit`, then: 0 → `ci: green`, merge-ready check; 1 with a `fail` bucket → `ci: red`, classify (Failure handling); 3 → `ci: no-ci`, report "no CI", no more watchers for this PR; 7 → `ci: red`, class Infra flake: put `gh run rerun <run-id>` in the report for the user. Exit 1 without a `fail` bucket and all other exits as in babysit.md's table, relying on the fallback tick.
- **`ci` on every fallback or exit tick**, for every pushed slice, whether or not a watcher is running (the read is read-only). First `gh pr view <PR#> --json headRefOid`: ≠ `pushedSha` → report "PR head ≠ pushed head" and leave `ci` unchanged. Else read `gh pr checks <PR#> --json bucket`: all `pass` (or `skipping`) → `ci: green`; any `fail` → `ci: red` and classify (Failure handling; a failure signature already counted for this head is not counted again); any `cancel` (and no `fail`) → `ci: red`, class Infra flake as for exit 7; still pending, or rc 1 with `no checks reported` (never a vacuous green) → the one same-head re-arm, only when no watcher is running (one launched over 2 h ago counts as dead). Ping once per head + failure signature: record `<head>:<signature>` in `pinged` and skip pairs already there.
- Each fallback or exit tick on a pushed slice runs babysit's `## Each tick` procedure in `## Report-only mode` (`code-review/references/babysit.md`), steps 0-6 only, in that slice's worktree, recording into this state file. Step 1's foreign-changes stop (`ScheduleWakeup stop: true`) doesn't apply here: report the foreign changes only. Its steps 7-9 (re-arm, fallback, stop) are replaced by this section and Ending.

## Ending

- Every slice pushed and merge-ready → `ScheduleWakeup stop: true`, `loop: "stopped"`, clear `fallbackAt`, report "stack merge-ready — human merges".
- **Park:** nothing buildable, no background job running, and at least one slice `blockedOn` the user (declined, BLOCK, real red, conflict, chain depth, ruling) → report what each slice waits on, `ScheduleWakeup stop: true`, `loop: "stopped"`, clear `fallbackAt` (pings were already sent when each block happened). The user continues by answering (in-session) or with `--resume`.
- **Waiting on GitHub:** nothing buildable, no job running, no `blockedOn`, but a pushed slice is not merge-ready (unresolved threads, `CHANGES_REQUESTED`, an infra-flake rerun handed to the user) → stay in Waiting on the 1800 s fallback ticks, report once what each slice waits on, and stop only through the two cases above or when the user says stop.
- **Run end** (stack merge-ready, or the user says stop; not Park) → delete SDD's per-task reports in `<plan folder>/sdd/` and any `.claude/local/` state files ralph created for this run.
- Every report lists unpushed slices.

## Chain depth

At most 3 stacked slices in one chain (stacking.md Topology: maximum depth is 3); independent slices don't count. At the limit, don't start a 4th in that chain; build other slices if any, else park with `blockedOn: "depth"`.

## Finish

Worktrees stay until their PR merges. After a merge (a user request, as today), remove that slice's worktree:

```bash
git -C <main root> worktree remove <path>
```

## Failure handling

| Event | Action |
|---|---|
| **Mechanical-fix cap** (applies to both red rows) | Count each fix in `fixAttempts` under the failure signature (check or test name + first error line). The 3rd attempt at the same signature → treat as real red (ralph SKILL.md, babysit.md Stop conditions). Classify a gate failure with babysit.md's class table (Each tick step 4), reading the gate's `.log`; fix commits follow D2. |
| **Gate red on N** | At the event point, in N's worktree (absolute paths, `git -C`), diagnose. Mechanical → fix, commit (D2), re-run the whole gate; review (Per slice step 5) re-runs only once that new gate is green. Real or ambiguous → ping with diagnosis and options; `blockedOn: "red"`; slices with N as ancestor keep building (D6). |
| **Remote CI red on pushed N** | In N's worktree, run babysit's Each tick in report-only mode (D4). Infra flake → `gh run rerun <run-id> --failed` goes in the report for the user. Mechanical → the loop fixes and commits in N, re-runs the whole gate, and only once that gate is green re-runs open-pr Step 0 (1-3) and replaces `## Proof` in `<plan folder>/pr/<slice>.md` (open-pr SKILL.md) before the push, push scan asks (D1), new head → new watcher. Real → as gate-red-real. |
| **N changed after a child branched** | Restack (Push scan) as soon as N's new head is gated green: merge N into its child, then each child's re-gated head into its own child; fix call sites; re-gate; re-review. A pushed child also re-runs open-pr Step 0 (1-3) and replaces `## Proof` before its push. Conflict → ping (`blockedOn: "conflict"`). |
| **code-review BLOCK on N** | Don't push N; its descendants don't push (D6). Ping with the findings; `blockedOn: "block"`. |
| **Push declined for N** | N stays committed locally; descendants build but don't push (D6). Every report lists unpushed slices. |
| **Parent merged** | Retarget + restack per mechanics.md "Parent merged" — needs a user request, as today. |
