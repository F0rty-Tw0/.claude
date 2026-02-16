# Kaizen: Patterns and Examples

Detailed code examples for applying the Four Pillars. Examples use TypeScript; apply equivalent patterns in your target language.

## Table of Contents

- [1. Continuous Improvement Examples](#1-continuous-improvement-examples)
- [2. Poka-Yoke (Error Proofing) Examples](#2-poka-yoke-error-proofing-examples)
- [3. Standardized Work Examples](#3-standardized-work-examples)
- [4. Just-In-Time (JIT) Examples](#4-just-in-time-jit-examples)

## 1. Continuous Improvement Examples

### Iterative Refinement

<Good>

```typescript
// Iteration 1: Make it work
const calculateTotal = (items: Item[]) => {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total += items[i].price * items[i].quantity;
  }
  return total;
};

// Iteration 2: Make it clear (refactor)
const calculateTotal = (items: Item[]): number => {
  return items.reduce((total, item) => {
    return total + item.price * item.quantity;
  }, 0);
};

// Iteration 3: Make it robust (add validation)
const calculateTotal = (items: Item[]): number => {
  if (!items?.length) return 0;

  return items.reduce((total, item) => {
    if (item.price < 0 || item.quantity < 0) {
      throw new Error('Price and quantity must be non-negative');
    }
    return total + item.price * item.quantity;
  }, 0);
};
```

Each step is complete, tested, and working

</Good>

<Bad>

```typescript
// Trying to do everything at once
const calculateTotal = (items: Item[]): number => {
  if (!items?.length) return 0;
  const validItems = items.filter(item => {
    if (item.price < 0) throw new Error('Negative price');
    if (item.quantity < 0) throw new Error('Negative quantity');
    return item.quantity > 0;
  });
  // Plus caching, plus logging, plus currency conversion...
  return validItems.reduce(...); // Too many concerns at once
};
```

Overwhelming, error-prone, hard to verify

</Bad>

## 2. Poka-Yoke (Error Proofing) Examples

### Type System Error Proofing

<Good>

```typescript
// Bad: string status can be any value
type OrderBad = {
  readonly status: string; // "pending", "PENDING", "pnding", anything!
};

// Good: Only valid states possible
type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered';

// Better: States with associated data
type Order =
  | { status: 'pending'; createdAt: Date }
  | { status: 'processing'; startedAt: Date; estimatedCompletion: Date }
  | { status: 'shipped'; trackingNumber: string; shippedAt: Date }
  | { status: 'delivered'; deliveredAt: Date; signature: string };

// Now impossible to have shipped without trackingNumber
```

Type system prevents entire classes of errors

</Good>

<Good>

```typescript
// Make invalid states unrepresentable
type NonEmptyArray<T> = [T, ...T[]];

const firstItem = <T>(items: NonEmptyArray<T>): T => {
  return items[0]; // Always safe, never undefined!
};
```

Function signature guarantees safety

</Good>

### Validation Error Proofing

<Good>

```typescript
// Bad: Validation after use
const processPayment = (amount: number) => {
  const fee = amount * 0.03; // Used before validation!
  if (amount <= 0) throw new Error('Invalid amount');
};

// Good: Validate immediately
const processPayment = (amount: number) => {
  if (amount <= 0) throw new Error('Payment amount must be positive');
  if (amount > 10000) throw new Error('Payment exceeds maximum allowed');
  const fee = amount * 0.03;
};

// Better: Validation at boundary with branded type
type PositiveNumber = number & { readonly __brand: 'PositiveNumber' };

const validatePositive = (n: number): PositiveNumber => {
  if (n <= 0) throw new Error('Must be positive');
  return n as PositiveNumber;
};

const processPayment = (amount: PositiveNumber) => {
  const fee = amount * 0.03; // Guaranteed positive, no check needed
};

// Validate once at system boundary, safe everywhere else
const handlePaymentRequest = (req: Request) => {
  const amount = validatePositive(req.body.amount);
  processPayment(amount);
};
```

Validate once at boundary, safe everywhere else

</Good>

### Guards and Preconditions

<Good>

```typescript
const processUser = (user: User | null) => {
  if (!user) {
    logger.error('User not found');
    return;
  }
  if (!user.email) {
    logger.error('User email missing');
    return;
  }
  if (!user.isActive) {
    logger.info('User inactive, skipping');
    return;
  }

  // Main logic here, guaranteed user is valid and active
  sendEmail(user.email, 'Welcome!');
};
```

Guards make assumptions explicit and enforced

</Good>

### Configuration Error Proofing

<Good>

```typescript
// Bad: Optional config with unsafe defaults
type ConfigBad = { readonly apiKey?: string; readonly timeout?: number };
const client = new APIClient({ timeout: 5000 }); // apiKey missing!

// Good: Required config, fails early
type Config = { readonly apiKey: string; readonly timeout: number };

const loadConfig = (): Config => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error('API_KEY environment variable required');
  return { apiKey, timeout: 5000 };
};

// App fails at startup if config invalid, not during request
const config = loadConfig();
const client = new APIClient(config);
```

Fail at startup, not in production

</Good>

## 3. Standardized Work Examples

### Following Patterns

<Good>

```typescript
// Existing codebase pattern for API clients
class UserAPIClient {
  async getUser(id: string): Promise<User> {
    return this.fetch(`/users/${id}`);
  }
}

// New code follows the same pattern
class OrderAPIClient {
  async getOrder(id: string): Promise<Order> {
    return this.fetch(`/orders/${id}`);
  }
}
```

Consistency makes codebase predictable

</Good>

<Bad>

```typescript
// Existing pattern uses classes
class UserAPIClient {
  /* ... */
}

// New code introduces different pattern without discussion
const getOrder = async (id: string): Promise<Order> => {
  // Breaking consistency "because I prefer functions"
};
```

Inconsistency creates confusion

</Bad>

### Error Handling Patterns

<Good>

```typescript
// Project standard: Result type for recoverable errors
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

const fetchUser = async (id: string): Promise<Result<User, Error>> => {
  try {
    const user = await db.users.findById(id);
    if (!user) return { ok: false, error: new Error('User not found') };
    return { ok: true, value: user };
  } catch (err) {
    return { ok: false, error: err as Error };
  }
};

const result = await fetchUser('123');
if (!result.ok) {
  logger.error('Failed to fetch user', result.error);
  return;
}
const user = result.value; // Type-safe!
```

Standard pattern across codebase

</Good>

### Documentation Standards

<Good>

```typescript
/**
 * Retries an async operation with exponential backoff.
 *
 * Why: Network requests fail temporarily; retrying improves reliability
 * When to use: External API calls, database operations
 * When not to use: User input validation, internal function calls
 */
const retry = async <T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> => {
  // Implementation...
};
```

Documents why, when, and how

</Good>

## 4. Just-In-Time (JIT) Examples

### YAGNI in Action

<Good>

```typescript
// Current requirement: Log errors to console
const logError = (error: Error) => {
  console.error(error.message);
};
```

Simple, meets current need

</Good>

<Bad>

```typescript
// Over-engineered for "future needs"
interface LogTransport {
  write(level: LogLevel, message: string, meta?: LogMetadata): Promise<void>;
}

class ConsoleTransport implements LogTransport {
  /* ... */
}
class FileTransport implements LogTransport {
  /* ... */
}
class RemoteTransport implements LogTransport {
  /* ... */
}

class Logger {
  private transports: LogTransport[] = [];
  private queue: LogEntry[] = [];
  private rateLimiter: RateLimiter;
  private formatter: LogFormatter;
  // 200 lines of code for "maybe we'll need it"
}

const logError = (error: Error) => {
  Logger.getInstance().log('error', error.message);
};
```

Building for imaginary future requirements

</Bad>

### Evolution Based on Real Requirements

<Good>

```typescript
// Start simple
const formatCurrency = (amount: number): string => {
  return `$${amount.toFixed(2)}`;
};

// Requirement evolves: support multiple currencies
const formatCurrency = (amount: number, currency: string): string => {
  const symbols = { USD: '$', EUR: '€', GBP: '£' };
  return `${symbols[currency]}${amount.toFixed(2)}`;
};

// Requirement evolves: support localization
const formatCurrency = (amount: number, locale: string): string => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: locale === 'en-US' ? 'USD' : 'EUR',
  }).format(amount);
};
```

Complexity added only when needed

</Good>

### Premature Abstraction

<Bad>

```typescript
// One use case, but building generic framework
abstract class BaseCRUDService<T> {
  abstract getAll(): Promise<T[]>;
  abstract getById(id: string): Promise<T>;
  abstract create(data: Partial<T>): Promise<T>;
  abstract update(id: string, data: Partial<T>): Promise<T>;
  abstract delete(id: string): Promise<void>;
}

class GenericRepository<T> {
  /* 300 lines */
}
class QueryBuilder<T> {
  /* 200 lines */
}
// ... building entire ORM for single table
```

Massive abstraction for uncertain future

</Bad>

<Good>

```typescript
// Simple functions for current needs
const getUsers = async (): Promise<User[]> => {
  return db.query('SELECT * FROM users');
};

const getUserById = async (id: string): Promise<User | null> => {
  return db.query('SELECT * FROM users WHERE id = $1', [id]);
};

// Abstract only when pattern proven across 3+ cases
```

</Good>

### Performance Optimization

<Good>

```typescript
const filterActiveUsers = (users: User[]): User[] => {
  return users.filter((user) => user.isActive);
};

// Benchmark shows: 50ms for 1000 users (acceptable)
// Ship it, no optimization needed
// Later: After profiling shows this is bottleneck, then optimize
```

Optimize based on measurement, not assumptions

</Good>

<Bad>

```typescript
const filterActiveUsers = (users: User[]): User[] => {
  // "This might be slow, so let's cache and index"
  const cache = new WeakMap();
  const indexed = buildBTreeIndex(users, 'isActive');
  // 100 lines of optimization code for no measured problem
};
```

Complex solution for unmeasured problem

</Bad>
