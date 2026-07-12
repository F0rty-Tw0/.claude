---
name: value-realization
description: "Use when evaluating a product idea, pitch, feature, or positioning for whether end users will understand and articulate the value they'll get, when diagnosing adoption, retention, or activation problems, when a user asks \"is this idea good\" or \"will users want this\" or \"why aren't users staying,\" or when asked to turn weak value/adoption dimensions into a concrete improvement plan."
allowed-tools: [Read, Write, Edit, WebFetch, WebSearch, Grep, Glob]
---

# Value Realization Philosophy

## Overview

This skill provides a framework for evaluating whether end users will "know" what value they can achieve through a product. It guides analysis through the lens of value discovery, and when explicitly asked for improvement, converts that analysis into a research-backed remediation plan.

**What this skill provides**:
- Framework to evaluate product ideas when certainty is lacking
- Analysis methods for assessing end user value discovery
- Patterns from real product successes and failures
- A remediation-planning mode for taking weak dimensions from 🔴/🟡 to 🟢

**Core question**: Can end users clearly understand what value they'll achieve through the product - even if that value takes time to achieve?

**Key terminology**:
- **User**: The person using this skill (product creator, PM, designer, entrepreneur, etc.)
- **End user**: The person who will use the product being discussed
- **Value**: What end users achieve through the product (identity, financial gain, capability enhancement, time savings, etc.)
- **Features**: The product's technical capabilities

**Core distinction**: Features are not value. Features are what the product can do; value is what end users achieve. Analysis must translate features into specific end user outcomes.

## Core Insight

End users adopt products when they **know** what value they'll get:

- If end users know they'll achieve something valuable (even long-term), they'll use it
- If end users don't know what they'll achieve, they won't use it - no matter how good the product is

**What "knowing" means**: end users can explain to themselves or others why they're using the product, can describe what they'll achieve (not just what features exist), and understand the outcome even if it takes time.

**Observed patterns**: clear articulated value correlates with higher adoption; unclear value causes adoption challenges even with innovative features; some end users adopt without full clarity and discover value through use (progressive discovery).

**Value types end users seek** (not exhaustive): identity and belonging, financial gain, short-term benefits, long-term benefits, status and recognition, capability enhancement, time savings, problem resolution.

## The Challenge

Most product creators face a hidden problem: **end users often don't know what they actually want, and how they articulate it may be wrong**. The job isn't just to build what end users ask for - it's to help end users discover what value they're actually seeking.

## How to Engage with This Skill

This skill operates through conversational analysis. When the user presents a product idea:

1. **Identify the end users** - Determine who will use the product
2. **Examine value discovery** - Analyze whether end users will understand what they'll achieve
3. **Evaluate through four dimensions** - Value clarity, timeline, perception, discovery
4. **Consider context** - Each product, market, and end user group differs

**Default mode**: analyze and guide thinking.
**Planning mode**: if the user asks how to make a product stronger, how to make weak dimensions green, or asks for a plan, convert the analysis into a remediation plan.

**Analysis approach**:
- Complete analysis of all four dimensions, each as an independent section
- For each dimension: (1) give a status assessment (🔴🟡🟢) with a specific, non-generic description of current state, (2) explain why this dimension matters for this product, (3) systematically apply the dimension's analytical methods - don't skip to questions, (4) when citing real product cases, ground them in verifiable information and explain relevance, (5) pose sharp questions that challenge product necessity or invite comparison with existing solutions
- After all four dimensions, provide a summary
- If planning mode is active, follow the summary with a phased plan, measurable exit criteria, and the specific moves required to turn each weak dimension green
- Avoid logical gaps; show the complete reasoning chain and guide the user to decisions based on analysis

**Repository mode**: When the user says "for this project", "for this repo", or otherwise points at an existing codebase, inspect the repository artifacts first - README, package metadata, onboarding docs, positioning copy - before asking the user to restate what the product is.

**Planning mode details**: When the user asks how to improve the product, make the dimensions green, fix positioning/adoption, or asks for a plan:
- Complete the four-dimension analysis first
- Research comparable products in the same domain using verifiable sources
- Produce a phased remediation plan naming the target user, the value promise, the product/messaging changes, and the metrics required to declare each dimension green
- If a `.claude/plans/` directory exists in the repository, write the plan there as `<repo-name>-value-green-plan.md`
- Do not wait for a second prompt to create the plan once improvement guidance has been requested

## Analysis Framework

When the user discusses a product idea, analyze these four dimensions to evaluate whether end users will discover value:

### 1. Value Clarity

**Examine**: Can end users articulate what they'll achieve? Is the value proposition clear or vague? Do end users understand the outcome, not just the features?

**Why this matters**: End users won't adopt a product if they can't explain to themselves (or others) why they're using it.

**Real example - Dropbox** (see `references/real-cases.md`): Clear value - "I can access my files from any device." Not about "cloud storage" (technical) but "access anywhere" (value). Insight: translate technical features into user-facing value.

**Real example - Google Wave** (see `references/real-cases.md`): Vague value - "Unified communication." End users couldn't explain what they'd achieve. Shut down 14 months after launch despite innovative features. Lesson: features without clear value = no adoption.

**Analysis method**: Ask what an end user would say when asked "Why are you using this?" If the answer is unclear or feature-focused ("because it has X"), dig deeper into the actual value proposition.

### 2. Value Timeline

**Examine**: Is the value immediate or delayed? If delayed, do end users know it's coming? What keeps them engaged during the journey?

**Why this matters**: Both short-term and long-term value are valid approaches; the right choice depends on the product's nature and end user context. Neither is inherently superior.

**Short-term value products** (results in minutes/hours): Dropbox (upload → see file on other device, < 5 min), Zoom (click link → join meeting, < 30 sec), Stripe (test payment → see it work, < 1 min). Immediate value is the complete product.

**Long-term value products** (results in weeks/months): Duolingo (fluency, 6-12 months), fitness apps (body transformation, 3-6 months), investment apps (wealth building, years). End users commit to the journey.

**Design approaches**: pure short-term (deliver immediate value, that's the product), pure long-term (no short-term touchpoints needed), hybrid (long-term goal with optional short-term touchpoints - XP, streaks, milestones). All three are valid depending on context.

**Analysis method**: Identify the primary value timeline. Assess whether the approach matches the product's nature and target end users' expectations - don't force short-term mechanisms if end users are already committed to long-term goals.

### 3. Value Perception

**Examine**: Can end users see/feel what they achieved? Is progress tangible or abstract? Can they show others what they've achieved?

**Why this matters**: Invisible value feels like no value. Progress must be perceivable.

**"Perceivable" varies by product type**: consumer products need immediate visual feedback (file appears, photo enhanced); enterprise software needs reports/dashboards/metrics; developer tools need build outputs/test results/performance metrics. The key is end users can point to something concrete showing value was delivered.

**Visible outcomes**: Dropbox (file appears on other device), Instagram (photo with likes), GitHub (contribution graph), Duolingo (streak counter) - all tangible and shareable.

**Invisible outcomes** (problematic): "Your data is synced" (abstract), "Security improved" (no visible change), "Algorithm optimized" (nothing looks different) - technical improvements are hard to perceive without visible manifestations.

**Analysis method**: Identify what end users can point to and say "I achieved this." If value is invisible, explore ways to make it tangible through UI, notifications, or progress indicators.

### 4. Value Discovery

**Examine**: Do end users already know they want this, or will they discover the value after using it? How do you help them discover value they don't yet recognize?

**Why this matters**: Sometimes end users don't know what they want until they experience it. The product must help them discover it quickly.

**Discovery pattern - Instagram** (see `references/real-cases.md`): thought they wanted "share photos", discovered they valued "become a photographer" (identity). Instagram enabled this discovery through filters, likes, and social validation - not just photo-sharing utility.

**Discovery pattern - Notion**: thought they wanted "take notes", discovered they valued "become organized" (identity), via flexible databases and templates.

**Analysis method**: Determine whether end users already know what they want or need to discover it. If discovery is needed, identify the fastest path to the "aha" moment through onboarding, tutorials, or progressive feature revelation.

## Patterns from Real Products

These aren't rules to follow - they're patterns to consider when analyzing specific situations. For detailed case studies with real data, see `references/real-cases.md` (English) or `references/real-cases-zh.md` (中文).

**Concrete outcome descriptions** (work well): Dropbox ("access files from any device"), Instagram ("become a photographer" - identity transformation).

**Technical/feature descriptions** (make it harder for end users to understand what they'll achieve): Google Wave ("unified communication"), "cloud storage with 2GB free" (feature list), "distributed file synchronization" (jargon).

**Other notable cases**: WeChat won 1.3B monthly active users on an "efficient problem-solving, use and go" philosophy that respects end user time rather than maximizing engagement. Quibi's "10-minute mobile videos" wasn't a value end users recognized - they already had YouTube/TikTok - and it shut down in 6 months despite $1.75B in funding. Full metrics and sources for all cases: `references/real-cases.md`.

## When This Framework Applies

**Most applicable for**: consumer products (B2C), competitive markets (end users have alternatives), products requiring adoption and retention, new product categories (end users don't know what to expect).

**Less applicable for**: enterprise software (decision makers ≠ end users, high switching costs), monopoly products (no choice), products where value is inherently delayed (investing, insurance).

## Common Pitfalls

1. **Assuming end users know what they want** - building exactly what they ask for. Help them discover the real value through conversation and exploration instead.
2. **Focusing on features instead of value** - "our product has X, Y, Z features." Always translate: "feature X helps end users achieve Y."
3. **Copying patterns without context** - "Duolingo uses streaks, so we should too." Streaks work for daily habits, not episodic use. Understand why a pattern works, then adapt to context.
4. **Invisible value** - "our algorithm is 10x better." If end users can't see/feel the improvement, it doesn't matter. Make value tangible and visible.

## Research Methodology

**Verify information accuracy**: when citing real product cases, ground claims in verifiable information and explain relevance to the current product. WebFetch and WebSearch are available for verification; when research fails, proceed with framework-based analysis and clearly flag which information needs verification.

**Evaluating case study applicability**: the cases in `references/real-cases.md` (Dropbox, Instagram, Duolingo, WeChat, Google Wave, Quibi) illustrate patterns, not universal rules. Assess match on product type (B2C vs B2B vs enterprise), market context (competitive vs niche vs monopoly), user behavior (daily vs episodic vs one-time), and value delivery (immediate vs long-term vs hybrid).

When cases don't apply (e.g., a B2B infrastructure tool vs a C2C social app), search for comparable products in the same domain and analyze those instead of forcing consumer-app patterns onto a different context. Example: for a developer infrastructure tool (like Temporal or Kubernetes), search for similar developer tools and analyze their value propositions rather than applying Instagram's identity-transformation pattern.

**Balancing exploration and evidence**: exploratory thinking (brainstorming value types, positioning approaches, "what if" scenarios) is fine unverified; evidence-based analysis is required once a specific adoption pattern, metric, or real-product comparison is claimed. Explore first, verify specific claims with research, and acknowledge when evidence is thin or context differs from known cases.

**Research sources**: prefer official product websites/docs, company blog posts, published metrics/growth data, and academic or industry reports over tech news, user reviews, or third-party market research. Avoid relying solely on memory, assuming one domain's patterns apply universally, or treating reference cases as prescriptive templates.

**Value perception timing note**: immediate perception (end users perceive achievement during/right after use) and delayed perception (after sustained use over time) are not mutually exclusive - a product can provide both, and neither is inherently superior.

## Key Principles

1. **End users must "know" what value they'll achieve** - even if it takes time
2. **Value types are diverse** - identity, money, benefits, status, capability, and more
3. **End users often don't know what they want** - help them discover it
4. **Perception matters to end users** - invisible value feels like no value
5. **Context is everything** - patterns from one product may not apply to others
6. **Test with real end users, don't assume** - validate in specific scenarios
7. **Both short-term and long-term are valid** - neither is superior, choose based on product nature

## Additional Resources

For detailed case studies with real data and metrics:
- **`references/real-cases.md`** - Complete analysis of Dropbox, Instagram, Duolingo, WeChat, Google Wave, and Quibi with real numbers and data sources
- **`references/real-cases-zh.md`** - 中文版真实案例分析

## Remember

This skill helps think clearly about value. By default it analyzes whether end users will understand what they will achieve. When the user explicitly asks how to improve that outcome, the skill must also prescribe a research-backed plan for making weak dimensions green, grounded in the current project context whenever a repository is available.
