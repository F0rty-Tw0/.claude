# `openapi-fixture-wizard` — one interactive run through the whole pipeline

## Context

Five CLIs exist (types → fixtures → diff → AI fill → merge) and, as of today, each prompts for its own missing inputs. User now wants ONE package that walks the whole flow as a conversation. Decided with user:

- New package `packages/openapi-fixture-wizard` (`@fixture-automation/openapi-fixture-wizard`, bin `openapi-fixture-wizard`).
- **In-process library calls** — depends on the 5 packages, calls their exported functions. No child processes.
- Target = **schema name OR API route** (`GET /v1/invoices/{id}` → response `$ref` → schema name).
- Existing fixture = **one file path** → diff → AI fill → merge. No corrupt step.
- Interactive only. No TTY → `FixtureError('the wizard needs a terminal', 'run the individual CLIs instead')`. (Flags for scripted runs = follow-up if ever wanted.)

Reuse: `Inputs`/`promptedInputs`/`Question` from `packages/openapi-fixtures/src/common/input.type.ts` + `data-access/input-prompt.client.ts` (built earlier today). Every wizard question goes through them, so tests inject `answering(...)` exactly like `fixtures-cli-prompt.client.spec.ts`.

## Conversation (the spec — each line = one prompt)

```
spec-url            required   http(s):// or file:// URL of the spec
out-dir             optional   default: fixtures
target              required   schema name (invoice) OR route (GET /v1/invoices/{id})
format              choice     1) json  2) ts  3) both
existing-fixture    optional   path of a fixture to check; Enter = none → wizard ends after generation
required-only       flag       diff only required fields (y/N)
--- only when the diff found missing paths ---
fill-with-ai        flag       (y/N)
tool                choice     1) claude 2) codex 3) antigravity 4) copilot 5) gemini
model               choice     existing numbered picker (0 = harness default)
extra-prompt        optional   default: MISSING_SCENARIO
merge               flag       (y/N)
merged-file         optional   default: <out-dir>/<schema>.fixed.json
```

Every prompt shows `<label>: <description>` / `  e.g. <example>` (the `InputSpec` format).

## Files written (all under `<out-dir>`)

| step | files |
| --- | --- |
| ts / both | `<schema>.spec.json` (pruned, carries `x-root-schema`), `<schema>.d.ts` |
| json / both | `<schema>.fixture.json` |
| ts / both | `<schema>.fixture.ts` (stub importing `<schema>.d.ts`) |
| diff | `missing/missing.json`, `missing/missing.d.ts`, `missing/missing.stub.ts` |
| AI | `missing/populated.json` |
| merge | `<schema>.fixed.json` (validated against the spec) |

End of run: one stderr line per file written.

## Package layout (mirror `packages/openapi-fixture-merge`)

```
packages/openapi-fixture-wizard/
  package.json          deps: the 5 packages + shared (workspace:*); bin ./dist/cli.js
  tsconfig.json / tsconfig.lib.json (references: 5 packages + shared) / tsconfig.spec.json / vitest.config.ts
  README.md             What it does → Quick start (transcript in ```text) → Prompts table → Files written → Errors → Gotchas → Develop
  src/cli.ts            runCli('openapi-fixture-wizard', …) + TTY guard, then runWizard(promptedInputs(), wizardDeps())
  src/index.ts          export { runWizard }, types
  src/common/wizard.const.ts   WIZARD_INPUTS (one InputSpec per prompt above), FORMATS, TOOLS, USAGE
  src/common/wizard.type.ts    WizardDeps { fill: AiMissingFactory-maker, discover: typeof discoverModels }, WizardTarget, WizardFormat, StepResult types
  src/utils/route-schema.util.ts   resolveTarget(spec, answer) → schema name (+ spec)
  src/utils/choice.util.ts         parseChoice(answer, options) → option | undefined (pure)
  src/data-access/choose.client.ts choose(question, label, options) → numbered list on stderr, 3 attempts (same shape as model-select's askForModel)
  src/data-access/generate.client.ts   step 4: pruneSpec + generateTypes + fixtures + typescriptStub → files
  src/data-access/diff.client.ts       step 5: readJsonFile + diffFixture + writeMissingFiles
  src/data-access/fill.client.ts       step 6: choose tool → discoverModels/selectModel → aiMissingFixture → populated.json
  src/data-access/merge.client.ts      step 7: mergeFixture
  src/data-access/wizard.client.ts     runWizard(inputs, deps): sequences the steps, prints the summary
  src/test/fixtures/invoice/spec.json  copy of openapi-fixtures' invoice spec, with a `paths` block added (GET /v1/invoices/{id} → $ref invoice; GET /v1/invoices → items.$ref)
```

### Target resolution (`route-schema.util.ts`)

Answer starts with an HTTP verb (`/^(get|post|put|patch|delete)\s+\//i`) → route: `spec.paths[path][verb].responses` → first `2xx` (else `default`) → `content['application/json'].schema` → `$ref` → `referenceName()` (exported by openapi-fixtures); `items.$ref` also accepted (list endpoints). Anything else (inline schema, no JSON content, unknown path) → `FixtureError('… has no named response schema', 'answer the schema name instead, e.g. invoice')`. Otherwise → schema name: must exist under `components.schemas`, else `FixtureError` with `schemaSuggestion()`. `// ponytail: $ref and items.$ref only; oneOf/allOf responses → answer the schema name`.

### Small edits outside the new package

- `packages/openapi-fixtures/src/common/openapi.type.ts`: `readonly paths?: Record<string, unknown>` on `OpenApiSpec` (pruneSpec already drops it; type just didn't name it).
- `packages/openapi-ai-fixtures/src/index.ts`: export `discoverModels`, `selectModel`, `MISSING_SCENARIO`, types `ModelDiscovery`, `ModelSelection`.
- Root `tsconfig.json`: add the reference. `pnpm-workspace.yaml` already globs `packages/*`.
- 🟡 `pnpm install` once to link the new workspace package.

### Dependency injection (only what touches the network/process)

`WizardDeps = { fill: (options: AiFixtureOptions) => AiMissingFactory; discover: (tool) => Promise<ModelDiscovery> }`, defaults `{ fill: aiMissingFixture, discover: discoverModels }`. Everything else (file IO, sampling, diff, merge) runs for real in tests against a tmp dir — matches the repo's "no mocks for things that can run for real" rule.

## Tests

- `route-schema.util.spec.ts`: schema name ok; unknown name → suggestion; `GET /v1/invoices/{id}` → `invoice`; `GET /v1/invoices` → items ref; inline response → error; unknown path → error.
- `choice.util.spec.ts` + `choose.client.spec.ts`: number in range, blank/out-of-range retry, 3 fails → error.
- `wizard.client.spec.ts` (end-to-end, tmp dir, fake `question` + fake `fill` returning the missing values, fake `discover` returning `{ models: ['m1'], source: 'curated' }`):
  1. json only, no existing fixture → `invoice.fixture.json` exists, no `missing/` dir, question count = 5.
  2. both + existing fixture with 2 fields removed + AI yes + merge yes → `invoice.d.ts`, `invoice.fixture.ts`, `missing/missing.json`, `missing/populated.json`, `invoice.fixed.json` all exist; fixed file validates (mergeFixture does it); `fill` called once with `schemaName === 'invoice'`.
  3. existing fixture complete → prints `no missing fields`, `fill` never called.
  4. AI answered `n` → no populated.json, merge never asked.
- `cli.spec.ts` (spawn, non-TTY): bare run → exit 1, stderr `the wizard needs a terminal`; `--help` → exit 0.

## Verification

1. Baseline right now: 411 tests, typecheck + lint clean (from this session). Re-run after.
2. `pnpm install` → `pnpm build` → `pnpm test` / `pnpm typecheck` / `pnpm lint`; report deltas.
3. Piped smoke: `node packages/openapi-fixture-wizard/dist/cli.js < /dev/null` → the terminal error, 3-line format.
4. Real terminal (user): `node packages/openapi-fixture-wizard/dist/cli.js`, answer with the Stripe spec + `GET /v1/invoices/{id}`, format `both`, an existing invoice fixture, codex → check `fixtures/` contents. Capture that transcript into the README Quick start.

## Out of scope (say so in README Gotchas)

- Non-interactive flags. Multiple existing fixtures per run. AI enrichment of the freshly generated fixture (scenario mode) — the individual `openapi-ai-fixtures` CLI still does that. `oneOf`/`allOf` route responses.
