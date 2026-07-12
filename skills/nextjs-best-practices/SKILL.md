---
name: nextjs-best-practices
description: Use when developing with Next.js App Router - covers Server Components, data fetching, routing patterns, caching, and server actions.
---

# Next.js Best Practices

> Principles for Next.js App Router development. Caching semantics below reflect Next.js 15+ (fetch is uncached by default; earlier versions cached by default).

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

**As of Next.js 15**, `fetch` requests, GET Route Handlers, and the client-side Router Cache are all **uncached by default** (Router Cache `staleTime: 0`). Caching is opt-in, not opt-out.

### Cache Layers

| Layer                  | Default (Next 15+) | Opt-in Control                             |
| ----------------------- | -------------------- | -------------------------------------------- |
| Request (`fetch`)       | Uncached              | `{ cache: 'force-cache' }`                   |
| Data                    | Uncached              | `{ next: { revalidate: N, tags: [...] } }`   |
| Route Handler (GET)     | Uncached              | `export const dynamic = 'force-static'`      |
| Router Cache (client)   | `staleTime: 0`        | `staleTimes` config in `next.config.js`      |
| Full route              | Dynamic               | `export const dynamic = 'force-static'`      |

### Revalidation

| Method       | Use                                 |
| ------------ | ------------------------------------ |
| Opt-in cache | `{ cache: 'force-cache' }`           |
| Time-based   | `{ next: { revalidate: 60 } }`       |
| On-demand    | `revalidatePath/Tag`                 |
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

## 9. Anti-Patterns

| ❌ Don't                   | ✅ Do             |
| -------------------------- | ----------------- |
| 'use client' everywhere    | Server by default |
| Fetch in client components | Fetch in server   |
| Skip loading states        | Use loading.tsx   |
| Ignore error boundaries    | Use error.tsx     |
| Large client bundles       | Dynamic imports   |

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
