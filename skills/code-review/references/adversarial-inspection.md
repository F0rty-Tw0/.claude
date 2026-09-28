# Adversarial Inspection — Hunting AI Blind Spots

Zero-trust pass. Assume the author (human or agent) believed every line was correct; your job is to find where that belief is wrong. Read each item against the **risky hunks first** (from the blast-radius pass), then the rest.

## 1. Shared state & concurrency

- Read-modify-write on shared data without transaction / lock / atomic op (`get → +amount → save`).
- Un-awaited promise / fire-and-forget: result used before it settles; rejection becomes unhandled (can crash Node, silently lost in browsers).
- Module-level mutable state, singletons, caches without invalidation, leaked global references.
- Check-then-act (TOCTOU): `if (!exists) create()` across an await.
- Retries without idempotency keys → double charge / double send.
- Event ordering assumptions; duplicate delivery; handler registered twice.

## 2. Boundary & error handling

- Inputs: null, undefined, empty, zero, negative, `NaN`, `Infinity`, wrong type, huge, unexpected UTF-8. **Negative amounts on a credit/charge function = inverted operation.**
- Money in floats; rounding rule undefined; unit mismatch (dollars vs cents, ms vs s).
- Every I/O call: what if it rejects, times out, returns partial data? Is the error caught at the right layer, or swallowed?
- Partial failure mid-sequence: step 1 wrote, step 2 threw — is state now inconsistent? (e.g. balance saved, event never emitted)
- Resource limits: unbounded loops, arrays, recursion, file reads, pagination missing.

## 3. Cross-boundary integration (consumer side)

For every new type, event, enum case, message, payload field, route, or command that crosses a module boundary:

1. Find the **consuming dispatch point** — switch, router, handler registry, filter, serializer. It is usually **outside** the diff.
2. Confirm an explicit branch or a correct catch-all. Silent `default: return` / no-op / discard = defect.
3. Changed payload shape: grep every consumer and every persisted copy (queues, caches, DB JSON columns) that still speaks the old shape.

## 4. Security & data integrity

- Unsanitized input into SQL/NoSQL/shell/HTML/path/URL (injection, XSS, traversal, SSRF).
- Missing authz check on a new endpoint or new branch; tenant/user ID taken from request body instead of session.
- Secrets in code, config, logs, error messages. **PII in logs** (logging whole `user`/`req` objects).
- Migrations: `NOT NULL` without default on populated table; destructive drops/renames without expand→contract; long locks on hot tables; no down path; schema used by code that deploys **before** or **after** the migration (both orders must work).
  - Reproduce, don't infer: run the migration against a scratch DB with at least one existing row (e.g. `python3 -c "import sqlite3; …"` or a throwaway Postgres container if available). Leave it Inferred only when no engine can run it — and say which.
- Serialized format changes without versioning.

## 5. Blast containment

- Is new behavior gated (flag default OFF, checked at **every** entry point)?
- If not gated: can it be gated before merge? Name the flag and the exact line to guard.
- What the gate cannot contain: migrations, shared helper changes, payload changes, dependency bumps — call these out as trunk even inside a gated PR.
- Kill switch: can the feature be turned off without a deploy?

## 6. Tests & proof

See `vanity-tests.md` and `proof.md`. Vanity tests on trunk/branch code are a **proof gap that blocks merge**, not a style comment.

## 7. Spec drift & dead code

- Does the diff do what the PR/plan says? Anything claimed but absent, or present but unclaimed?
- Code added with zero callers (dead on arrival) or config added that nothing reads — scope creep, flag it once.
  - **Stacked PR exception:** a symbol whose consumer the stack map places in a later PR is not dead. Check that PR's branch (`git show <child-branch>:<path>` or `gh pr diff <child>`); if the consumer is not there either, flag it.

## What NOT to report — style is dead

Do **not** report formatting, naming taste, `var` vs `const`, semicolons, line length, function length, brace style, import order, or "could be more idiomatic". Linters, formatters, and type checkers own those.

- If a style issue causes a **bug** (e.g. `==` coercion bug, shadowed variable), report the bug, not the style.
- If the repo has **no** linter/formatter/type checker for the changed language, report that **once** as a process gap, not the individual nits.
- Refactor-for-taste belongs to the human "launch-ready polish" pass (`launch.md`), not the merge review.

## Severity

| Tier | Meaning | Merge? |
|---|---|---|
| **Blocker** | Data loss/corruption, security hole, money wrong, crash on hot path, migration that fails, proof gap on trunk, ungated trunk behavior in a repo with flags | No |
| **Should-fix** | Edge case mishandled on branch/leaf code, missing error handling off the hot path, proof gap on branch code | Fix or ticket before launch |
| **Note** | Real but minor; pre-existing issues surfaced by the review (label `pre-existing`) | Author's call |

Every finding: `file:line`, **Confirmed** (you traced or reproduced it — name the command/read) or **Inferred** (say what would confirm it), concrete fix.
