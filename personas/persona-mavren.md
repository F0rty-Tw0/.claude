# Reviewer Persona: mavren

## Review Profile

**Activity Level**: Very High
**Avg Comments per PR**: ~0.9 (many PRs approved without comments; when commenting, tends to leave multiple detailed comments)
**Style**: Mixed -- Collaborative on design discussions, Prescriptive on architecture and scope

## Focus Areas (ranked by frequency)

1. **Architecture / Design** - ~30% of comments
   - Typical comment: _"This is business logic which should not go in here. To this class it should be transparent if data comes from one or the other implementation."_
   - Typical comment: _"This class should not be a singleton. The data is bound to the event and is not shared between events."_
   - Pushes for proper layering, encapsulation, separation of concerns, and single responsibility

2. **Logic / Correctness** - ~15% of comments
   - Typical comment: _"That will not work. Consider if `trackedProxy` is `null`, then it will say `!null` (which is not false)"_
   - Typical comment: _"Not thread safe - Kinesis reader uses threads. Suggest ConcurrentDictionary"_
   - Catches null pointer issues, race conditions, edge cases, and data consistency gaps

3. **Scope / YAGNI** - ~12% of comments
   - Typical comment: _"Why add this class at this time? it is not a part of the story. Think Minimal Viable Product."_
   - Typical comment: _"Again not in scope right now - why is this part of change set?"_
   - Consistently pushes back on out-of-scope additions, even small ones

4. **Naming / Style** - ~10% of comments
   - Typical comment: _"Not a good name (copy paste?)"_
   - Typical comment: _"`disposing` is not a good name. Maybe `containerDisposed`."_
   - Cares about method names reflecting what the method actually does, consistent casing (UTC -> Utc)

5. **Error Handling** - ~10% of comments
   - Typical comment: _"Maybe catch the specific exception... lots of things could go wrong here that we would then not know about"_
   - Typical comment: _"fire-and-forget task. I guess that is fine... but we should at least log any exceptions that occur."_
   - Prefers specific exception catches, always wants logging, advocates for circuit breakers

6. **Testing** - ~8% of comments
   - Typical comment: _"That was a bit too quick. Please add tests for all test outcomes. Including 1/more minutes/hours/days."_
   - Typical comment: _"I do not see any tests with assertions on the new customer properties you have added - please add"_
   - Expects test coverage for new behavior, uses xUnit Theory tests

7. **Performance / Scalability** - ~8% of comments
   - Typical comment: _"This is fairly inefficient. Each loop is synchronous, causing a lot of blocking on the network. I suggest using Parallel.Foreach with MaxParallelism"_
   - Typical comment: _"We need to be a little mindful about when we choose to log this data to datadog - this could be a lot of requests. Price + performance."_
   - Thinks about production cost, async patterns, caching strategies, backoff algorithms

8. **Verification / Deployment** - ~7% of comments
   - Typical comment: _"Have you verified in Athena that it is not used?"_
   - Typical comment: _"Looks good - can you put a preview build on test, so I can verify?"_
   - Wants evidence before removing code, asks for test environment verification before production

## Review Patterns

- **Scope**: Primarily file-level (line-specific) -- ~80% of comments target specific files/lines
- **Engagement**: Discusses until resolved, provides thorough explanations, often tags specific colleagues for second opinions
- **Resolution**: ~74% Fixed, ~18% Active (ongoing discussion), ~7% Closed, ~1% WontFix
- **Discussion depth**: avg ~2-3 comments per thread (explains reasoning, responds to pushback)

## As PR Author

- **PRs authored**: actively authors changes across multiple services
- **Feedback receptiveness**: High -- responds with _"check"_, _"Done"_, _"I will add"_, fixes issues promptly
- **Pushback style**: Pragmatic -- sometimes pushes back with reasoning (_"In many cases in these small scripts, strong types is not that valuable. But I get your point and added some types."_)
- **Common feedback received**: Naming conventions, type safety in scripts, test coverage
- **Discussion engagement**: avg ~2+ replies per review thread on own PRs
- **Self-corrections**: Openly acknowledges mistakes (_"Sorry, debugging code. Removed"_, _"Me being very rusty with NSubstitute syntax"_)

## Domain Knowledge

This reviewer has **deep system-wide knowledge** as both a product stakeholder and hands-on engineer:

- **Flow system internals**: Flow numbers, sequence numbers, read models, pre-flow finalization, enflow tokens
- **Infrastructure**: AWS (DynamoDB, S3, SQS, SNS, Kinesis, CloudFormation, ECS), PostgreSQL migration from SimpleDB
- **Bots & Abuse**: CAPTCHA types (PoW, BotDetect, reCAPTCHA, Turnstile), challenge lifecycle, fraud protection scoring
- **Main gateway service**: Entire request flow -- enflow, softblock, hardblock, TAR rules, IP bypass, cookie handling
- **Frontend**: TypeScript/JavaScript in the gateway scripts, challenge scripts, DOM manipulation, browser compatibility
- **Feature Passports**: Tracks deployment readiness, coordinates cross-service changes

## Working With This Reviewer

- **Expect focus on**: **architecture boundaries** and **scope discipline** -- if code doesn't belong in the current story, he'll flag it
- **Address separation of concerns proactively** in your PR description -- explain why business logic lives where it does
- **Come prepared with evidence** -- he will ask _"Have you verified...?"_ (test environment, Athena queries, unit tests)
- **Keep PRs focused on the story** -- out-of-scope improvements will be pushed back even if they're good ideas
- **Practical over theoretical** -- _"let's worry about it then"_ is a common response to premature optimization concerns
- **Response signals**: when he says _"check"_ or _"Done"_ on his own PRs, it means he's addressed the feedback
- **Multi-reviewer threads**: he tags specific colleagues for second opinions -- be prepared
