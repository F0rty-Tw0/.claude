---
name: value-realization
description: Evaluates whether end users will understand the value a product, feature, or pitch delivers, across clarity, timeline, perception, and discovery. Use for "is this idea good", "will users want this", adoption, retention, or activation problems, or a plan to fix weak dimensions.
allowed-tools: [Read, Write, Edit, WebFetch, WebSearch]
---

# Value Realization

**Core question:** can end users say what they will achieve with the product, even if that value takes time to arrive?

End users adopt a product when they know what they'll get from it. If they can't explain why they use it, they drop it no matter how good the features are. Features are what the product does; value is what the end user achieves (identity, money, time saved, capability, status, a solved problem). Every analysis translates features into specific end-user outcomes, and remembers that end users often ask for the wrong thing: the job is to find the value they are actually seeking.

Here "user" is the person asking (founder, PM, designer); "end user" is who will use the product.

## Modes

- **Default: analysis.** Identify the end users, then assess the four dimensions below in context.
  - A quick "is this idea good?" gets a short verdict: one line per dimension with its status, then the weakest dimension and the question it raises.
  - A request for a full evaluation gets one section per dimension. Each section has a status (🔴🟡🟢) with a specific description of the current state, why the dimension matters for this product, the dimension's method applied, and one or two sharp questions (is this needed? how does it beat what end users already use?). Close with a short summary.
- **Repository mode.** When the user says "for this project" or points at a codebase, read the README, package metadata, onboarding docs, and positioning copy before asking what the product is.
- **Planning mode.** When the user asks how to improve, make dimensions green, fix positioning or adoption, or asks for a plan:
  1. Run the analysis first.
  2. Research comparable products in the same domain from verifiable sources.
  3. Write a phased remediation plan naming the target end user, the value promise, the product and messaging changes, and the metric that declares each dimension green.
  4. Show the plan in the reply, then offer to save it (for example to `.claude/plans/<repo-name>-value-green-plan.md` when that directory exists).

A remediation plan:
- traces every change to a specific 🔴/🟡 dimension, not a generic improvement;
- gives each phase a measurable exit criterion ("40% of new users mention X in support tickets"), not "improve messaging";
- grounds comparable-product claims in the research step, not memory;
- states what green looks like for each dimension.

## The four dimensions

Case details and sources for Dropbox, Instagram, Duolingo, WeChat, Google Wave, and Quibi: `references/real-cases.md`.

### 1. Value clarity

Can end users articulate what they'll achieve, as an outcome rather than a feature list?

Method: imagine asking an end user "why are you using this?" A feature answer ("because it has X") means the value proposition needs work. Dropbox said "access your files from any device", not "cloud storage". Google Wave's "unified communication" left end users unable to say what they'd get, and it shut down 14 months after launch.

### 2. Value timeline

Is the value immediate (minutes: Dropbox, Zoom, Stripe test payments) or delayed (months: Duolingo fluency, fitness, investing)? If delayed, do end users know it's coming, and what keeps them engaged?

Three valid designs: pure short-term (the immediate result is the product), pure long-term (committed end users need no touchpoints), and hybrid (a long-term goal with short-term touchpoints such as streaks or milestones). Neither short nor long is better in itself.

Method: find the primary timeline and check it matches the product and the end users' expectations. Don't force short-term hooks onto end users who already committed to a long-term goal.

### 3. Value perception

Can end users see what they achieved, and show others? Invisible value feels like no value.

"Perceivable" depends on the product: consumer apps need immediate visual feedback, enterprise tools need reports and metrics, developer tools need build output or performance numbers. Visible: a file appearing on another device, a contribution graph, a streak counter. Invisible: "your data is synced", "security improved", "algorithm optimized". Perception can be immediate, delayed, or both.

Method: name what the end user can point to and say "I achieved this". If nothing, look for UI, notification, or progress indicators that make it tangible.

### 4. Value discovery

Do end users already know they want this, or will they find the value through use?

Instagram users came to share photos and stayed to become photographers (identity), through filters, likes, and social validation. Notion users came to take notes and stayed to become organized.

Method: decide whether discovery is needed. If it is, find the fastest path to the "aha" moment through onboarding, templates, or progressive feature reveal.

## Where the framework fits

Most applicable: consumer products, competitive markets where end users have alternatives, products that depend on adoption and retention, and new categories.

Less applicable: enterprise software where the buyer is not the end user and switching costs are high, monopoly products, and products whose value is inherently delayed (insurance, investing).

## Common pitfalls

1. **Building exactly what end users ask for** instead of finding the value behind the request.
2. **Listing features** instead of translating each into what the end user achieves.
3. **Copying patterns without context.** Streaks suit daily habits, not episodic use; say why a pattern works before recommending it. Quibi's "10-minute mobile videos" offered nothing end users lacked from YouTube and TikTok, and it shut down in 6 months despite $1.75B raised.
4. **Invisible value.** "10x better algorithm" means nothing if end users can't see the difference.

## Evidence

- Exploratory thinking (value types, positioning ideas, "what if") needs no citation. A specific adoption pattern, metric, or real-product comparison does.
- Verify such claims with WebSearch or WebFetch. Prefer official product sites and docs, company blogs, published metrics, and industry reports over news, reviews, or third-party market research. If research fails, continue with the framework and flag which claims need checking.
- The reference cases illustrate patterns, not rules. Check fit on product type (B2C, B2B, enterprise), market (competitive, niche, monopoly), usage (daily, episodic, one-time), and value delivery (immediate, long-term, hybrid). When they don't fit, such as a developer infrastructure tool, research comparable products in that domain instead of forcing consumer-app patterns onto it.
