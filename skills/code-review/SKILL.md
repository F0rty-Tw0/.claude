---
name: code-review
description: Risk-gradient code review that classifies blast radius, re-runs proof, audits vanity tests, and dispatches an independent reviewer. Use to review a diff, branch, or PR (especially agent-authored), build a PR proof bundle, babysit PR CI, or plan a gated launch.
argument-hint: "[review|proof|babysit|attack|launch] [PR#... | base..head | path]"
---

# Code Review — Risk-Gradient, Proof-Based, Adversarial

Review effort follows **blast radius**, not line count; claims are replaced by **proof**; the reviewer is never the author. Classify the change first, demand artifacts over promises, send an independent zero-trust reviewer. Style belongs to linters.

## Modes

| Arg | When | Reference |
|---|---|---|
| `review` (default) | Review a diff / branch / PR | this file + `references/blast-radius.md`; other references when a step cites them |
| `proof` | You wrote the change; build the PR proof bundle | `references/proof.md`, `templates/pr-proof.md` |
| `babysit [--report-only] <PR#>...` | Watch CI + comments for one or more PRs on a loop woken by a background check watcher, fix mechanical failures locally (`--report-only`: report them) | `references/babysit.md` |
| `attack` | Before opening a feature gate: break the product in staging | `references/attack.md` |
| `launch` | Plan the gate before coding; merge-ready → launch-ready → canary | `references/launch.md` |

## Review mode

1. **Scope.** Resolve the material:
   - diff command (`gh pr diff <n>`, `git diff <base>...HEAD`, `git diff --cached`)
   - PR description
   - plan/requirements
   - test command

   No diff found → say so and stop. Never review from memory.

   **Review stamp.** Runs only when all hold; otherwise full review, no stamp:
   - Diff is `git diff <base>...HEAD` on the local checkout. A caller's `<x>..HEAD` converts to `<x>...HEAD` only if `git merge-base --is-ancestor <x> HEAD` succeeds.
   - Not an excluded diff: non-ancestor two-dot range, `gh pr diff <n>`, explicit other head, `--cached` or working-tree diff, mid-plan `git diff <task-base>`.
   - Tree clean: `git status --porcelain --untracked-files=all` at the toplevel shows nothing but untracked files under `.claude/local/` or `docs/specs/` (the script checks this).

   User asked for a fresh or second-opinion review → skip the lookup (case 3), but still stamp in 5b, so the newest independent review wins.

   Record `REVIEWED=$(git rev-parse HEAD)` and `SCRATCH=$(mktemp -d)` outside the worktree. Shell state doesn't persist between Bash calls: echo both and use the literal values in every later call. Material files go in `$SCRATCH`: PR text as `pr.md` (drafted in skill:open-pr's body shape: a `## Proof` section with `Before:`/`After:` lines, plus rollback and canary lines for Trunk; each claim names the command or artifact behind it, re-checked against the current HEAD after every new commit), plan copied as `plan.md` (a plan folder: index.md then each `NN-*.md` in order, concatenated; append the `## Stack` map for a stacked PR). Then run `node ~/.claude/skills/code-review/scripts/review-stamp.mjs lookup <base> $SCRATCH/pr.md $SCRATCH/plan.md`:

   | Case | What happens |
   |---|---|
   | 1, `materialChanged:false` | Dispatch nothing. Print the stamped report under `Reused review @ <short sha> (<stamp date>)`, go to Step 6. No new stamp. |
   | 1, `materialChanged:true` | Proof pass: one `code-reviewer` in `proof` mode. No trunk escalation (code unchanged, stamp has the specialist findings). Report = stamped one with section 5 and the section 7 verdict replaced, plus any reinstated finding merged into sections 2 or 3; keep the stamped Discarded findings and append new ones. Check the reviewer's section 7 against the verdict table on the combined report; override on mismatch (stamped Blocker + clean new proof is still BLOCK). |
   | 2 | Delta review: one `code-reviewer` in `delta` mode on the range, told `materialChanged`. Step 3 trunk escalation is judged on the delta diff; specialists get the delta diff and their verified findings merge into sections 2 and 3. |
   | 3 | Full review, as today. |
   | lookup exits non-zero or prints no JSON | Treat as case 3. |

   **Mid-plan checkpoint** (e.g. after a `subagent-driven-development` task): diff = `git diff <task-base>` (working tree against the recorded task base, so uncommitted work counts), plan = the task text. Run one for risky task diffs (shared code, trunk signals); the plan's final review covers the rest.

   **Stacked PR** (base is not the default branch: `gh pr view <n> --json baseRefName`) → diff against the **parent** (`<parent>...<head>`), and pass the `## Stack` map to the reviewer.

2. **Independence.** Dispatch the reviewer with `references/reviewer-prompt.md`. Always dispatch, even for small diffs, unless Step 1 reuses a stamp (case 1, unchanged material): a session that wrote any of the code is biased.

   Pass only artifacts: diff, PR text, plan; fill the template's placeholders. Never pass your session's rationale, opinions, or a hint list. Exception: stamped independent-review findings, in delta and proof modes only.

3. **Trunk escalation.** Check the trunk signals from `references/blast-radius.md` (greps and fan-in, not file names alone). If any shows, dispatch the `security-reviewer` and/or `performance-reviewer` in the **same message**, ≤3 agents total. `performance-reviewer` only when the diff touches a measured hot path, a bench or a budget test: elsewhere it repeated the code-reviewer's findings (4 of 5 passes in the week of 2026-10-19).

   If the reviewer later classifies the change as trunk and no specialist was sent, send one then.

4. **Verify findings.** Agents over-report. For each finding:
   - open the cited `file:line`
   - re-run the reproduction for every blocker

   Discard a finding only with evidence. "The author intended it" is not evidence. List discarded findings with the reason.

   Delta review: a prior Blocker marked fixed needs its fixing hunk in `S..HEAD` and a re-run of its reproduction; otherwise it stays open.

5. **Report** in the format below. If the host offers `ReportFindings`, also call it with the verified findings.

   **5b. Stamp.** If Step 1 was eligible (a fresh-review request counts) and ran a review or pass: save the verified report to `$SCRATCH/report.md`, then run `review-stamp.mjs write <base> $REVIEWED <full|delta|proof> $SCRATCH/report.md $SCRATCH/pr.md $SCRATCH/plan.md`. Exit 1 (HEAD moved, tree dirty, bad base, or an error) or exit 2 (no verdict in the report, bad path) → skip the stamp, say why in one line. 5b runs before Step 6, so fixes are never stamped.

6. **After the verdict:** triage fixes with the `code-review-receiving` skill. Plan the gate or canary with `launch` mode.

## Non-negotiables (each one closed a gap seen in baseline testing)

- **Classification comes first and always appears in the output:**
  - class (Leaf / Branch / Trunk)
  - score 1–10
  - failure mode
  - gating status

  A list of bugs without a blast-radius call is an incomplete review.
- **Zero style findings.** No `var`, semicolons, naming taste, function length, or "more idiomatic". If no linter exists, report that **once**, as a process gap. Taste belongs to the human polish pass (`launch.md`).
- **Vanity tests on Branch/Trunk code block the merge** as a proof gap. They are never a "medium" or "redundant" note.
  - Run the mutation probe (`references/vanity-tests.md`).
  - Name the test that should have failed.
- **Boundary inputs are checked on every risky function:** negative, zero, `NaN`, null, wrong type, rejected I/O.
- **Every Trunk review names:**
  - the rollback path (flag flip / revert / data repair)
  - the telemetry metric that would spike in a canary
  - the exact lines a human must deep-read — the agent cannot sign off on trunk alone
- **Proof is re-run, not read.** A claim with no artifact, or one that fails to reproduce, is a proof gap (verdict row 2).

## Output format

```markdown
## 1. Classification & Blast Radius
- **Class:** Leaf | Branch | Trunk — driven by <highest-risk hunk, file:line>
- **Blast radius:** <n>/10 — <one-line rationale>
- **Failure mode:** throws → <…>; silently wrong → <…>; concurrent → <…>
- **Gating:** Gated (<flag>, default OFF, checked at <file:line>) | Ungated on <path> (HIGH RISK) | N/A
- **Rollback:** flag OFF | revert deploy | needs data repair (<what>)

## 2. Blockers
(Genuine blockers only. None → "None identified.")
- **<file:line>** [Confirmed: <command/trace> | Inferred: <what would confirm>] — <flaw> → <fix>

## 3. Should-fix / Notes
- **<file:line>** [Confirmed|Inferred] [pre-existing?] — <issue> → <fix>

## 4. Vanity Test & Invariant Audit
- Tests run: `<cmd>` → <pass/fail, exit code>. Mutation probe: <what was broken> → <still green? which test should have failed>
- Per test: <name> — proves <behavior> | vanity: <pattern>
- Missing invariants: <rule the system must hold> → <test to add>

## 5. Proof Gaps & Required Proof Before Merge
- Claim "<quote from PR>" → <artifact found / missing / did not reproduce>
1. <command or deterministic test that must pass>
2. <runtime/visual evidence needed from author>

## 6. Launch Safety
- **Canary metric:** <metric that spikes on failure> — rollback threshold <…>
- **Not rollback-able by flag:** <migrations / emails / charges / data writes> | none
- **Human must deep-read:** <file:line ranges> | none (Leaf)

## 7. Verdict
APPROVE — LOW RISK LEAF | APPROVE — BRANCH, PROOF MET | APPROVE — TRUNK, HUMAN SIGN-OFF REQUIRED | BLOCK — REQUIRES PROOF | BLOCK — HIGH BLAST RADIUS DEFECT
**State:** merge-ready (dark) | not merge-ready · launch-ready: no — see `launch` mode

Discarded findings: <finding — reason> | none
```

Verdict rules. Take the first one that applies; tiers come from `references/adversarial-inspection.md` "Severity":

| # | Condition | Verdict |
|---|---|---|
| 1 | Any **Blocker**-tier defect | BLOCK — HIGH BLAST RADIUS DEFECT |
| 2 | Any **Proof gap** (class proof bar unmet) | BLOCK — REQUIRES PROOF |
| 3 | Trunk, no blocker or proof gap | APPROVE — TRUNK, HUMAN SIGN-OFF REQUIRED |
| 4 | Branch, no blocker or proof gap | APPROVE — BRANCH, PROOF MET |
| 5 | Leaf (gated or isolated), no blocker or proof gap | APPROVE — LOW RISK LEAF |

Should-fix and Note findings never change the verdict; they go in section 3.

## Common mistakes

| Mistake | Fix |
|---|---|
| Reviewing in the session that wrote the code | Dispatch a fresh reviewer — step 2 |
| Adding `critic` to a diff review | `critic` reviews specs and plans. On code diffs it found nothing or repeated `code-reviewer` (2026-10-16 audit). |
| Priming the reviewer ("check the race in wallet.ts") | Pass artifacts only; let it find things (stamped prior findings excepted, Step 2) |
| Trusting "all tests pass" | Re-run; mutation-probe; base-failure check |
| Stopping at the producer side of a new event/type | Read the consumer's dispatch point outside the diff |
| Treating a gated PR as all-leaf | Migrations, shared helpers, and payload changes are trunk even inside a gate |
| Babysit pushing fixes | Never. Local working tree only; the human commits and pushes |
