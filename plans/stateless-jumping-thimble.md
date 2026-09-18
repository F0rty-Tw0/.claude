# Plan: clear CLI errors + scannable docs for all five packages

## Context

**Problem.** Five CLIs (`openapi-types`, `openapi-fixtures`, `openapi-fixture-diff`, `openapi-fixture-merge`, `openapi-ai-fixtures`). When a user makes a mistake, they get no clear notice of what went wrong or how to fix it. Verified by running bad inputs against the built CLIs:

| Mistake | What the user sees today |
| --- | --- |
| bare path instead of URL (`invoice.json`) | `TypeError: Invalid URL` + 10-line Node stack |
| `--foo` unknown flag (fixtures) | raw `ERR_PARSE_ARGS_UNKNOWN_OPTION` stack |
| `--foo` unknown flag (types; no `parseArgs` there) | `--foo` is taken as the spec URL → `TypeError: Invalid URL` stack |
| `https://…/nope.json` (404) | `fetch` never checks status; `JSON.parse` dumps the HTML body as a `SyntaxError` |
| YAML spec to fixtures/diff/merge/ai | `Unexpected token` JSON error, no mention of YAML |
| fixture JSON passed as the spec | `schema not found: invoice` (spec check accepts any object) |
| `--fixture nope.json` | `ENOENT: no such file or directory, open '…'`, no flag named |
| bad JSON in `--fixture` | `Expected property name … at position 1`, no file named |
| `schema not found: invoic` | no hint of valid names |
| `--help` | only merge + ai support it; types/fixtures/diff don't |

`openapi-types` and `openapi-fixtures` CLIs have **no top-level catch at all**. The other three have an identical 12-line catch that prints the bare message. `CLI.md` even documents "failures can include a Node stack trace" as expected behavior.

**Docs.** ~1670 lines across 7 markdown files, prose-heavy, inconsistent structure, and the fixtures `CLI.md` (467 lines) mixes two packages. User has dyslexia + ADHD; docs must be scannable.

**Decisions taken by user (2026-09-14):**
- Full docs rewrite on one shared skeleton; fold `CLI.md` into the package READMEs; keep `PROVIDERS.md` unchanged (verification record).
- Error format: tool prefix + `fix:` line + `see: <tool> --help`, three lines max.

**Baseline (captured):** `pnpm run test --skip-nx-cache` → 5/5 projects green. Lint/typecheck/format baseline to capture as step 0 (root README notes `stripe.d.ts` previously failed lint/format).

---

## Part A — Error handling (code)

### A1. Shared error primitives in `@fixture-automation/openapi-fixtures`

Three of the four other packages already depend on it (`diff`, `merge`, `ai` import `loadSpec`). `openapi-types` stays independent by design (README states it) → it gets an inline copy of the catch block.

**New `src/common/fixture-error.ts`** — one class, mirrors the existing `AgentTerminationError` pattern (`erasableSyntaxOnly` safe: no parameter properties).

```ts
export class FixtureError extends Error {
  public override readonly name = 'FixtureError';
  public readonly fix: string | undefined;
  constructor(message: string, fix?: string) { super(message); this.fix = fix; }
}
```

**New `src/data-access/cli-runner.client.ts`** (does I/O → `data-access` per repo convention):

```ts
export const runCli = async (tool: string, run: () => Promise<void>): Promise<void>
```
- `try { await run() } catch (e) { … process.exitCode = 1 }`
- stderr lines: `${tool}: ${message}`, then `  fix: ${fix}` when present, then `  see: ${tool} --help`.
- Normalizes the two Node error families that leak today, so *every* CLI gets it for free:
  - `code` starts with `ERR_PARSE_ARGS` → keep message up to the first `. `(drops Node's positional-argument lecture).
  - `code === 'ENOENT'` (with `path`) → `file not found: <path>` (fallback; read sites below give the flag name).
- Never prints a stack. No `--verbose`; YAGNI until asked.

**New `src/data-access/json-file.client.ts`**:

```ts
export const readTextFile = async (label: string, file: string): Promise<string>
export const readJsonFile = async (label: string, file: string): Promise<unknown>
```
- `readTextFile`: ENOENT → `FixtureError('<label> file "x" does not exist', 'check the path; it is resolved from the current directory')`
- `readJsonFile` = `readTextFile` + parse; parse failure → `FixtureError('<label> file "x" is not valid JSON: <parser msg>')`
- `readJsonFile` replaces the copy-pasted `readFile + JSON.parse` in diff (`readJson`), merge (`mergeFixture`, `loadPopulated` .json branch), ai (`generate`).
- `readTextFile` only (not `readJsonFile`) in ai `missingInput`: `parseMissingFile(text: string)` owns its own parse and stays untouched.

**New `src/utils/schema-suggestion.util.ts`** (pure):

```ts
export const schemaSuggestion = (names: string[], query: string): string
```
- Case-insensitive substring/prefix match, max 5 → `did you mean invoice, invoice_item?`
- No match → `available: a, b, c, d, e … (N total)`.
- Used by `fixtures.client.ts` (`schema not found`) and `openapi-ai-fixtures/src/utils/schema-graph.util.ts` (`schema "x" is unavailable`, which is what diff/merge/ai hit via `prepareSchema`).

Export `FixtureError`, `runCli`, `readJsonFile`, `schemaSuggestion` from `src/index.ts`.

### A2. `loadSpec` — the error source shared by 4 packages

`packages/openapi-fixtures/src/data-access/openapi-spec.client.ts` + `src/utils/openapi-spec.util.ts`:

| Input | Throw |
| --- | --- |
| `new URL()` fails | `spec must be a URL, got bare path "x"` · fix: `file:///E:/abs/x` via `pathToFileURL(resolve(x)).href` |
| protocol not http/https/file | `unsupported spec URL scheme "ftp:"` · fix: `use https:// or file://` |
| file read ENOENT | `spec file not found: <path>` |
| `!response.ok` | `spec download failed: HTTP 404 for <url>` · fix: `open the URL in a browser; it must return raw JSON` |
| fetch throws (DNS etc.) | `spec download failed for <url>: <cause.message>` |
| text starts with `openapi:` (YAML) | `spec at <url> is YAML; this loader reads JSON only` · fix: `convert to JSON (openapi-types accepts YAML)` |
| other parse failure | `spec at <url> is not JSON: <msg>` · fix: `use the raw JSON link, not an HTML page` |
| parsed object lacks `components.schemas` object | `spec at <url> has no components.schemas` · fix: `pass the OpenAPI document, not a fixture` |

`isOpenApiSpec` today is `typeof value === 'object'` — tighten to also require `components.schemas` to be a record (test spec `invoice/spec.json` has `openapi: 3.0.0` + `components.schemas`, so the check is safe). Keep `openapi` field optional; diff already handles a missing dialect.

### A3. Per-CLI wiring

**Two texts per CLI, not one.** Today the usage constants are both thrown as errors *and* printed as help (`AI_FIXTURES_USAGE` is already 4 lines). Split:
- `<TOOL>_HELP` — long, one line per flag (`  --fixture <file>   corrupt JSON fixture (required)`), printed to **stdout** on `--help`/`-h`, exit 0.
- `<TOOL>_USAGE` — one-line synopsis, thrown as `FixtureError(USAGE)`. Keeps the 3-line stderr contract.

Per CLI:
- `openapi-fixtures/src/cli.ts`: move body into `src/data-access/fixtures-cli.client.ts` (`runFixturesCli(args)`), add `help` to the `parseArgs` options, `--help` → stdout HELP, exit 0. `cli.ts` becomes `await runCli('openapi-fixtures', () => runFixturesCli(process.argv.slice(2)))`. `--ts` missing file → `--ts file "x" does not exist`.
- `openapi-fixture-diff`: `--help` handled at **two layers**. (a) In `runFixtureDiffCli` **before** the subcommand dispatch: `--help`/`-h`/no args → stdout HELP, exit 0 (today bare `--help` throws usage, exit 1). (b) `help` added to both `corruptOptions` and `diffOptions` in `fixture-diff-cli.util.ts` (both are strict `parseArgs`), with an early return so `diff --help` works. `dropPaths` unknown key → fix listing the keys present on that object (only the key-missing branch of `assertKey`, `drop-path.util.ts:39`; the not-a-record and index branches keep their message).
- `openapi-fixture-merge`, `openapi-ai-fixtures`: replace the 12-line catch with `runCli(...)`. Merge: `--spec and --schema must be used together` → fix `--spec <url> --schema invoice`; schema violation → fix `fix the listed paths in the populated file, or re-run the AI fill`. AI: `ai-tool.util.ts` `--tool is required` → fix `--tool codex` (list the five). Keep the 82 internal throw sites as-is; runner formats them. Do **not** rewrite agent-process errors.
- `openapi-types/src/cli.ts`: today reads `argv` raw, no `parseArgs`. Add `parseArgs({ options: { help: { type: 'boolean', short: 'h' } }, allowPositionals: true })` — `allowPositionals` is mandatory or every normal call throws `ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL`. Inline try/catch printing the same 3-line format (no dependency added). Bare path → same hint as A2. `openapi-typescript` `ResolveError` (404 / missing file) → `spec could not be loaded: <its message>`.

### A4. Tests (vitest, GIVEN/WHEN/THEN style already in repo)

- `openapi-fixtures`: `openapi-spec.client.spec.ts` + bare path, 404 (reuse `src/test/utils/served-spec.spec.util.ts`, add a status param), YAML text, fixture-as-spec. New `cli-runner.client.spec.ts`: captures stderr lines + exitCode for `FixtureError` with/without fix, parseArgs error, plain Error. New `schema-suggestion.util.spec.ts`. New `json-file.client.spec.ts` (missing / bad JSON). `fixtures.client.spec.ts`: suggestion in message.
- `openapi-fixtures`: new `fixtures-cli.client.spec.ts` spawning `src/cli.ts` with `--conditions=@fixture-automation/source` (copy the 10-line `run` pattern from `openapi-fixture-merge/src/test/utils/merge-project.spec.util.ts`): `--help` exit 0 on stdout; bare path → 3-line stderr, exit 1, no `at ` stack lines.
- `openapi-types`: new `cli.spec.ts`, same spawn pattern: `--help` exit 0; bare path → 3-line stderr.
- `openapi-fixture-diff` `fixture-diff-cli.client.spec.ts`: missing `--fixture` file → stderr has `--fixture file "…" does not exist` + `see: openapi-fixture-diff --help`; bare `--help` and `diff --help` both exit 0.
- `openapi-fixture-merge` `fixture-merge-cli.client.spec.ts`: existing "fails without writing" cases gain a stderr assertion on the new format.
- `openapi-ai-fixtures` `ai-fixtures-cli.client.spec.ts`: bad JSON `--fixture` → labelled message.
- `openapi-types` `openapi-types.client.spec.ts`: bare path message.

Delegate code to `deep-executor` (multi-file, 5 packages). Run `/rdx-audit` on the diff before presenting (>150 lines).

---

## Part B — Docs (full rewrite, one skeleton)

### B1. Skeleton for every package README

```
# @fixture-automation/<name>
<one sentence>

## What it does          3 bullets max
## Quick start           2–4 copy-paste commands against the checked-in spec + the REAL output
## Command               usage block + flags table: flag | required? | meaning
## Examples              2–4 scenarios: command → what you get (real output, trimmed)
## Errors                table: what you see | why | fix   ← real stderr from Part A
## Library               import + one example + signature list
## Gotchas               bullets, bold first words
## Develop               test/build commands + source ownership (short)
```

Formatting rules (user accessibility): one idea per line, tables over prose, bold one anchor word per bullet, no italic runs, gloss jargon once, no paragraph >3 lines.

### B2. Files

| File | Action |
| --- | --- |
| `README.md` (root) | Rewrite: ASCII pipeline diagram → choose-a-package table → Setup → full corrupt→diff→fill→merge walkthrough (keep, it's good, verify commands) → **"Rules every tool shares"** (spec must be a URL; JSON only except types; exit 0/1; `--help`; error format sample) → AI/security pointer to PROVIDERS.md → Develop |
| `packages/openapi-types/README.md` | Rewrite on skeleton |
| `packages/openapi-fixtures/README.md` | Rewrite on skeleton; absorb `CLI.md` §Build…§Exit status (fixture half) |
| `packages/openapi-fixtures/CLI.md` | **Delete.** AI half (§AI fixture CLI → end) moves into ai README. Remove `"CLI.md"` from `packages/openapi-fixtures/package.json` `files`. |
| `packages/openapi-ai-fixtures/README.md` | Rewrite on skeleton; absorb AI CLI sections (model selection, missing-fill, executable/timeout, troubleshooting). Keep the security warnings verbatim in Gotchas. |
| `packages/openapi-ai-fixtures/PROVIDERS.md` | **Unchanged** except the 3 links to `CLI.md` → point at the new ai README anchors |
| `packages/openapi-fixture-diff/README.md` | Rewrite on skeleton |
| `packages/openapi-fixture-merge/README.md` | Rewrite on skeleton |

All `CLI.md` links (root README ×5, types README ×1, ai README ×1, PROVIDERS ×3, fixtures README ×2) retargeted. Grep `CLI.md` must return 0 hits in `*.md`/`package.json` when done.

### B3. Real examples only

Offline specs, chosen per package:
- **types, fixtures**: `packages/openapi-fixtures/src/test/fixtures/invoice/spec.json` (schema `invoice`: `id`, `amount_due`, `status`, optional `memo`; flat).
- **diff, merge**: `packages/openapi-fixture-diff/src/test/fixtures/nested/spec.json` (schema `order` → `customer`/`lines[]`/`supplier`, `$ref` + `allOf` + array). The flat invoice spec cannot show `lines[0].id` array paths or the transitive `components` closure.
- **merge** populated input: hand-written JSON in the walkthrough (`populated.json` with the dropped values). That is a legitimate input path and needs no AI.
- **ai**: quick start command is shown; output is a **live run** if `codex` is installed and authenticated on this machine (memory: verified with `gpt-5.5` on 2026-09-14). If not available, the output block is labelled "recorded 2026-09-14, not re-run" — never fabricated.
- **root** pipeline walkthrough keeps Stripe (online). Steps 1–3 and 6 re-run; steps 4–5 (AI) as above.

`file://` URLs are not portable across shells (Git Bash `$PWD` yields `/e/...`, which Node rejects). Every doc sets the URL **once** with a one-liner that works in bash and PowerShell, then reuses `$SPEC`:

```bash
SPEC=$(node -p "require('node:url').pathToFileURL('packages/openapi-fixture-diff/src/test/fixtures/nested/spec.json').href")
```

Every command in a doc is executed and its real output pasted (trimmed with `…` where long). Every Errors-table row is produced by actually triggering it after Part A ships.

Delegate to two `writer` agents in parallel with `model: sonnet` (haiku default is too weak for a 1600-line accessibility rewrite): agent 1 = root + types + fixtures; agent 2 = diff + merge + ai + PROVIDERS links. Both receive the skeleton, the formatting rules, and a captured file of real command outputs.

---

## Sequence

0. Capture baseline: `pnpm run lint`, `pnpm run typecheck`, `pnpm run format:check` (record failures), and the **test count** per package via `pnpm exec vitest run --reporter=verbose 2>&1 | tail` (record `Tests N passed`).
1. Part A via `deep-executor` → build → run the bad-input matrix from Context by hand, paste outputs to `scratchpad/errors.txt`.
2. Run every doc command against the offline spec, paste outputs to `scratchpad/examples.txt`.
3. Part B via 2× `writer` (sonnet) in parallel.
4. Gates: `pnpm run build && pnpm run typecheck && pnpm run test --skip-nx-cache && pnpm run lint && pnpm run format:check`; delta vs step 0.
5. `/rdx-audit` on the code diff; `code-reviewer` pass on the whole step.

## Verification

- Each row of the Context table re-run against `dist/cli.js` shows exactly: `<tool>: <message>` / optional `  fix: …` / `  see: <tool> --help`, exit code 1, **no stack trace**.
- `<tool> --help` exits 0 for all five, prints usage to stdout.
- Test count strictly grows vs the step-0 number; 5/5 projects green.
- A real OpenAPI doc with `paths` but no `components.schemas` now fails in fixtures/diff/merge/ai (was: silent). Named in each README's Errors table.
- `grep -rn CLI.md --include=*.md --include=package.json` → 0 hits outside `.nx/`.
- Every code block in every README executed once; output matches what's pasted.
- Root pipeline walkthrough (Stripe) re-run end to end through step 3 (diff); AI step skipped unless a harness is available — noted honestly in the closing status.

## Out of scope (named, not silently dropped)

- Rewriting the ~80 internal AI process/provider error messages. Runner formats them; wording stays.
- `--verbose` / stack-on-demand flag. Add when someone asks.
- Machine-readable error codes. Docs already say categories are not stable codes.
- Committing. Repo has zero commits; user hasn't asked.
- Accepting bare filesystem paths as spec input. Would delete the most common error class entirely, but it is a behavior change beyond "error handling". Cheap follow-up if wanted.

## Critic pass

`critic` rejected v1 with 9 defects (types has no `parseArgs`; `--help` breaking positionals; diff help layer; `parseMissingFile` signature; usage-vs-help text collision; missing fixtures/types CLI specs; no test-count baseline; flat spec can't demo diff; link count). All folded in above.
