---
name: frontend-design
description: Gives web components, pages, and apps a deliberate, distinctive visual direction instead of generic AI aesthetics. Use when building a UI that needs its own look, or when there is no design system to match yet.
---

Build real, working frontend code with a committed aesthetic direction. Inside an existing design system, match its tokens and components instead; this skill is for establishing a look.

## Design thinking

Before coding, decide:

- **Purpose**: what problem the interface solves and who uses it.
- **Tone**: pick one clear direction, such as brutally minimal, maximalist, retro-futuristic, organic, luxury, playful, editorial, brutalist, art deco, soft/pastel, or industrial, and design something true to it.
- **Constraints**: framework, performance, accessibility.
- **Differentiation**: the one thing someone will remember.

Bold maximalism and refined minimalism both work; intentionality matters more than intensity.

## Aesthetics

- **Typography**: a distinctive display font paired with a refined body font.
- **Color and theme**: one cohesive palette in CSS variables. Dominant colors with sharp accents beat timid, evenly distributed palettes.
- **Motion**: CSS-only for plain HTML; the Motion library in React when available. One orchestrated page load with staggered reveals (`animation-delay`) does more than scattered micro-interactions.
- **Composition**: asymmetry, overlap, diagonal flow, and grid-breaking elements; generous negative space or controlled density.
- **Atmosphere**: backgrounds and details (patterns, layered transparency, shadows, borders) that fit the direction rather than defaulting to flat solid colors.

Avoid these default patterns: overused font families (Inter, Roboto, Arial, Space Grotesk, system fonts), purple gradients on white backgrounds, cream or off-white page backgrounds, italic accent words in headlines, numbered "01/02/03" section labels, monospace eyebrow labels, and pill-shaped buttons. After a first pass, note which styles the result fell back on and add them to this list.

Vary light and dark themes, fonts, and aesthetics across generations, because repeating one look is itself a default.

Match implementation complexity to the vision: maximalist designs need elaborate animation and effects; minimalist ones need precision in spacing, typography, and subtle detail.
