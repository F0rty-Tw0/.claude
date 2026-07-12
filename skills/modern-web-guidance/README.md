# Modern Web Guidance

A search tool for modern web development best practices, queried via `npx` before implementing any HTML/CSS or client-side JS feature. Training data goes stale fast on web APIs, so this skill exists to pull current, Baseline-aware guidance instead of relying on memorized (possibly obsolete) patterns.

## What It Does

| Step | Action |
| --- | --- |
| Search | `npx -y modern-web-guidance@latest search "<query>"` — finds relevant guides by similarity |
| Retrieve | `npx -y modern-web-guidance@latest retrieve "<id>"` — pulls the full guide markdown |
| List | `npx -y modern-web-guidance@latest list` — browse all guides if search comes up thin |

Guides are framework-agnostic and encode browser support policy — Baseline "Widely available" features are safe by default, anything less requires the fallback the guide recommends unless the user has stated their own browser support policy.

---

## When to Use

Trigger immediately when the task touches:
- modals, dialogs, popovers, anchor positioning, container queries, `:has()`
- scroll-driven animation, View Transitions, parallax/reveal effects
- Core Web Vitals work — LCP, INP, `content-visibility`, fetch priority
- filesystem access, WebUSB, WebSockets, WebAssembly
- adapting layout/styles inside React, Vue, or Angular

Skip for backend code, CI/CD, or generic scripting/linting — this skill is frontend-only.
