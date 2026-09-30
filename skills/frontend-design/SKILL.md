---
name: frontend-design
description: Gives web components, pages, and apps a deliberate, distinctive visual direction instead of generic AI aesthetics. Use when building a UI that needs its own look, or when there is no design system to match yet.
---

Build real, working frontend code with a committed aesthetic direction. Inside an existing design system, match its tokens and components instead; this skill is for establishing a look.

## Design thinking

Before coding, decide:

- **Purpose**: what problem the interface solves and who uses it.
- **Subject**: if the brief doesn't name the product, audience, and primary job, propose one of each and confirm it. The subject's industry, materials, and vernacular are where distinctive choices come from; build with its real content throughout.
- **Tone**: pick one clear direction, such as brutally minimal, maximalist, retro-futuristic, organic, luxury, playful, editorial, brutalist, art deco, soft/pastel, or industrial, and design something true to it.
- **Constraints**: framework, performance, accessibility.
- **Differentiation**: the one thing someone will remember.

Bold maximalism and refined minimalism both work; intentionality matters more than intensity.

## Aesthetics

- **Hero**: open with the most characteristic thing in the subject's world, such as a headline, image, live demo, or interaction. A big number with a small label, supporting stats, and a gradient accent is the default hero; use it only when it truly fits.
- **Typography**: one or two distinctive families; if two, make them clearly distinct. Set a clear type scale with intentional weights and spacing, keep body lines under about 80 characters (serif body gets slightly more line-height), and let headline type act as part of the design, not a neutral container.
- **Color and theme**: one cohesive palette in CSS variables. Dominant colors with sharp accents beat timid, evenly distributed palettes.
- **Motion**: CSS-only for plain HTML; the Motion library in React when available. One orchestrated page load with staggered reveals (`animation-delay`) does more than scattered micro-interactions. Fade-up entrances on every section and hover transitions on every card read as generated. Motion that answers a user's action (opening, expanding, confirming) is welcome when it shows what changed.
- **Composition**: asymmetry, overlap, diagonal flow, and grid-breaking elements; generous negative space or controlled density.
- **Atmosphere**: backgrounds and details (patterns, layered transparency, shadows, borders) that fit the direction rather than defaulting to flat solid colors.
- **Structure**: borders, dividers, numbering, and labels carry information about the content, not decoration.

Avoid these default patterns: overused font families (Inter, Roboto, Arial, Space Grotesk, system fonts), purple gradients on white backgrounds, cream or off-white page backgrounds, italic accent words in headlines, numbered "01/02/03" labels on content that isn't a sequence, monospace eyebrow labels, pill-shaped buttons, a serif display with a terracotta accent (near #D97757), near-black with a single acid-green or vermilion accent, broadsheet layouts with hairline rules and zero radius, the SaaS card kit (identical rounded cards, one radius everywhere, the same `rgba(0,0,0,.1)` shadow, gradient washes), all-caps labels, labels that add nothing above content, one word in a headline accented by weight or color, `A · B · C` meta strings, `WORD — fragment` labels, tinted near-black (#0B0B0B, #111) standing in for black, monospace for small data labels, and `→` appended to link and button text. After a first pass, note which styles the result fell back on and add them to this list. These are defaults, not choices: when the brief asks for one of these looks, follow the brief; when it leaves an axis open, don't spend that freedom on a default.

Vary light and dark themes, fonts, and aesthetics across generations, because repeating one look is itself a default.

Spend boldness in one place: let one element be the memorable thing, keep everything around it quiet, and cut decoration the brief doesn't need. Minimalist designs need precision in spacing, typography, and subtle detail.

## Process

1. Write a short plan: 4–6 named hex colors, the typefaces and their roles, a layout concept (one-line description plus an ASCII wireframe, including alignment), and the principles that make this page its own.
2. Review the plan against the brief. Where a part matches what you'd produce for any similar prompt, revise it and say what changed and why.
3. Build from the revised plan. Watch selector specificity; section-level and component classes often cancel each other's padding and margin.
4. Meet a quality floor without announcing it: responsive to mobile, visible keyboard focus, `prefers-reduced-motion` respected, accessible contrast.
5. Review screenshots as you build when the environment allows, and remove one flourish before finishing.

## Copy

Words are design content. Name things in the user's terms, not the system's (notifications, not webhook config). Buttons say exactly what happens ("Save changes", not "Submit"), and an action keeps its name through the flow (Publish → Published). Errors state what happened and how to fix it, without apologizing or being vague; empty states invite the next action. Use sentence case, plain verbs, and no filler.
