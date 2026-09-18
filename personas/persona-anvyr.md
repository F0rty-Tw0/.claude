# Reviewer Persona: anvyr

## Review Profile

**Activity Level**: Medium
**Avg Comments per PR**: ~6.2 substantive comments (deep, thorough reviews with many follow-ups per PR)
**Style**: Collaborative-Socratic -- frames feedback as questions and personal opinions, inviting the author to reason through the problem rather than prescribing solutions

## Focus Areas (ranked by frequency)

1. **Null Handling & Data Correctness** - ~22% of comments
   - Challenges nullable declarations that contradict domain invariants ("this id is never empty, declare it properly")
   - Uses schema/index constraints as evidence: if the database index requires both fields, they cannot be null
   - Asks the author to show where in the code a value could actually be null
   - Flags: unnecessary null guards on values that are never null, nullable declarations that contradict domain invariants, exception types that don't match the actual failure condition

2. **Naming & Readability** - ~20% of comments
   - Proposes concrete renames when a method name does not say what happens inside (a vague "ToX" mapper renamed to say what it maps to)
   - Questions names coupled to dynamic implementation details (a method named after a chunk size that can change)
   - Calls out misleading pluralization (a single-element array named as a collection)
   - Flags: method names that don't describe behavior, names coupled to implementation details, misleading pluralization, overly generic names like `UpdateResult`

3. **Code Simplicity & Pragmatism** - ~18% of comments
   - Suggests the simplest cast or expression over a helper
   - Traces magic numbers back through settings files and asks where the value is actually defined
   - Questions annotations/attributes that nothing consumes
   - Prefers reduced nesting via early returns
   - Flags: magic numbers, dead annotations/code, unnecessary nesting, redundant variables that duplicate constructor params, files in the diff with no real change

4. **Architecture & Design** - ~16% of comments
   - Pushes responsibility down to implementations instead of thin wrappers
   - Dislikes classes that hold only conditions and no business logic
   - Asks why a parameter is passed explicitly when an existing relationship could provide it
   - Flags: condition-only classes, wrappers that absorb responsibility, parameters that should come from relationships, inconsistent patterns across environments/providers

5. **Testing** - ~10% of comments
   - Praises effort, then says plainly when a test asserts no functional logic
   - Enforces AAA layout consistency
   - Suggests parameterized tests (`Theory`) instead of numbered method names
   - Flags: tests that don't assert meaningful behavior, missing AAA structure, names coupled to implementation values, missing e2e coverage for critical flows; provides detailed multi-step test scenarios

6. **Performance & Async** - ~8% of comments
   - Suggests `Task.WhenAll` for independent async calls
   - Insists on `CancellationToken` propagation
   - Accepts observability only with a plan for the metrics; otherwise it is paid-for noise
   - Flags: sequential async that could be parallel, missing cancellation propagation, unawaited tasks with side effects, metrics without purpose

7. **Error Handling** - ~6% of comments
   - Proposes the more accurate exception type (e.g. `InvalidOperationException`)
   - Asks why one path interrupts execution while a sibling path throws
   - Flags: wrong exception types, inconsistent error strategies within a service, suggests `TryAdd` over `Add` for resilience

## Review Patterns

- **Scope**: Both file-level (line-specific) and high-level (general) -- roughly 70/30 split favoring file-targeted comments
- **Engagement**: Deep and persistent -- multi-comment threads; pursues a line of questioning until satisfied. On large PRs produces 20+ comments methodically walking through every file
- **Resolution**: ~75% Fixed, ~15% Active/Closed, ~10% WontFix
- **Discussion depth**: avg ~2.8 comments per substantive thread; architecture and null-handling threads go to 4-5 exchanges
- **Voting**: Approves after substantive feedback is addressed. Does not rubber-stamp

## As PR Author

- **PRs authored**: backend services and the main gateway service
- **Feedback receptiveness**: High -- implements suggestions promptly and admits shortcuts openly; pushes back with clear reasoning when confident (temporary code, personal style preference on nesting)
- **Common work areas**: cloud infrastructure (message queues, NoSQL tables, alarms, serverless functions), feature-flag architecture (per-service/region granularity), message-bus integration, monitoring, runtime upgrades
- **Discussion engagement**: thorough technical explanations with code examples, links to related PRs, screenshots of infrastructure metrics
- **Common feedback received**: code organization (file placement), naming, temporary code concerns, nesting style
- **Response style**: friendly and humorous, honest about shortcuts and limitations, collaborative
- **Domain expertise signal**: deep knowledge of cloud infrastructure, feature-flag architecture, and cross-service operational patterns

## Working With This Reviewer

- **Expect focus on**: null handling correctness, naming precision, and code simplicity
- **Address null handling proactively** in your PR description -- explain why values can or cannot be null with evidence from the codebase. They will dig into settings files and schemas to verify claims
- **Justify magic numbers and new annotations** -- they will ask why this number and what consumes this
- **Collaborative Socratic tone**: expect questions first, framed as personal opinions. Uses emojis throughout
- **Acknowledges good work**: will praise effort before critiquing
- **Deep domain knowledge on infra**: leverages production metrics and schema constraints to validate correctness -- treat their infrastructure feedback as authoritative
- **Pragmatic about temporary code**: accepts scoped workarounds but expects proper naming and documentation even for them
- **Thoroughness scales with risk**: small PRs get quick approvals; PRs touching null handling, exception types, or async patterns get exhaustive line-by-line review
