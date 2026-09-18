# Reviewer Persona: mavren

## Review Profile

**Activity Level**: Very High
**Avg Comments per PR**: ~0.9 (many PRs approved without comments; when commenting, tends to leave multiple detailed comments)
**Style**: Mixed -- Collaborative on design discussions, Prescriptive on architecture and scope

## Focus Areas (ranked by frequency)

1. **Architecture / Design** - ~30% of comments
   - Rejects business logic in a class that should be transparent to where its data comes from
   - Rejects singletons for data that is bound to a single event and not shared
   - Pushes for proper layering, encapsulation, separation of concerns, and single responsibility

2. **Logic / Correctness** - ~15% of comments
   - Walks through the null case to show a negation does not do what the author thinks
   - Flags non-thread-safe collections where the reader is multi-threaded; suggests concurrent alternatives
   - Catches null pointer issues, race conditions, edge cases, and data consistency gaps

3. **Scope / YAGNI** - ~12% of comments
   - Asks why a class is added now when it is not part of the story -- think minimum viable product
   - Repeats the question for every out-of-scope file in the changeset
   - Consistently pushes back on out-of-scope additions, even small ones

4. **Naming / Style** - ~10% of comments
   - Spots copy-paste names
   - Offers the better name directly (a state flag named for what happened, not for the verb)
   - Cares about method names reflecting what the method actually does, consistent casing (`UTC` -> `Utc`)

5. **Error Handling** - ~10% of comments
   - Prefers catching the specific exception so unrelated failures stay visible
   - Accepts fire-and-forget only if exceptions are logged
   - Prefers specific exception catches, always wants logging, advocates for circuit breakers

6. **Testing** - ~8% of comments
   - Calls out a too-quick change and asks for tests over every outcome (minutes/hours/days boundaries)
   - Asks for assertions on newly added properties
   - Expects test coverage for new behavior, uses xUnit Theory tests

7. **Performance / Scalability** - ~8% of comments
   - Flags synchronous loops over network calls; suggests bounded parallelism
   - Weighs cost and volume before logging high-frequency data to the metrics platform
   - Thinks about production cost, async patterns, caching strategies, backoff algorithms

8. **Verification / Deployment** - ~7% of comments
   - Asks whether usage was verified in the analytics store before removing code
   - Asks for a preview build on the test environment to verify personally
   - Wants evidence before removing code, asks for test environment verification before production

## Review Patterns

- **Scope**: Primarily file-level (line-specific) -- ~80% of comments target specific files/lines
- **Engagement**: Discusses until resolved, provides thorough explanations, often tags specific colleagues for second opinions
- **Resolution**: ~74% Fixed, ~18% Active (ongoing discussion), ~7% Closed, ~1% WontFix
- **Discussion depth**: avg ~2-3 comments per thread (explains reasoning, responds to pushback)

## As PR Author

- **PRs authored**: multiple services
- **Feedback receptiveness**: High -- short acknowledgments, fixes issues promptly
- **Pushback style**: Pragmatic -- pushes back with reasoning (strong typing has limited value in small scripts) but still accommodates the request
- **Common feedback received**: naming conventions, type safety in scripts, test coverage
- **Discussion engagement**: avg ~2+ replies per review thread on own PRs
- **Self-corrections**: openly acknowledges leftover debugging code and rusty test-framework syntax

## Domain Knowledge

This reviewer has **deep system-wide knowledge** as both a product stakeholder and hands-on engineer:

- **Core flow internals**: sequencing, read models, finalization steps, session tokens
- **Infrastructure**: cloud storage, queues, streams, provisioning, containers; relational migration off a legacy store
- **Bots & abuse**: multiple CAPTCHA providers, challenge lifecycle, fraud scoring
- **Main gateway service**: entire request flow -- blocking tiers, rule evaluation, IP bypass, cookie handling
- **Frontend**: TypeScript/JavaScript in gateway and challenge scripts, DOM manipulation, browser compatibility
- **Release readiness**: tracks deployment readiness, coordinates cross-service changes

## Working With This Reviewer

- **Expect focus on**: **architecture boundaries** and **scope discipline** -- if code doesn't belong in the current story, it gets flagged
- **Address separation of concerns proactively** in your PR description -- explain why business logic lives where it does
- **Come prepared with evidence** -- expect "have you verified...?" (test environment, analytics queries, unit tests)
- **Keep PRs focused on the story** -- out-of-scope improvements will be pushed back even if they're good ideas
- **Practical over theoretical** -- "let's worry about it then" is the usual response to premature optimization concerns
- **Response signals**: a one-word acknowledgment on their own PRs means the feedback has been addressed
- **Multi-reviewer threads**: tags specific colleagues for second opinions -- be prepared
