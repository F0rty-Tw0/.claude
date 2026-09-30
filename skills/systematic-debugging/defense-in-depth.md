# Hardening After a Root-Cause Fix

After fixing a bug caused by invalid data, make it hard to reintroduce — at the boundaries, not at every internal layer. Validate where data enters (user input, external APIs, I/O, deserialization) and trust internal code; re-checking the same value in every function adds noise and hides which check is the real contract.

## 1. Encode the invariant in types

The strongest guard is one the compiler enforces.

**Branded type for validated values** — the cast lives in one validator, not at call sites:

```typescript
type ValidatedDir = string & { readonly __brand: 'ValidatedDir' };

function validateDir(dir: string): ValidatedDir {
  if (!dir || !existsSync(dir)) {
    throw new Error(`Invalid directory: ${dir}`);
  }
  return dir as ValidatedDir;
}

function processDir(dir: ValidatedDir) { /* dir is guaranteed valid */ }
```

**Discriminated union instead of a nullable return** — the caller must handle both branches:

```typescript
type FindResult<T> =
  | { found: true; value: T }
  | { found: false; reason: string };
```

**`unknown` at external boundaries**, narrowed once:

```typescript
function parseApiResponse(raw: unknown): ApiResponse {
  if (!isApiResponse(raw)) {
    throw new Error(`Unexpected API shape: ${JSON.stringify(raw)}`);
  }
  return raw;
}
```

## 2. Validate at the entry boundary

```typescript
function createProject(name: string, workingDirectory: string) {
  if (!workingDirectory?.trim()) throw new Error('workingDirectory cannot be empty');
  if (!statSync(workingDirectory, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`workingDirectory is not a directory: ${workingDirectory}`);
  }
  // internal code below trusts the value
}
```

## 3. Guard destructive I/O where it happens

A side effect that can damage the machine (git init, rm, writes outside a sandbox) is itself a boundary. A guard there catches code paths — including test mocks — that bypass the entry check:

```typescript
async function gitInit(directory: string) {
  if (process.env.NODE_ENV === 'test' && !resolve(directory).startsWith(resolve(tmpdir()))) {
    throw new Error(`Refusing git init outside temp dir during tests: ${directory}`);
  }
}
```

## Example

Bug: an empty `projectDir` made `git init` run in the source tree. Trace: test setup → `Project.create(name, '')` → `WorkspaceManager.createWorkspace('')` → `git init` in `process.cwd()`.

Fix: `Project.create()` validates the directory (entry boundary), and `gitInit` refuses to run outside tmpdir in tests (destructive I/O). `WorkspaceManager` stays unchanged — it receives a validated value.
