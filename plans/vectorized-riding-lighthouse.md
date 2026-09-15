# Plan: Missing-field fixture pipeline (Stripe invoice)

## Context

Repo already turns an OpenAPI spec into TS types, deterministic JSON fixtures, and AI-enriched fixtures (3 packages, 5 harnesses). Goal: a reproducible pipeline that

1. samples a Stripe `invoice` fixture, deletes chosen fields (**corrupt**),
2. diffs corrupt fixture vs spec → `missing.json` + `missing.d.ts` (`Missing` type) + `missing.stub.ts` (**diff**),
3. lets an AI harness fill only the missing fields, with **model discovery + selection** per harness (**populate**),
4. merges filled values into the corrupt fixture and writes a validated JSON fixture (**merge**).

Decisions with user (2026-09-14): diff at JSON-schema level (not `.d.ts` parsing); deep recursive, required **and** optional (with a `--required-only` switch); corruption via `--drop` dotted paths; 2 new packages + extend `openapi-ai-fixtures`; separate CLIs + README walkthrough; model = `--model` flag, interactive numbered prompt in a TTY, harness default otherwise (no contract break); live discovery where possible, curated fallback; AI receives missing schema + full corrupt fixture + full schema.

Critic review (REJECT → fixed here): Stripe formats crash `prepareSchema` (Step 0); sampler leaves `{}` at schema cycles (cycle rule below); `missing.json` must be self-contained; lint `max-lines: 150` / `max-params: 4` force file splits; test shims are not exported (duplicate ~65 lines per package).

Ponytail: reuse schema toolkit, sampler, stub renderer, `parseArgs`, spawn-CLI test pattern. No new npm deps.

## Layout

```
packages/openapi-fixture-diff/     NEW  corrupt + diff
packages/openapi-fixture-merge/    NEW  merge → validated JSON
packages/openapi-ai-fixtures/      EXT  format fix, exports, --model, --list-models, --missing
packages/openapi-fixtures/         EXT  --required-only flag on the sampler CLI
packages/openapi-types/            EXT  generateTypes() accepts in-memory doc
tsconfig.json                      EXT  2 references
README.md, CLI.md                  EXT  walkthrough
```

New package = `package.json`, `tsconfig.json`, `tsconfig.lib.json`, `tsconfig.spec.json`, `vitest.config.ts` modelled on `packages/openapi-ai-fixtures` **including per-file `references`** to each `workspace:*` dep's `tsconfig.lib.json` (verbatim copy breaks the composite build). Run `pnpm install` after adding packages. Nx/vitest/eslint pick packages up by glob.

Dependency direction: `diff` → `openapi-ai-fixtures` (schema toolkit), `openapi-fixtures` (sampler, stub, import path), `openapi-types`; `merge` → `openapi-ai-fixtures` (validator).
`// ponytail: schema toolkit stays in ai-fixtures; extract @fixture-automation/openapi-schema when a third consumer appears.`

Lint constraints that shape file layout: `max-lines 150`, `max-params 4` (warn, and `--max-warnings=0`), `no-inline-object-types`, `no-nested-object-value`, `noPropertyAccessFromIndexSignature` (bracket access), `exactOptionalPropertyTypes`, `.ts` import extensions, no default exports, Gherkin `FEATURE > GIVEN > it('WHEN … THEN …')`.

## Step 0 — Unblock Stripe in the schema toolkit

`packages/openapi-ai-fixtures/src/utils/schema-document.util.ts` `assertKnownFormat` throws `unsupported schema format "unix-time"` (Stripe: 448× `unix-time`, 176× `currency`, 124× `decimal`; none in ajv-formats).

- Replace throw with collection: `schemaDocument` returns the document; a new `utils/schema-format.util.ts` `unknownFormats(document): string[]` lists formats not in `fullFormats`.
- `compileFixtureSchema` registers each unknown format as pass-through: `validator.addFormat(name, true)`. `// ponytail: unknown formats accept anything; add real validators per format if a fixture ever needs it.`
- Keep the `format must be a string` guard.
- Tests: spec with `format: unix-time` → `prepareSchema` succeeds, validator accepts integers, still rejects wrong `type`. Existing "unsupported format" test flips to "accepted".

## Step 1 — Expose reusable internals

- `packages/openapi-ai-fixtures/src/index.ts`: export `prepareSchema`, `compileFixtureSchema`, `schemaDialect`, types `PreparedSchema`, `SchemaDialect`. (`schemaGraph` **not** exported; diff uses `JSON.parse(prepared.context).components`, which is already normalized.)
- `packages/openapi-types/src/data-access/openapi-types.client.ts`: `generateTypes(spec: string | URL | Record<string, unknown>)` — object branch passes to `openapiTS(spec as OpenAPI3)` (`openapiTS` object arm requires `info`; supply `info: { title, version }` in the caller's doc). URL branch unchanged.
- `packages/openapi-fixtures/src/cli.ts`: `--required-only` boolean → `skipNonRequired: true` (today only implied by `--ts`). Update `CLI.md` table.

## Step 2 — `@fixture-automation/openapi-fixture-diff`

```
openapi-fixture-diff corrupt <fixture.json> <out.json> --drop <path,path,...>
openapi-fixture-diff diff <spec-url> <schema-name> --fixture <corrupt.json> --out-dir <dir> [--required-only]
```

First positional = subcommand; rest via `node:util` `parseArgs` (pattern: `packages/openapi-ai-fixtures/src/utils/ai-fixtures-cli.util.ts`).

**corrupt** — `utils/drop-path.util.ts`: dotted paths with `[i]` index (`lines.data[0].id`). Unknown path → error. Input never mutated.

**diff** — split to stay under 150 lines each:
- `utils/schema-resolve.util.ts`: `resolveRef(node, components)` (decode `encodeURIComponent`'d pointer segment, local `#/components/schemas/X` only), `mergeAllOf(node, components)`, `pickBranch(node, value, components)` for `anyOf`/`oneOf` — **resolve each branch first**, then: primitive/null value ⇒ no missing; object value ⇒ branch whose `properties` overlap value keys most; tie or all-zero ⇒ first branch that has `properties`.
- `utils/missing-walk.util.ts`: walker taking one `WalkInput` object (`{ schema, value, path, components, requiredOnly }`) → `MissingEntry[]` (`{ path, schema }`). Rules: `properties` key absent ⇒ missing (record whole sub-schema, no descent). Present + object ⇒ recurse. `items` + array ⇒ recurse per index. **Cycle rule:** a present value `{}` (empty object) is treated like any other object — every property is missing. This is correct (the sampler bottomed out there and data *is* absent) and terminates because recursion only descends into present values. `additionalProperties`/`patternProperties` ignored.
- `utils/missing-projection.util.ts`: nested object schema of missing props (arrays → `items` with union of missing keys across indices; exact indices live in `paths`).
- `data-access/fixture-diff.client.ts`: orchestration + writes.

Outputs in `--out-dir`:
- `missing.json` (self-contained): `{ schemaName, dialect, paths: string[], schema: <projection>, components: <prepared.context components> }`.
- `missing.d.ts`: in-memory doc `{ openapi: '3.1.0', info: { title: 'missing', version: '0' }, components: { schemas: { missing: schema, ...components.schemas } } }` (normalized schemas are 2020-12 style, so always declare 3.1) → `generateTypes(doc)` + append `export type Missing = components['schemas']['missing'];`.
- `missing.stub.ts`: `sample(schema, {}, doc)` → `typescriptStub('missing', typescriptImport(stubPath, dtsPath), json)`. Placeholder stub for **manual** fill / preview; the AI step consumes `missing.json`, not this file.
- Empty diff ⇒ `paths: []`, `Missing = Record<string, never>`, stderr "no missing fields", exit 0.

Tests: new `src/test/fixtures/nested/spec.json` (`$ref`, array, `allOf`, `anyOf[string|$ref object]`, `nullable`, `format: unix-time`, one cycle). Cases: drop ok/unknown path; missing top-level, nested, array element, `anyOf` object branch, `{}` cycle hole, `--required-only`; `missing.d.ts` compiles and `missing.stub.ts` typechecks (duplicate the `compiledStub` helper from `packages/openapi-fixtures/src/test/utils/compiled-stub.spec.util.ts`, parameterised on files, ~65 lines); CLI spawn via `--conditions=@fixture-automation/source` (pattern: `integration-project.spec.util.ts`).

## Step 3 — Model discovery + selection (`openapi-ai-fixtures`)

- `common/ai-fixtures.type.ts`: `AiFixtureOptions.model?: string` (`'default'` = no flag).
- `common/models.const.ts`: curated `Record<AiTool, string[]>` (claude `fable, opus, sonnet, haiku`; codex = today's cache slugs; gemini/copilot/antigravity best-known, commented "unverified, not installed here").
- `data-access/model-discovery.client.ts` `discoverModels(tool)` → `{ models, source: 'codex-cache' | 'curated' }`. codex: `${CODEX_HOME ?? ~/.codex}/models_cache.json`, `visibility === 'list'`, `slug`; unreadable → curated. Others curated. `// ponytail: no live list command for claude/gemini/copilot/agy; add when one ships.`
- `utils/model-select.util.ts` `selectModel({ tool, requested, interactive })`: requested ⇒ pass through (unknown slug ⇒ stderr warning, still used). Absent + `interactive` (stdin TTY) ⇒ `node:readline` numbered prompt with `0) harness default`. Absent + no TTY ⇒ `'default'`, stderr note. **No contract break**; existing specs untouched.
- Passthrough: codex `-m <slug>` **inserted before the trailing `'-'`**; claude `--model`; gemini `-m`; copilot `--model`; antigravity: non-default ⇒ throw `antigravity does not support --model`, `default` ⇒ unchanged.
- CLI: `--model <slug|default>`; `--list-models` handled **before** `parseAiFixtureArgs` positional check (needs `--tool`, prints list + source, exit 0, no spec load). Update `AI_FIXTURES_USAGE`.

Tests: cache parse with `CODEX_HOME` pointing at a fixture dir; fallback; selection matrix (`interactive` + readline stub injected); per-client arg tests assert exact index (`args.indexOf('-m') < args.indexOf('-')` for codex) via existing `vi.mock('./agent-process.client.ts')` pattern.

## Step 4 — `--missing` mode (`openapi-ai-fixtures`)

```
openapi-ai-fixtures <spec-url> <schema> [out] --fixture corrupt.json --missing missing.json --tool codex [--model gpt-5.5] [--scenario "..."] [--ts missing.d.ts]
```

- `utils/ai-fixtures-cli.util.ts`: `--missing <file>`; with it `--scenario` optional (default: "Fill every missing field with realistic values coherent with the baseline").
- `utils/fixture-prompt.util.ts`: `missingPrompt({ context, fixtureJson, missing, scenario })` → same JSON-object prompt; `instructions.response` = "Return exactly one JSON value conforming to `missing`. Include only its keys. Keep values coherent with `baseline` (currency, ids, totals)."
- `data-access/ai-missing-fixtures.client.ts` `aiMissingFixture(spec, options)`: builds prompt from `prepareSchema(spec, name).context` + `missing.json`, validates the reply with `compileFixtureSchema({ $ref: '#/components/schemas/missing', components: { schemas: { missing, ...missing.components.schemas } } }, missing.dialect)`.
- Output: JSON, or with `--ts` a stub via `typescriptStub('missing', import, json)` against `missing.d.ts` (`MISSING_STUB`).

Tests: prompt shape; missing-schema validation pass/fail; CLI integration with `src/test/fixtures/integration/enricher.mjs` extended for a missing-mode scenario.

## Step 5 — `@fixture-automation/openapi-fixture-merge`

```
openapi-fixture-merge <corrupt.json> <populated.json|populated.stub.ts> <out.json> [--spec <url> --schema <name>]
```

- `utils/load-populated.util.ts`: `.json` → parse; `.ts` → `await import(pathToFileURL(abs).href)` (Node 24 strips types; verified `import type … from "./missing.d.ts"` is erased). Exactly one export, else error.
- `utils/deep-fill.util.ts`: fill **absent** keys only; objects recurse; arrays zipped by index (`// ponytail: index-zip; keyed merge if ids matter`); returns `{ value, filled: string[] }`.
- `--spec`+`--schema` ⇒ `prepareSchema(spec, name).validate(merged)`; failure prints ajv paths, exit 1, nothing written. Without `--spec`: stderr warning, no validation.
- stderr: filled-path count. Writes 2-space JSON. This step is also the "stub → JSON" conversion.

Tests: fill/keep/zip/nested; `.ts` import; validation pass/fail; CLI spawn.

## Step 6 — Docs + wiring

- `tsconfig.json` references (2). `pnpm install`.
- Root `README.md`: "Three" → "Five"; 2 table rows; Workflow gains the walkthrough below. `CLI.md`: `--required-only`, `--model`, `--list-models`, `--missing`. New `packages/openapi-fixture-diff/README.md`, `packages/openapi-fixture-merge/README.md` (commands, outputs, cycle rule, index-zip limit).

## Execution

Delegate per step to `deep-executor` with this file; `test-engineer` writes failing specs first; `verifier` gates each step. Order: 0 → 1 → {2, 3, 5 in parallel} → 4 → 6. No commits unless asked.

## Verification

1. Baseline: `pnpm run build && pnpm run typecheck && pnpm run test && pnpm exec eslint . --ignore-pattern stripe.d.ts --max-warnings=0` — record pass/fail counts (root `stripe.d.ts` lint failure pre-exists).
2. After each step: same gates, delta vs baseline; real exit codes.
3. End-to-end with a real harness (manual, Codex usage):
   ```
   SPEC=https://raw.githubusercontent.com/stripe/openapi/master/latest/openapi.spec3.json
   node packages/openapi-fixtures/dist/cli.js $SPEC invoice tmp/invoice.json --required-only
   node packages/openapi-fixture-diff/dist/cli.js corrupt tmp/invoice.json tmp/corrupt.json --drop status,currency,lines.data[0].id
   node packages/openapi-fixture-diff/dist/cli.js diff $SPEC invoice --fixture tmp/corrupt.json --out-dir tmp --required-only
   node packages/openapi-ai-fixtures/dist/cli.js --list-models --tool codex
   node packages/openapi-ai-fixtures/dist/cli.js $SPEC invoice tmp/populated.stub.ts --fixture tmp/corrupt.json --missing tmp/missing.json --tool codex --model <picked> --ts tmp/missing.d.ts
   node packages/openapi-fixture-merge/dist/cli.js tmp/corrupt.json tmp/populated.stub.ts tmp/invoice.fixed.json --spec $SPEC --schema invoice
   ```
   Proof: with `--required-only` on both sampler and diff, `missing.json.paths` == the 3 dropped paths exactly; without `--required-only` on diff, the 3 are a subset and the rest are optional fields. `tsc` on `tmp/populated.stub.ts` passes; merge exits 0 after schema validation; `invoice.fixed.json` = `corrupt.json` + exactly the filled paths.
4. Interactive prompt checked once by hand in a TTY.

## Known limits (stated)

- gemini / copilot / agy not installed here → their model passthrough is reviewed, not live-tested.
- Array merge is index-zip; missing-schema validation does not check array length.
- `anyOf` branch pick is heuristic (max key overlap after `$ref` resolution).
- Unknown schema formats validate as pass-through.
