# Unit Testing

## Contents

- [Core Principle](#core-principle)
- [Quick Reference](#quick-reference)
- [Layout](#layout)
- [Stubs](#stubs)
- [Mocks](#mocks)
- [Fixtures](#fixtures)
- [Spec Utils](#spec-utils)
- [Spec Per Module](#spec-per-module)
- [Procedure](#procedure)
- [Example](#example)
- [Rationalizations](#rationalizations)
- [Red Flags](#red-flags)
- [Common Mistakes](#common-mistakes)

## Core Principle

A spec file holds cases and assertions only. Everything a spec needs but does not assert on lives under the owning feature's `test/` folder, in one of five named sub-folders: `test/common/`, `test/stubs/`, `test/mocks/`, `test/fixtures/`, `test/utils/`. No test-only file exists outside `test/` except the `.spec.ts` beside its module. `common/` and `utils/` hold production shapes only.

## Quick Reference

| Concern | Rule |
|---|---|
| Spec file | Sibling `<module>.spec.ts` beside every module it covers; `<feature>.<group>.spec.ts` at the feature root only for integration through the entry file. Contains cases, assertions, and the hooks that own its temp state. Nothing else. |
| Stub | One typed base value per type a spec builds: `export const <TYPE>_STUB: <Type> = { ... }` in `test/stubs/<feature>.stub.ts`. Specs spread it and override only what the case asserts on. |
| Mock | One factory per collaborator whose calls a spec asserts on: `export const <type>Mock = (): <Type> => ({ send: vi.fn() })` in `test/mocks/<feature>.mock.ts`. A stub is data; a mock is behavior. |
| Fixture | Content the subject reads from disk, or a sample project a spec copies to a temp directory. Real files under `test/fixtures/<name>/`. Never a `.ts` module exporting strings. |
| Spec util | Test-only behavior in `test/utils/<behavior>.spec.util.ts`: rule lookup, tester wiring, source builders, message formatters, temp-project copy and dispose. Exports functions only. |
| Test type | A type or const only test files share lives in `test/common/<feature>.type.ts` / `<feature>.const.ts`, the same shape as production `common/`. A spec util, stub, or mock never exports a type. |
| Forbidden shapes | No `.spec-support.ts`, `.spec-helper.ts`, `.test-utils.ts`, `<feature>-fixture.ts`, `__mocks__/`, `helpers/`. No `.stub.ts`, `.mock.ts`, or `.spec.util.ts` outside its `test/` sub-folder. No `fixtures/` directory outside `test/`. No `common/stubs/`, `common/fixtures/`, or `utils/*.spec.util.ts`. No exported type from a `.spec.util.ts`. |
| Placement | Nearest owner. `test/` sits beside `common/` and `utils/` in the feature root. Specs in sibling sub-folders that share setup use the feature root `test/`. |
| Cross-package support | Test support two packages share lives in a dedicated `testing` library. That library is its own `test/` home: `src/lib/stubs/`, `src/lib/mocks/`, `src/lib/utils/` without a `test/` level. Production packages never import it. |
| Runner globs | Stubs, mocks, and spec utils end in `.stub.ts`, `.mock.ts`, `.spec.util.ts`, never `.spec.ts`, so the runner cannot collect them. Fixtures stay excluded from the runner, typecheck, and lint by the `**/fixtures/**` glob. |
| Build globs | The library tsconfig excludes `**/test/**` alongside `**/*.spec.ts`; the spec tsconfig includes `**/test/**/*.ts` and excludes `**/fixtures/**`. One glob per side. Verify with `tsc -p tsconfig.lib.json --listFilesOnly`. |
| Production imports | Production code never imports from `test/`. |
| Barrels | None. Import each stub, mock, and util file directly. |
| Gate | Every prior test name still present, typecheck clean, lint clean, sibling check clean, and no forbidden file shape remains. |

## Layout

```text
<feature>/
  common/
    <feature>.type.ts           types and consts only, imported by production
  test/
    common/
      <feature>.type.ts         types and consts only test files import
    fixtures/
      <sample-project>/         real files the subject reads
    mocks/
      <feature>.mock.ts         behavior doubles, one factory per collaborator
    stubs/
      <feature>.stub.ts         typed base values
    utils/
      <behavior>.spec.util.ts   test-only behavior
  utils/
    <behavior>.util.ts          production, pure
  <feature>.<group>.spec.ts
```

`test/` contains only the sub-folders it needs. Do not create an empty `mocks/` or `fixtures/` ahead of a file that goes there.

## Stubs

A stub is the smallest valid value of a type, declared once, typed explicitly, and named after the type.

```ts
// test/stubs/http-client.stub.ts
import type { HttpClientOptions } from '../../common/http-client.type';

const retry = { attempts: 1, delayMs: 0 };

export const HTTP_CLIENT_OPTIONS_STUB: HttpClientOptions = {
  baseUrl: 'http://localhost',
  timeoutMs: 1000,
  retry
};
```

| Concern | Rule |
|---|---|
| Name | `SCREAMING_SNAKE` of the type plus `_STUB`. `HttpClientOptions` → `HTTP_CLIENT_OPTIONS_STUB`. |
| Type | Explicit annotation with the real type. Never `as`, never `satisfies`, never an inline shape. |
| Content | Defaults only. No case-specific data. A value the case asserts on is set in the spec by spreading. |
| Granularity | One stub per type. Two variants of the same type are one stub plus overrides in the spec. |
| Trigger | Create a stub when a spec builds a value and skips fields it does not assert on, or when two specs build the same type. A `{ code, filename }` pair written out in full each time is a case, not a stub. |
| Dependency types | Allowed. A stub of a library's options type is a stub. |
| File | `test/stubs/<feature>.stub.ts`, mirroring `common/<feature>.type.ts`. Split by feature when over the module-size ceiling. |

Usage:

```ts
const options: HttpClientOptions = {
  ...HTTP_CLIENT_OPTIONS_STUB,
  timeoutMs: 50
};
```

## Mocks

A mock is a collaborator whose calls the spec asserts on. It is behavior, so it is a factory, not a value: every call returns fresh spies.

```ts
// test/mocks/mailer.mock.ts
import { vi } from 'vitest';

import type { Mailer } from '../../common/mailer.type';

export const mailerMock = (): Mailer => ({ send: vi.fn() });
```

| Concern | Rule |
|---|---|
| Name | camelCase of the type plus `Mock`, as a function. `Mailer` → `mailerMock()`. |
| Type | Return type is the real collaborator type. Never a partial shape cast to it. |
| Trigger | The spec asserts `toHaveBeenCalled` on it, or it must fail a call. Otherwise it is a stub. |
| Scope | One factory per collaborator type. Per-case behavior is set in the spec with `mockReturnValue` / `mockRejectedValue` on the instance. |
| File | `test/mocks/<feature>.mock.ts`. |
| Never | A module-level `vi.fn()` shared across specs; a mock of the subject under test; `vi.mock('./module')` when a factory can be injected. |
| Lint | Every export of a `test/mocks/*.mock.ts` file is a function named `<camelCase>Mock` with an explicit return type. Anything else in that file is reported. |

## Fixtures

A fixture is data on disk. The subject reads it, or a spec util copies it somewhere the subject can write to.

| Concern | Rule |
|---|---|
| Form | Real files: `.ts`, `.html`, `.json`. Never a TypeScript module that exports a string. |
| Location | `test/fixtures/<sample-name>/`. One directory per sample project or sample set. A `fixtures/` directory anywhere else is reported. |
| Static content | Static sample content moves out of the spec into a fixture file. Inline code strings inside a spec are allowed only when the string is the case itself and is passed directly to the subject. |
| Generated content | A sample the spec rewrites mid-test with parametrised variants may be produced by a source builder in a spec util. The builder is the single source; do not also keep the default output as a file. |
| Read-only use | Point the subject at the fixture directory in place. No temp copy. |
| Mutating use | Copy the fixture directory to a temp directory through a spec util that returns `dispose`. The spec owns the `afterAll` that calls it. |
| Path lookup | One spec util in `test/utils/` resolves `../fixtures/<name>` from `import.meta.dirname`. Specs never build the path by hand. |
| Exclusion | Fixtures stay under `**/fixtures/**` so runner, typecheck, and lint globs keep ignoring them. |

## Spec Utils

A spec util is test-only behavior. It follows `utility-style.md` with two named exceptions.

| Concern | Rule |
|---|---|
| Filename | `test/utils/<behavior>.spec.util.ts`. Named by output: `client-under-test.spec.util.ts`, `order-source.spec.util.ts`, `fixture-project.spec.util.ts`. |
| Contents | Subject lookup and harness wiring, option builders that spread stubs, source string builders, message formatters, fixture path lookup, temp-project copy and dispose. |
| Exception 1 | Test-harness wiring is allowed: binding a third-party tester to the runner, building a shared harness instance. |
| Exception 2 | Filesystem I/O is allowed only inside a temp directory the util creates, and only when the util returns `dispose`. |
| Otherwise pure | Every other export passes the purity gate. Source builders, formatters, and config builders take arguments and return values. |
| Exports | Functions only, lint-enforced. A type test files share goes to `test/common/<feature>.type.ts`; a type production also imports goes to `common/<feature>.type.ts`. Export only what two or more specs import, or what one spec imports because it would otherwise be setup inside the spec. |
| Size | Module-size ceiling applies. Split by behavior, not by which spec uses it. |

## Spec Per Module

Every module owns the spec that proves its behavior. The spec sits beside the module and carries its name.

| Concern | Rule |
|---|---|
| Naming | `order-pricing.ts` → `order-pricing.spec.ts` in the same folder. `csv-line.util.ts` → `csv-line.util.spec.ts`. |
| Boundary | Cases go through the public boundary the module serves: a service through its public method, a plugin through its host's tester, the util through its exported function. Never export an internal so the sibling spec can call it. |
| Grouping | A case lives in the spec of the module whose logic makes it pass. A case that would pass with the module deleted belongs elsewhere. |
| Utils | A pure `.util.ts` gets direct unit tests of its exported functions: boundaries, empty input, unchanged input. |
| Integration | The entry file is exempt from a sibling spec when `<feature>.<group>.spec.ts` at the feature root runs the whole feature (fixture sweep, editor session). |
| Exempt | `*.type.ts`, `*.const.ts`, everything under `test/`, and entry files covered by an integration spec. Nothing else. |
| Orphans | A spec with no sibling module is misplaced. Move its cases to the owning modules or rename it as an integration spec at the feature root. |
| Splitting | When `module-size.md` splits a module, its spec splits the same way: each new chunk takes the cases it owns. |
| Gate | The check below prints nothing but the entry files. Every test name from before a regrouping still exists after it. |

Check, run from the feature folder:

```sh
# modules without a sibling spec
for f in $(find . -name '*.ts' -not -path '*/test/*' -not -name '*.spec.ts' -not -name '*.type.ts' -not -name '*.const.ts'); do
  [ -f "${f%.ts}.spec.ts" ] || echo "missing spec: $f"
done
# specs without a sibling module (feature-root integration specs excepted)
for f in $(find . -mindepth 2 -name '*.spec.ts' -not -path '*/test/*'); do
  [ -f "${f%.spec.ts}.ts" ] || echo "orphan spec: $f"
done
# test-only files outside test/
find . \( -name '*.stub.ts' -o -name '*.mock.ts' -o -name '*.spec.util.ts' -o -path '*/fixtures/*' \) -not -path '*/test/*'
```

Entry files show up as `missing spec` by design. Confirm each has an integration spec at the feature root and that nothing else is listed.

## Procedure

1. List test-only files that are not `.spec.ts` and not under `test/`:

   ```sh
   find . -name '*.ts' -not -name '*.spec.ts' -not -path '*/test/*' -not -path '*/node_modules/*' \
     | xargs grep -l "vitest\|jest\|describe(\|mkdtempSync\|_STUB\|vi.fn"
   ```

2. Map every export and every inline block in the specs to a destination:

   | Item | Kind | Destination |
   |---|---|---|
   | `client`, `harness`, `subjectName` | harness wiring | `test/utils/client-under-test.spec.util.ts` |
   | `orderFile(lines, header)` | source builder | `test/utils/order-source.spec.util.ts` |
   | inline options objects | typed value | `test/stubs/<feature>.stub.ts` + spread in spec |
   | `{ send: vi.fn() }` built per spec | behavior double | `test/mocks/<feature>.mock.ts` factory |
| type declared in a spec util or duplicated across specs | test-only type | `test/common/<feature>.type.ts` |
   | inline sample file written to disk | static sample | `test/fixtures/<sample>/` |
   | `mkdtempSync` + `writeFileSync` + `rmSync` per spec | temp copy | `test/utils/fixture-project.spec.util.ts` |

3. Create the `test/` sub-folders that receive a file. Move or create stubs, mocks, fixture directories, and spec utils. Delete the forbidden files.
4. Rewrite specs to import from the new places. Each spec keeps its own `afterAll` for anything it disposes.
5. Point the build globs at `**/test/**`: exclude in the library tsconfig, include in the spec tsconfig.
6. Re-run the gate.

## Example

Before, setup is scattered across a support file, a fixture builder with inline sources, and per-spec temp directories:

```text
import/
  order-import.spec-support.ts        importer lookup, harness, orderFile()
  order-import.project-fixture.ts     mkdtemp + 8 inline order files
  order-import.project.spec.ts        imports both, rmSync in afterAll
  order-import.cache.spec.ts          own mkdtemp, inline source, inline importer options
```

After, every piece has one named home under `test/`:

```text
test/
  fixtures/
    order-batch/         header, line, discount, tax, malformed samples + manifest.json
    cache-batch/         order file + report + manifest.json
  stubs/
    importer-options.stub.ts   IMPORTER_OPTIONS_STUB
  utils/
    importer-under-test.spec.util.ts  importer, importerName, importerOptions(), harness, projectHarness(directory)
    order-source.spec.util.ts         orderFile()
    fixture-project.spec.util.ts      fixtureDirectory(name), copyFixtureProject(name) → { directory, file, dispose }
import/
  order-import.project.spec.ts    read-only: harness points at test/fixtures/order-batch in place
  order-import.cache.spec.ts      mutating: copyFixtureProject('cache-batch'), afterAll(dispose)
```

The read-only spec lost its temp directory and its `afterAll`. The mutating spec kept both, through the util.

## Rationalizations

| Excuse | Counter |
|---|---|
| “A `.spec-support.ts` file beside the spec is discoverable.” | It is a production-shaped `.ts` file with test-only content. It compiles, lints, and ships like source. Use `test/`. |
| “Stubs are shared data, so `common/` fits.” | `common/` is what production imports. A stub is never imported by production. `test/stubs/`. |
| “A spec util is a util, so `utils/` fits.” | `utils/` is pure production code with a purity gate. A spec util wires harnesses and copies temp dirs. `test/utils/`. |
| “Inline source strings keep the test readable.” | Static samples the subject reads from disk are fixtures. Only the case string passed directly to the subject stays inline. |
| “Every test needs its own temp dir anyway.” | Read-only tests point at the fixture in place. Only mutating tests copy. |
| “A stub for a two-field type is overkill.” | Correct when every field is asserted. Wrong when specs repeat the same base config. Apply the trigger rule. |
| “Cast the stub to the type.” | Annotate. A cast hides a stub that no longer matches the type. |
| “Put helpers in `helpers/` under the spec folder.” | `test/utils/<behavior>.spec.util.ts`. The name says what it computes. |
| “A mock is a stub with `vi.fn()` in it.” | A stub is a value shared by reference; a `vi.fn()` in it leaks calls between specs. A mock is a factory. |
| “Test utils can do I/O, they are tests.” | Only temp-directory I/O with `dispose`. Everything else stays pure. |
| “One spec per behavior group reads better than one per file.” | A group spec hides which module a failing case blames. Sibling specs answer “where is the test for this file” without grepping. |
| “Export the helper so its sibling spec can call it.” | Test through the boundary. If the module has no reachable boundary, the split is wrong. |

## Red Flags

Stop and re-check this reference when reasoning includes:

- “Rename `.spec-support.ts` to `.spec-helper.ts`.”
- “Put the stub in `common/`, it is shared.”
- “It ends in `.spec.util.ts`, so `utils/` is fine.”
- “Export the source string from a `.ts` file under `fixtures/`.”
- “Write the temp files inline, it is only this spec.”
- “`as Options` so the stub compiles.”
- “The mock object is close enough, no need for the real type.”
- “Copy the fixture even though nothing writes to it.”
- “Put the new cases in the nearest existing spec.”
- “The module is covered somewhere, no sibling spec needed.”

## Common Mistakes

| Mistake | Fix |
|---|---|
| Support file with a suffix the runner ignores but the compiler sees | Stub, mock, fixture, or spec util under `test/`. |
| `.stub.ts`, `.mock.ts`, or `.spec.util.ts` outside `test/` | Move it to `test/stubs/`, `test/mocks/`, `test/utils/`. |
| Fixture written as a TypeScript module exporting strings | Real files under `test/fixtures/<name>/`. |
| Stub carrying case-specific values | Defaults in the stub, overrides in the spec. |
| Two stubs for one type | One stub plus spread overrides. |
| Stub holding a `vi.fn()` | Mock factory in `test/mocks/`. |
| Temp directory created for a read-only test | Point at the fixture in place. |
| Temp directory disposed by a central hook | The spec that copied it owns the `afterAll`. |
| Spec util that imports production internals only to re-export them | Specs import production code directly. |
| Spec util exporting a type | Type to `test/common/<feature>.type.ts`, or `common/<feature>.type.ts` when production imports it too. |
| Fixture path assembled in each spec | One `fixtureDirectory(name)` util in `test/utils/`. |
| Stub or spec util named `.spec.ts` | The runner collects it as an empty test file. Use `.stub.ts` and `.spec.util.ts`. |
| Library tsconfig excluding by three suffix globs | One `**/test/**` exclude. |
| Module split but spec left whole | Split the spec the same way; run the sibling check. |
| Spec named after a behavior group beside modules | Rename to the owning module, or move to the feature root as an integration spec. |
