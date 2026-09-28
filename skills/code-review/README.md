# code-review

Risk-gradient code review for AI-assisted changes. It classifies each change by blast radius (trunk vs leaf) before reading it, then demands re-runnable proof instead of claims. An independent reviewer with a fresh context does the review. Style nits are left to linters.

## What It Does

| Mode | Purpose |
|---|---|
| `review` (default) | Classify → adversarial reviewer (+ specialists on trunk) → verify findings → risk report + verdict |
| `proof` | Author side: build the PR proof bundle (tests, base-failure check, runtime log, visual, verified / not verified) |
| `babysit <PR#>` | Loop on CI and comments; fix mechanical failures in the local tree only (never commits or pushes); ping on decisions |
| `attack` | Pre-launch: flow-breaker, profiler and security prober against staging (≤3 agents) |
| `launch` | Gate plan before coding, merge-ready vs launch-ready checklists, human-polish handoff, canary ramp + rollback |

References: `blast-radius.md`, `proof.md`, `vanity-tests.md`, `adversarial-inspection.md`, `reviewer-prompt.md`, `babysit.md`, `attack.md`, `launch.md`. Template: `templates/pr-proof.md`.

Verdicts: `APPROVE — LOW RISK LEAF`, `APPROVE — BRANCH, PROOF MET`, `APPROVE — TRUNK, HUMAN SIGN-OFF REQUIRED`, `BLOCK — REQUIRES PROOF`, `BLOCK — HIGH BLAST RADIUS DEFECT`.

---

## When to Use

Triggers when you:

- Ask to review code, a diff, a branch, or a PR (especially agent-written)
- See a PR claiming "fixed / verified / all tests pass" with no evidence
- Want CI on a PR watched and mechanical failures fixed
- Plan a feature-gated launch, canary rollout, or pre-launch attack pass

---
