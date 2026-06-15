# Reviewer Persona: mevora

## Review Profile

**Activity Level**: High
**Avg Comments per PR**: ~0.6 (selective -- comments when it matters)
**Style**: Collaborative / Inquisitive

## Focus Areas (ranked by frequency)

1. **Logic/Correctness** - ~25% of comments
   - Typical comment: _"I might be wrong, but won't this always return 0?"_
   - Spots subtle bugs like duplicate dictionary keys, always-zero Math.Min, unintended GUID regeneration on deserialization
   - Often phrases as questions to verify understanding rather than assert errors

2. **Architecture/Design** - ~22% of comments
   - Typical comment: _"Seems like we are bolting on more changes on an already complicated flow. Wouldn't it be better to really split it into 2 real pages instead?"_
   - Flags Open/Closed principle violations, separation of concerns, and accidental coupling
   - Prefers clean splits over hacks-on-hacks

3. **Error Handling/Safety** - ~14% of comments
   - Typical comment: _"I just don't want the logger to crash the whole Gateway. What do you think?"_
   - Concerned about exception propagation killing critical services
   - Validates input trust boundaries (_"we can't really trust the input from the customer"_)

4. **Configuration/Infrastructure** - ~10% of comments
   - Typical comment: _"Check a service config file for defaultViolationThreshold - the same thing happened with the refactoring of the verdict client"_
   - Deep knowledge of CloudFormation, Kubernetes, and deployment pipelines
   - Catches config drift between services

5. **Style/Naming** - ~8% of comments
   - Typical comment: _"rename to useVisitorSessionReputation"_
   - Enforces C# conventions (curly brackets on if-statements, line separation)
   - Provides inline code suggestions for quick fixes

6. **Testing** - ~8% of comments
   - Typical comment: _"Think if you want to drive this forward, add at least some tests that makes sure the splitting works"_
   - Advocates for test coverage on risky changes but doesn't block on it

7. **Knowledge Sharing** - ~8% of comments
   - Typical comment: _"Your almost using the result pattern here :)"_ + link to article
   - Shares links to documentation, patterns, and related PRs
   - References `Math.Clamp` and other stdlib utilities

## Review Patterns

- **Scope**: Both file-level (~69%) and high-level general (~31%)
- **Engagement**: Discusses until understanding is clear, often multi-turn threads with back-and-forth
- **Resolution**: ~75% Fixed, ~13% Closed, ~10% Active, ~2% WontFix
- **Discussion depth**: avg ~1.8 comments per thread (mix of single observations and extended discussions)

## As PR Author

- **PRs authored**: actively authors changes across infrastructure and backend services
- **Feedback receptiveness**: High -- thread resolution rates mirror team norms
- **Common PR themes**: cleanup/removal of unused code, infrastructure changes (Kubernetes, Akamai), bug fixes (env variables, config defaults)
- **PR style**: Small, focused changes with clear intent (e.g., _"remove: old unused SRE alarm"_, _"fix: wrong casing of env variable"_)
- **Discussion engagement**: Responsive and transparent about reasoning (_"I tried 2 things... I'm open for suggestions"_)

## Tone & Communication

- **Humble and self-aware**: _"Sorry to be that person"_, _"I might be wrong"_, _"I'm not 100% sure"_
- **Non-blocking**: _"I'm not blocking this PR, so feel free to carry on"_, _"Most of my comments are optional"_
- **Collaborative**: Tags teammates for second opinions, references related PRs and external resources
- **Conversational**: Writes in natural prose rather than terse directives, explains reasoning
- **Humor**: Occasional light touches (_"I think this is the sns topic that is the magic that makes safetynet work :D"_)

## Working With This Reviewer

- **Expect focus on**: **logical correctness**, **architectural cleanliness**, and **exception safety**
- **Address edge cases proactively** in your PR description -- mevora will find them
- **Justify design decisions**: mevora will ask _"why not split this differently?"_ if the approach feels bolted-on
- **Comments are suggestions by default** -- mevora rarely blocks, but the observations are usually worth addressing
- **Tag others for cross-verification** -- mevora appreciates this on shared code areas
- **Call out infrastructure and config changes** explicitly since mevora tracks deployment pipeline details closely
