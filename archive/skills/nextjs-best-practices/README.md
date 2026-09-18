# Next.js Best Practices

Principles for Next.js App Router development covering Server Components, data fetching, routing patterns, caching, and server actions.

## What It Does

Provides decision frameworks and best practices across key Next.js areas:

| Area                | Guidance                                                              |
| ------------------- | --------------------------------------------------------------------- |
| **Components**      | Server by default; Client only for useState/useEffect/event handlers  |
| **Data Fetching**   | Static (cached), Revalidate (ISR), No-store (dynamic)                |
| **Routing**         | File conventions, route groups, parallel routes, intercepting routes  |
| **API Routes**      | Zod validation, proper status codes, Edge runtime                    |
| **Performance**     | next/image, dynamic imports, bundle analysis                         |
| **Caching**         | Request/Data/Route layers, time-based and on-demand revalidation     |
| **Server Actions**  | Form submissions, data mutations with 'use server'                   |

Includes anti-patterns to avoid: 'use client' everywhere, fetch in client components, skipping loading/error states.

---

## When to Use

Triggers when you:

- Develop with Next.js App Router
- Need to decide between Server and Client Components
- Implement data fetching, caching, or routing patterns
- Build API routes or server actions

---

## Core Principle

Server Components are the default for a reason. Start there, add client only when needed.

---
