# Blast Radius — Classify Before You Read

Classify the change **before** reading it line by line. The class sets how much human and agent effort the review gets (the "knob").

Anchor question for every change: **if this goes wrong, what breaks, how far does the failure travel, and how fast can it be rolled back?**

## The tree model

| Part | What lives there | Failure travels | Review posture |
|---|---|---|---|
| **Trunk** | Shared state, core infra, data models, schemas, migrations, auth/authz, crypto, billing/money, security middleware, critical-path pipelines, async/concurrent code, public API contracts, shared utils imported widely | Everywhere downstream | Deep human read + adversarial agent + specialist pass. Invariants must be asserted. |
| **Branch** | Feature modules with a few consumers, internal services, non-critical jobs | One feature area | Adversarial agent + run the proof. Human reads the risky hunks only. |
| **Leaf** | New code fully behind an OFF flag, isolated UI components, experimental views, one-off scripts, client-side utils with one caller | Itself only; fails silently or only for dogfood users | Agent validation + proof check. Human skims. Fast-track. |

A diff is classified by its **highest-risk hunk**. One trunk line in a 500-line leaf PR makes it a trunk PR — or a PR that should be split.

## Trunk signals (any one → trunk)

Find these with grep/reads, not by file name alone:

- Writes to a store, cache, or global/module-level state that other code reads.
- Read-modify-write on shared data (`get` → compute → `save`) without a lock, transaction, or atomic op.
- Un-awaited promises, fire-and-forget calls, new background jobs, queue producers/consumers, retries.
- Schema or migration files; changes to serialized formats, event payloads, API request/response shapes.
- Auth, session, permission, token, secret, crypto, payment, pricing, balance, or quota logic.
- Imported by many modules — check fan-in by basename, any relative depth or alias, from the repo root: `grep -rlE "(from|require\().*['\"][^'\"]*<basename>(\.m?[jt]sx?)?['\"]" . --exclude-dir=node_modules | wc -l`.
- Runs on every request / every checkout / every login (hot path).
- Removes or changes an existing branch in a `switch`/router/handler registry.
- Changes to build, CI, deploy, infra-as-code, env/config defaults, feature-flag defaults.

## Blast Radius Score (1–10)

| Score | Meaning | Example |
|---|---|---|
| 1–2 | Isolated, gated, internal | New admin widget behind OFF flag |
| 3–4 | Isolated, user-visible, cheap rollback | New UI component, ungated, no data writes |
| 5–6 | Feature-area logic, reversible writes | New endpoint writing its own table |
| 7–8 | Shared logic or hot path, ungated | Change to checkout, shared util, event payload |
| 9–10 | Money, auth, migrations, global state, irreversible data | Balance math, permission check, `NOT NULL` column add |

Add +1 if the change is **ungated** on a trunk path. Add +1 if rollback is **not** a flag flip (migration, data rewrite, external side effect like email/charge). Cap at 10.

Any trunk signal floors the score at **7** — the class decides review depth; the score only ranks within it.

## Failure-mode assessment (write it out)

For the highest-risk hunk, answer in one line each:

1. **Throws** — if it throws an unhandled exception, what does the end user see?
2. **Hangs / loops** — if it never returns, what stalls? (request, worker, UI thread)
3. **Wrong answer silently** — if it returns plausible wrong data, who notices and when? (This is the worst case — no alert fires.)
4. **Concurrent** — if two requests hit it at once, what state results?
5. **Rollback** — flag flip / revert deploy / data repair / impossible?

"Silently wrong" + "rollback needs data repair" = the review knob goes to max regardless of diff size.

## The knob → review depth

| Class | Human | Agents | Proof bar |
|---|---|---|---|
| Leaf (1–3) | Skim; read the gate check | 1 adversarial reviewer | Tests run + screenshot/log for visible change |
| Branch (4–6) | Read risky hunks | Adversarial reviewer; run tests yourself | + reproduction test that fails on base |
| Trunk (7–10) | **Deep read, named files/lines** — agent cannot sign off alone | Adversarial reviewer + relevant specialist (`security-reviewer` / `performance-reviewer`) | + invariant assertions, concurrency/boundary tests, rollback plan, telemetry metric |

## Gating check

- Is new behavior behind a flag that defaults OFF? Find the flag check in the diff; confirm it guards **every** entry point (a flag checked in the UI but not the API is not a gate).
- Does the repo already have a flag mechanism (`grep -rniE "isEnabled|featureFlag|flags\." src`)? An ungated trunk change in a repo that has flags is a finding by itself.
- What the flag **cannot** gate: migrations, data backfills, changed shared helpers, changed event payloads, dependency bumps. These stay trunk even inside a gated PR.
