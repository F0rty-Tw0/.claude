# Deflaky

A systematic method for diagnosing and fixing flaky Playwright e2e and integration tests by **categorizing root causes before applying countermeasures**. The fix must match the category — never one-size-fits-all retries, loosened assertions, or global timeout bumps.

## What It Does

| Phase | Action |
|---|---|
| **1. Audit** | Run `--retries=0 --repeat-each=5`. Establishes empirical pass-rate per test. Without baseline data you can't categorize. |
| **2. Categorize** | Match each flake to one of 9 categories (test budget, propagation race, server timing, render race, response-body GC, environment, test isolation, infra variance, brittle selectors). |
| **3. Fix** | Apply the category-specific countermeasure from the patterns library. |
| **4. Verify** | Re-run the audit. Goal: 100% pass rate for cat 1–7 and 9; residual rate for cat 8. |

The 9 categories cover:

- **Test-budget mismatch** — outer `test.setTimeout` smaller than inner `waitFor*`
- **Setup propagation race** — resource not yet visible to runtime edge when test acts
- **Server / load timing race** — backend projection lag under parallel load
- **Render race** — UI didn't render within the default 5s assertion timeout
- **Response-body GC race** — Chromium discards body before test reads it post-navigation
- **Environment / credentials** — surfaced as 100% fail, NOT flake
- **Test isolation** — describe-shared mutable state polluted between tests
- **Pre-existing infra variance** — quarantine and track separately
- **Brittle selectors** — CSS / XPath tied to DOM internals; replace with semantic locators

---

## When to Use

Triggers when:

- Tests pass locally but fail in CI under parallel load
- Tests pass in isolation but fail in the full suite
- Tests exceed Playwright's default 30s budget without obvious cause
- New flakes appeared after a refactor or worker-count change
- "Just retry it" has become the team's default approach
- Pass-rate audit (`--repeat-each=5`) shows <100%

---

## When NOT to Use

- Test consistently fails 100% — that's a bug, use `systematic-debugging`
- Single-test flake with already-known root cause — just fix it
- Known third-party outage — wait for upstream

---

## Iron Law

```
NO FLAKE FIX WITHOUT A MULTI-RUN AUDIT FIRST
NO FIX WITHOUT A NAMED CATEGORY
```

Skipping the audit guarantees one of: papering over a real bug with retries, loosening assertions and silently hiding regressions, or bumping global timeouts and slowing the whole suite.

---

## Files

- `SKILL.md` — full skill content with the 4-phase workflow, category table, and hero patterns
- `patterns.md` — extended code library with one worked example per category

---
