# Reviewer Persona: mevora

## Review Profile

**Activity Level**: High
**Avg Comments per PR**: ~0.6 (selective -- comments when it matters)
**Style**: Collaborative / Inquisitive

## Focus Areas (ranked by frequency)

1. **Logic/Correctness** - ~25% of comments
   - Asks, hedged, whether an expression always returns zero
   - Spots subtle bugs like duplicate dictionary keys, an always-zero `Math.Min`, unintended GUID regeneration on deserialization
   - Often phrases as questions to verify understanding rather than assert errors

2. **Architecture/Design** - ~22% of comments
   - Questions bolting more changes onto an already complicated flow; proposes a real split into two pages instead
   - Flags Open/Closed principle violations, separation of concerns, and accidental coupling
   - Prefers clean splits over hacks-on-hacks

3. **Error Handling/Safety** - ~14% of comments
   - Does not want a logger able to crash the gateway service
   - Concerned about exception propagation killing critical services
   - Validates input trust boundaries (customer-supplied input is untrusted)

4. **Configuration/Infrastructure** - ~10% of comments
   - Points to a sibling service config where the same default was missed during an earlier refactor
   - Deep knowledge of cloud provisioning, container orchestration, and deployment pipelines
   - Catches config drift between services

5. **Style/Naming** - ~8% of comments
   - Gives the rename directly (a hook/flag named for the feature it toggles)
   - Enforces C# conventions (braces on if-statements, line separation)
   - Provides inline code suggestions for quick fixes

6. **Testing** - ~8% of comments
   - If the author wants to drive a change forward, asks for at least tests that prove the core mechanism works
   - Advocates for test coverage on risky changes but doesn't block on it

7. **Knowledge Sharing** - ~8% of comments
   - Notes when code is almost a known pattern (e.g. result pattern) and links an article
   - Shares links to documentation, patterns, and related PRs
   - References `Math.Clamp` and other stdlib utilities

## Review Patterns

- **Scope**: Both file-level (~69%) and high-level general (~31%)
- **Engagement**: Discusses until understanding is clear, often multi-turn threads with back-and-forth
- **Resolution**: ~75% Fixed, ~13% Closed, ~10% Active, ~2% WontFix
- **Discussion depth**: avg ~1.8 comments per thread (mix of single observations and extended discussions)

## As PR Author

- **PRs authored**: infrastructure and backend services
- **Feedback receptiveness**: High -- thread resolution rates mirror team norms
- **Common PR themes**: cleanup/removal of unused code, infrastructure changes (orchestration, CDN), bug fixes (env variables, config defaults)
- **PR style**: small, focused changes with clear intent (remove an unused alarm, fix env-variable casing)
- **Discussion engagement**: responsive and transparent about what was tried; open to suggestions

## Tone & Communication

- **Humble and self-aware**: apologizes for being "that person", says "I might be wrong", "not 100% sure"
- **Non-blocking**: states explicitly when not blocking; most comments marked optional
- **Collaborative**: tags teammates for second opinions, references related PRs and external resources
- **Conversational**: natural prose rather than terse directives, explains reasoning
- **Humor**: occasional light touches

## Working With This Reviewer

- **Expect focus on**: **logical correctness**, **architectural cleanliness**, and **exception safety**
- **Address edge cases proactively** in your PR description -- mevora will find them
- **Justify design decisions**: mevora will ask why not split this differently if the approach feels bolted-on
- **Comments are suggestions by default** -- mevora rarely blocks, but the observations are usually worth addressing
- **Tag others for cross-verification** -- mevora appreciates this on shared code areas
- **Call out infrastructure and config changes** explicitly since mevora tracks deployment pipeline details closely
