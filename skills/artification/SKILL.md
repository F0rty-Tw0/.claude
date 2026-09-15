---
name: artification
description: Use when writing or refactoring TypeScript, especially when organizing exported types, object shapes, nested configuration, readonly fields, array contracts, return statements, guard clauses, if conditions, calls inside conditions, spread expressions, ternaries, call chains, callbacks, arrow bodies, nested object values, `as` casts, comments, returned object literals, imports, return types, derived types (`ReturnType<typeof>`), class members, naming, blank lines, dead conditions, switch exhaustiveness, erasable syntax, pure functions, deterministic helpers, utility folders, `.util.ts` files, stubs, mocks, fixtures, spec utils, `test/` folders, spec structure, `describe` / `it` naming, Gherkin (`GIVEN` / `WHEN` / `THEN`), branch coverage, Wallaby yellow lines, or `TestBed` provider overrides
---

# Artification

## Who and Why

Angular and TypeScript engineer, author of the `lint-suite` ESLint plugin.

Engineer has dyslexia and ADHD and reads code by scanning its shape, not word by word. Every rule here makes structure visible at a glance:

- Types expose architecture, so ownership and nesting are readable before the logic is.
- A blank line before `return` marks every exit point.
- A one-line guard keeps an early exit on the same row as its condition.
- A condition with more than 3 operands gets a name, so the `if` reads as a sentence.
- A call, a parenthesized group, or a spread expression gets a name before it is used, so deciding is separate from doing.
- A ternary branch, a chain receiver, a callback body, and a wrapped arrow body each get a name, so no expression has to be read inside-out.
- A nested object, array of objects, or call chain inside an object literal gets a name, so the literal is a list of names.
- No `as` casts. A cast hides a typing gap; a predicate or a corrected type closes it.
- No useless comments. A comment restating the code, narrating a choice, or marking a shortcut (`// ponytail:`) is deleted; a comment that carries a fact the code cannot (external bug link, directive reason, invariant) stays.
- Every function states its return type and every class member its accessibility, so a signature is read without opening the body.
- Imports are grouped and alphabetical with `import type` on its own line, so the dependency list is scanned, not searched.
- A condition the compiler proves constant is deleted or the type is fixed, so no check lies about the data.
- Only erasable TypeScript syntax, so the source runs under Node without a build.
- A returned object gets a name, so the function's output is one word, not a literal.
- Every test-only file sits under the owning feature's `test/` folder, so `common/` and `utils/` hold only what ships.
- `common/` and `.const.ts` hold constants and types only; every function, even a one-line predicate, lives in `utils/`, so the path alone says whether a symbol is data or behavior.
- One shape per file kind, so no file has to be re-learned.

Consistency beats local convention. A rule applied only sometimes is worse than no rule.

## Overview

Apply engineers's coding rules consistently. Existing conventions, minimal-diff pressure, and deadlines do not override them.

Read every reference matching the work:

| Work | Required reference |
|---|---|
| Types, object shapes, properties, or arrays | `references/typescript-style.md` |
| Function bodies: returns, guard clauses, condition size, calls or groups in conditions, spreads, ternaries, chains, callbacks, arrow bodies, nested object values, casts, comments, returned objects | `references/typescript-style.md` |
| Imports, return types, derived types, class members, naming, blank lines, dead conditions, switches, erasable syntax | `references/typescript-style.md` |
| Functions, helper extraction, utility placement, or purity | `references/utility-style.md` |
| Any source `.ts` file over 150 lines (spec over 300), or splitting a module | `references/module-size.md` |
| Specs, stubs, mocks, fixtures, spec utils, `test/` folders, or any test-only file | `references/unit-testing.md` |
| Spec contents: `describe` / `it` tree, case naming, branch coverage, Angular `TestBed` setup | `references/spec-style.md` |
| Any new behavior or bug fix, before production code | `test-driven-development` skill (cycle), then `references/spec-style.md` (shape) |

Apply every relevant rule unless the user explicitly overrides it in the current request.

## When to Use

- Writing new TypeScript code
- Refactoring TypeScript modules
- Adding or moving exported or cross-file types
- Changing object, nested configuration, or array contracts
- Writing any function body with a `return`, an `if` condition, or a returned object literal
- Extracting pure, deterministic, or independently testable functions
- Creating or reorganizing `utils/` folders and `.util.ts` files
- Finishing any change that leaves a source `.ts` file over 150 lines, or a spec over 300
- Writing or reorganizing specs, stubs, mocks, fixtures, spec utils, or `test/` folders
- Writing any `describe` / `it` block, choosing cases for a branch, or setting up `TestBed`
- Adding or splitting a module, which needs a sibling `<module>.spec.ts`

Keep growing rules and examples in `references/`, not this file.
