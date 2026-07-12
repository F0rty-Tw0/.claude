# TypeScript & Angular Debugging

Framework-specific companion to `SKILL.md`. Apply the same four-phase discipline; this file lists the failure modes and tooling specific to TypeScript, Node, vitest/jest, and Angular.

## Compiler errors (`tsc`) — read the code, not just the message

`tsc` error codes are precise — look them up before guessing.

| Code | Meaning | Common cause |
|------|---------|--------------|
| `TS2322` | Type `X` is not assignable to type `Y` | Wrong shape returned/passed |
| `TS2345` | Argument type mismatch | Caller and callee disagree on shape |
| `TS2531` | Object is possibly `null` | `strictNullChecks` found a genuine nullable path |
| `TS2532` | Object is possibly `undefined` | Same — do NOT suppress with `!` without understanding why |
| `TS2339` | Property does not exist on type | Wrong type assumed, or accessing before narrowing |
| `TS7006` | Parameter implicitly has `any` | Missing type annotation, likely a regression |

**Do NOT silence errors with `as`, `!`, or `// @ts-ignore` without first tracing WHY the types disagree.** Type errors are evidence of a logical mismatch — suppressing them hides bugs, it doesn't fix them.

## Gather evidence across layers (multi-layer service example)

For the generic boundary-instrumentation technique, see Phase 1.4 in SKILL.md. In a layered TypeScript service, log at each boundary to find which layer receives wrong data:

```typescript
// Layer 1: HTTP handler — log raw input
app.post('/payment', async (req, res) => {
  console.error('DEBUG handler input:', JSON.stringify(req.body));
  // ...
});

// Layer 2: Service — log what it receives
async function processPayment(payload: PaymentPayload) {
  console.error('DEBUG service input:', JSON.stringify(payload));
  // ...
}

// Layer 3: Repository — log the DB call
async function savePayment(data: Payment) {
  console.error('DEBUG repo data:', JSON.stringify(data));
  // ...
}
```

Handler ✓ but service ✗ means the transform between them broke it.

## `strictNullChecks` traps

```typescript
// ❌ Symptom fix — silences the error, hides the real problem
const user = getUser()!;

// ✅ Root-cause approach — understand why it can be null, then handle it
const user = getUser();
if (!user) {
  // Why is user null here? Is the caller wrong, or the return type?
  throw new Error('Expected authenticated user; check auth guard setup');
}
```

## Type narrowing as a debugging tool

Discriminated unions let you trace which branch of a type you're actually in:

```typescript
type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function processResult(result: Result<Payment>) {
  if (!result.ok) {
    console.error('DEBUG processResult failed branch:', result.error);
    return;
  }
  // result.value is safe here — TypeScript knows it
  savePayment(result.value);
}
```

**Use `unknown` instead of `any` for external data.** `any` silently disables type checking; `unknown` forces you to narrow before use — exactly the investigation step you need.

## `as` assertion-induced bugs

```typescript
// ❌ Asserts away the problem — common source of runtime crashes
const config = JSON.parse(raw) as AppConfig;
config.apiUrl.trim(); // Crashes if apiUrl is missing

// ✅ Validate the shape at the boundary (Layer 1 defense-in-depth)
function parseConfig(raw: string): AppConfig {
  const parsed = JSON.parse(raw);
  if (typeof parsed.apiUrl !== 'string') {
    throw new Error(`Config missing apiUrl: ${JSON.stringify(parsed)}`);
  }
  return parsed as AppConfig; // Now the assertion is backed by a check
}
```

## Async / Promise debugging

**Lost stack traces across `await`:**
```typescript
// Use --enable-source-maps (Node 18+) for full traces, or capture context manually:
async function processOrder(orderId: string) {
  const stack = new Error('processOrder context').stack;
  try {
    await paymentService.charge(orderId);
  } catch (err) {
    console.error('processOrder failed', { orderId, originalStack: stack, err });
    throw err;
  }
}
```

**Unhandled promise rejections:**
```typescript
// ❌ Fire-and-forget — rejection is swallowed silently
doSomethingAsync();

// ✅ Either await or explicitly handle
doSomethingAsync().catch((err) => {
  logger.error('Background task failed', err);
});
```

**`Promise.all` swallows individual errors:**
```typescript
// ❌ First rejection cancels the rest; you lose which one failed
const results = await Promise.all([fetchA(), fetchB(), fetchC()]);

// ✅ Use allSettled to get all outcomes, then inspect
const outcomes = await Promise.allSettled([fetchA(), fetchB(), fetchC()]);
for (const [i, outcome] of outcomes.entries()) {
  if (outcome.status === 'rejected') {
    console.error(`Task ${i} failed:`, outcome.reason);
  }
}
```

## Test debugging (vitest / jest)

**Run in isolation before assuming interaction:**
```bash
pnpm test path/to/failing.spec.ts          # Single file
pnpm test --reporter=verbose               # See each test name
pnpm test -- --testNamePattern="my test"   # Single test by name
```

**Debugger attach (Node inspect):**
```bash
# vitest
node --inspect-brk ./node_modules/.bin/vitest path/to/test.ts
# jest
node --inspect-brk ./node_modules/.bin/jest --runInBand path/to/test.ts
```
Then attach VS Code debugger or Chrome DevTools (`chrome://inspect`).

**`vi.mock` pitfalls:**
- Mock factories run before imports — accessing outer variables inside the factory causes `undefined` (temporal dead zone).
- Always use `vi.mocked()` to get typed mock references.
- `vi.resetModules()` between tests if module state bleeds.

```typescript
// ❌ Outer variable not yet initialized when factory runs
const mockFn = vi.fn();
vi.mock('./service', () => ({ doThing: mockFn })); // mockFn may be undefined

// ✅ Define inside the factory, or use vi.mocked after import
vi.mock('./service', () => ({ doThing: vi.fn() }));
import { doThing } from './service';
vi.mocked(doThing).mockReturnValue('test');
```

**For e2e flakiness:** replace arbitrary `waitForTimeout` with `waitFor` condition polling (see `condition-based-waiting.md`). Playwright's built-in auto-waiting handles most DOM assertions — only reach for manual waits when crossing async non-DOM boundaries.

## Angular-specific debugging

**DI / injection context errors (`NG0203`):** `inject() must be called from an injection context` means `inject()` was called outside a constructor, field initializer, or `runInInjectionContext`. Trace the call site — usually `inject()` inside a method body or a lazily-evaluated callback.

**`NG0` runtime error codes — look up before guessing:**

| Code | Meaning |
|------|---------|
| `NG0100` | ExpressionChangedAfterItHasBeenCheckedError — classic change detection bug |
| `NG0200` | Circular DI dependency |
| `NG0203` | `inject()` outside injection context |
| `NG0301` | Component not found — missing import in `@NgModule` or standalone imports |
| `NG0302` | Pipe not found |

**ExpressionChangedAfterItHasBeenChecked (`NG0100`):** almost always a root-cause bug, not a symptom to wrap in `setTimeout`. Trace where the expression value is mutated during change detection — lifecycle hook side effects, `ngOnChanges` mutating parent state, signal writes inside view-level code.

**Signal / change detection gotchas:**
```typescript
// ❌ Reading a signal outside Angular's reactive context gives a stale snapshot
const value = mySignal(); // inside a setTimeout — not reactive

// ✅ Read signals inside computed/effect/template to stay reactive
const derived = computed(() => mySignal() * 2);
```

**RxJS subscription leaks — trace the subscription lifecycle:**
```typescript
// ❌ Never unsubscribed — leaks on component destroy
ngOnInit() {
  this.service.data$.subscribe((d) => this.data = d);
}

// ✅ Use takeUntilDestroyed (Angular 16+) or async pipe
private readonly destroyRef = inject(DestroyRef);

ngOnInit() {
  this.service.data$
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe((d) => this.data = d);
}
```

## Source maps for compiled output

Stack traces from compiled JS (Angular prod build, Node dist) point to compiled line numbers, not your TypeScript source.

```bash
# Node.js: enable source maps globally
node --enable-source-maps dist/server.js
```

For Angular, source maps are automatic in development builds (`ng serve`). For production debugging, build with `--source-map` and use the browser DevTools source panel to navigate to the original `.ts` files.
