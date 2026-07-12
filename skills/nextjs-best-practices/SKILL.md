---
name: nextjs-best-practices
description: Use when developing with Next.js App Router - covers Server Components, data fetching, routing patterns, caching, and server actions.
---

# Next.js Best Practices

> Principles for Next.js App Router development. Current as of **Next.js 16.2** (July 2026; Next 15 remains in support until Oct 2026 and shares the same uncached-by-default model). Next 16 removes the Next-15 transitional shims — synchronous `params`/`cookies()`/`headers()` access and `middleware.ts` — see §2 and §3.

---

## 1. Server vs Client Components

### Decision Tree

```
Does it need...?
│
├── useState, useEffect, event handlers
│   └── Client Component ('use client')
│
├── Direct data fetching, no interactivity
│   └── Server Component (default)
│
└── Both?
    └── Split: Server parent + Client child
```

### By Default

| Type       | Use                                   |
| ---------- | ------------------------------------- |
| **Server** | Data fetching, layout, static content |
| **Client** | Forms, buttons, interactive UI        |

---

## 2. Data Fetching Patterns

### Fetch Strategy (Next.js 15+)

`fetch` is **uncached by default** as of Next.js 15 — every call hits the network unless you opt in to caching.

| Pattern                          | Use                                       |
| --------------------------------- | ------------------------------------------ |
| **Default** (no options)          | Dynamic (every request, uncached)          |
| `{ cache: 'force-cache' }`        | Static (cached indefinitely, opt-in)       |
| `{ next: { revalidate: 60 } }`    | ISR (time-based refresh, opt-in)           |
| `{ cache: 'no-store' }`           | Explicitly dynamic (same as default, but explicit) |

```ts
// Opt in to caching (was the old default pre-Next 15)
fetch(url, { cache: 'force-cache' });

// Opt in to time-based revalidation
fetch(url, { next: { revalidate: 60 } });
```

Route Handler `GET` functions are also uncached by default in Next.js 15+ (previously cached unless a dynamic API was used). Export `export const dynamic = 'force-static'` to opt back in.

### Data Flow

| Source     | Pattern                      |
| ---------- | ---------------------------- |
| Database   | Server Component fetch       |
| API        | fetch with caching           |
| User input | Client state + server action |

### Async Request APIs (breaking in Next.js 16)

`cookies()`, `headers()`, `draftMode()`, and route `params`/`searchParams` are **async-only** — the Next 15 synchronous fallback is removed in Next 16, not just deprecated.

```ts
// ❌ Next 15 transitional shim — throws in Next 16
export default function Page({ params }: { params: { id: string } }) {
  const { id } = params;
}

// ✅ Next 16
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
}
```

---

## 3. Routing Principles

### File Conventions

| File            | Purpose        |
| --------------- | -------------- |
| `page.tsx`      | Route UI       |
| `layout.tsx`    | Shared layout  |
| `loading.tsx`   | Loading state  |
| `error.tsx`     | Error boundary |
| `not-found.tsx` | 404 page       |
| `proxy.ts` (project root) | Network-boundary logic (redirects, rewrites, header edits) — replaces `middleware.ts` (deprecated, still works). Migrate: `npx @next/codemod@canary middleware-to-proxy` |

### Route Organization

| Pattern                 | Use                       |
| ----------------------- | ------------------------- |
| Route groups `(name)`   | Organize without URL      |
| Parallel routes `@slot` | Multiple same-level pages |
| Intercepting `(.)`      | Modal overlays            |

---

## 4. API Routes

### Route Handlers

| Method    | Use         |
| --------- | ----------- |
| GET       | Read data   |
| POST      | Create data |
| PUT/PATCH | Update data |
| DELETE    | Remove data |

### Best Practices

- Validate input with Zod
- Return proper status codes
- Handle errors gracefully
- Use Edge runtime when possible

---

## 5. Performance Principles

### Image Optimization

- Use next/image component
- Set priority for above-fold
- Provide blur placeholder
- Use responsive sizes

### Bundle Optimization

- Dynamic imports for heavy components
- Route-based code splitting (automatic)
- Analyze with bundle analyzer

---

## 6. Metadata

### Static vs Dynamic

| Type             | Use               |
| ---------------- | ----------------- |
| Static export    | Fixed metadata    |
| generateMetadata | Dynamic per-route |

### Essential Tags

- title (50-60 chars)
- description (150-160 chars)
- Open Graph images
- Canonical URL

---

## 7. Caching Strategy

**Since Next.js 15**, `fetch` requests, GET Route Handlers, and the client-side Router Cache are all **uncached by default** (Router Cache `staleTime: 0`). Caching is opt-in, not opt-out.

**Next.js 16.2+ (stable):** set `cacheComponents: true` in `next.config.ts` to opt into the Cache Components model — it subsumes and replaces the old `experimental.dynamicIO` and `experimental.ppr` flags in one setting. With it on, use the `'use cache'` directive (plus `cacheLife()` / `cacheTag()` / `updateTag()`, all stable as of 16.2) to mark cacheable functions, components, or pages explicitly, instead of relying on `fetch` options alone:

```ts
// app/products/[id]/page.tsx
async function getProduct(id: string) {
  'use cache';
  cacheLife('hours');
  cacheTag(`product-${id}`);
  return db.product.find(id);
}
```

### Cache Layers

| Layer                  | Default (Next 15+) | Opt-in Control                             |
| ----------------------- | -------------------- | -------------------------------------------- |
| Request (`fetch`)       | Uncached              | `{ cache: 'force-cache' }`                   |
| Data                    | Uncached              | `{ next: { revalidate: N, tags: [...] } }`   |
| Function/component      | Uncached              | `'use cache'` directive (16.2+, stable)      |
| Route Handler (GET)     | Uncached              | `export const dynamic = 'force-static'`      |
| Router Cache (client)   | `staleTime: 0`        | `staleTimes` config in `next.config.js`      |
| Full route              | Dynamic               | `export const dynamic = 'force-static'`      |

### Revalidation

| Method       | Use                                 |
| ------------ | ------------------------------------ |
| Opt-in cache | `{ cache: 'force-cache' }`           |
| Time-based   | `{ next: { revalidate: 60 } }`       |
| Directive-based (16.2+) | `'use cache'` + `cacheLife()`/`cacheTag()` |
| On-demand    | `revalidatePath/Tag` or `updateTag()` (16.2+) |
| No cache     | Default behavior — no options needed |

---

## 8. Server Actions

### Use Cases

- Form submissions
- Data mutations
- Revalidation triggers

### Best Practices

- Mark with 'use server'
- Validate all inputs
- Return typed responses
- Handle errors

---

## 9. Anti-Patterns / Common Mistakes

| ❌ Don't                        | ✅ Do                                                    |
| -------------------------------- | --------------------------------------------------------- |
| 'use client' everywhere          | Server by default                                          |
| Fetch in client components       | Fetch in server                                             |
| Skip loading states              | Use loading.tsx                                             |
| Ignore error boundaries          | Use error.tsx                                               |
| Large client bundles             | Dynamic imports                                             |
| Sync `params`/`cookies()`/`headers()` access | `await` them — sync fallback removed in Next 16 (throws, not warns) |
| New network logic in `middleware.ts`  | Use `proxy.ts` — `middleware.ts` is deprecated (codemod available) |
| Hand-rolling `experimental.dynamicIO`/`experimental.ppr` | `cacheComponents: true` (Next 16.2+ stable, supersedes both) |

---

## 10. Project Structure

```
app/
├── (marketing)/     # Route group
│   └── page.tsx
├── (dashboard)/
│   ├── layout.tsx   # Dashboard layout
│   └── page.tsx
├── api/
│   └── [resource]/
│       └── route.ts
└── components/
    └── ui/
```

---

> **Remember:** Server Components are the default for a reason. Start there, add client only when needed.
