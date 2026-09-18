# Defense-in-Depth Validation

## Overview

When you fix a bug caused by invalid data, adding validation at one place feels sufficient. But that single check can be bypassed by different code paths, refactoring, or mocks.

**Core principle:** Validate at EVERY layer data passes through. Make the bug structurally impossible.

## Why Multiple Layers

Single validation: "We fixed the bug"
Multiple layers: "We made the bug impossible"

Different layers catch different cases:

- Entry validation catches most bugs
- Business logic catches edge cases
- Environment guards prevent context-specific dangers
- Debug logging helps when other layers fail

## The Four Layers

### Layer 1: Entry Point Validation

**Purpose:** Reject obviously invalid input at API boundary

```typescript
function createProject(name: string, workingDirectory: string) {
  if (!workingDirectory || workingDirectory.trim() === '') {
    throw new Error('workingDirectory cannot be empty');
  }
  if (!existsSync(workingDirectory)) {
    throw new Error(`workingDirectory does not exist: ${workingDirectory}`);
  }
  if (!statSync(workingDirectory).isDirectory()) {
    throw new Error(`workingDirectory is not a directory: ${workingDirectory}`);
  }
  // ... proceed
}
```

### Layer 2: Business Logic Validation

**Purpose:** Ensure data makes sense for this operation

```typescript
function initializeWorkspace(projectDir: string, sessionId: string) {
  if (!projectDir) {
    throw new Error('projectDir required for workspace initialization');
  }
  // ... proceed
}
```

### Layer 3: Environment Guards

**Purpose:** Prevent dangerous operations in specific contexts

```typescript
async function gitInit(directory: string) {
  // In tests, refuse git init outside temp directories
  if (process.env.NODE_ENV === 'test') {
    const normalized = normalize(resolve(directory));
    const tmpDir = normalize(resolve(tmpdir()));

    if (!normalized.startsWith(tmpDir)) {
      throw new Error(
        `Refusing git init outside temp dir during tests: ${directory}`,
      );
    }
  }
  // ... proceed
}
```

### Layer 4: Debug Instrumentation

**Purpose:** Capture context for forensics

```typescript
async function gitInit(directory: string) {
  const stack = new Error().stack;
  logger.debug('About to git init', {
    directory,
    cwd: process.cwd(),
    stack,
  });
  // ... proceed
}
```

## TypeScript: Layer 0 — Encode Invariants in the Type System

Before runtime validation, TypeScript lets you make invalid states *unrepresentable*. This is the strongest defense because the compiler enforces it.

**Branded / opaque types for validated values:**

```typescript
// Unbranded string — anyone can pass anything
function processDir(dir: string) { /* ... */ }

// Branded type — only values that passed validation are accepted
type ValidatedDir = string & { readonly __brand: 'ValidatedDir' };

function validateDir(dir: string): ValidatedDir {
  if (!dir || !existsSync(dir)) {
    throw new Error(`Invalid directory: ${dir}`);
  }
  return dir as ValidatedDir; // The cast is here, not at the call site
}

function processDir(dir: ValidatedDir) { /* dir is guaranteed valid */ }
```

**Discriminated unions instead of nullable returns:**

```typescript
// ❌ Caller can forget to check for null
function findUser(id: string): User | null { ... }

// ✅ Type forces the caller to handle both branches
type FindResult<T> =
  | { found: true; value: T }
  | { found: false; reason: string };

function findUser(id: string): FindResult<User> { ... }
```

**`unknown` at external boundaries:**

```typescript
// ❌ any bypasses all type checks — bugs hide here
function parseApiResponse(raw: unknown): any {
  return raw; // No validation — type errors suppressed downstream
}

// ✅ unknown forces narrowing at the boundary (Layer 1)
function parseApiResponse(raw: unknown): ApiResponse {
  if (!isApiResponse(raw)) {
    throw new Error(`Unexpected API shape: ${JSON.stringify(raw)}`);
  }
  return raw; // TypeScript now knows the type
}
```

## Applying the Pattern

When you find a bug:

1. **Trace the data flow** - Where does bad value originate? Where used?
2. **Map all checkpoints** - List every point data passes through
3. **Add validation at each layer** - Type system (Layer 0), entry, business, environment, debug
4. **Test each layer** - Try to bypass layer 1, verify layer 2 catches it

## Example from Session

Bug: Empty `projectDir` caused `git init` in source code

**Data flow:**

1. Test setup → empty string
2. `Project.create(name, '')`
3. `WorkspaceManager.createWorkspace('')`
4. `git init` runs in `process.cwd()`

**Four layers added:**

- Layer 1: `Project.create()` validates not empty/exists/writable
- Layer 2: `WorkspaceManager` validates projectDir not empty
- Layer 3: `WorktreeManager` refuses git init outside tmpdir in tests
- Layer 4: Stack trace logging before git init

**Result:** All 1847 tests passed, bug impossible to reproduce

## Key Insight

All four layers were necessary. During testing, each layer caught bugs the others missed:

- Different code paths bypassed entry validation
- Mocks bypassed business logic checks
- Edge cases on different platforms needed environment guards
- Debug logging identified structural misuse

**Don't stop at one validation point.** Add checks at every layer.
