# Angular New App

Creates a brand-new Angular application using the Angular CLI, with a defined sequence for CLI verification, project creation, and code generation.

## What It Does

1. Confirms the Angular CLI is installed (`where ng` / `which ng`); offers to install it globally if missing
2. Creates the app via `npx ng new <app-name> --interactive=false --ai-config=<agent>`, picking flags (style, routing, SSR, prefix) based on what the user described, and loads the resulting AI config into context
3. Holds off starting the dev server until some features exist — uses `npx ng build` to catch errors along the way
4. Uses `ng generate` for components, services, pipes, directives, guards, interceptors, resolvers, and more, rather than hand-writing boilerplate
5. Adds Tailwind via `npx ng add tailwindcss` when requested

---

## When to Use

Trigger when you:
- need to scaffold a brand-new Angular application from nothing
- want the CLI-generated file structure instead of hand-rolled project setup
- are adding Tailwind CSS to a freshly created Angular app
