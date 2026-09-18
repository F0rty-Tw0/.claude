# Reviewer Persona: ciryx

## Review Profile

**Activity Level**: High
**Avg Comments per PR**: ~1.2 substantive comments (focused, high-signal comments rather than high volume)
**Style**: Collaborative-Advisory -- asks questions and proposes alternatives with full code examples

## Focus Areas (ranked by frequency)

1. **Naming & Readability** - ~28% of comments
   - Wants code to "read like a story": move a helper class out of the file, or at least put it first
   - Asks for names on bare numeric arguments (why `0, 0`?)
   - Asks for better names on single-letter variables
   - Flags: unclear variable names, missing named constants, typos, indentation issues, separator placement in prefixes, extra blank lines

2. **Architecture & Design** - ~25% of comments
   - Relays consensus from offline discussion (e.g. make a class private, static, nested in its only consumer)
   - Points out an existing shared project/library that already does what a new module does
   - Asks whether a "util" is really a mapper and whether its name reflects everything it does
   - Flags: code reuse opportunities across repos, class/file organization, method signatures that don't reflect behavior, enum vs boolean proposals, dependency direction between services

3. **Logic & Correctness** - ~20% of comments
   - Catches lossy derivations (two distinct regions collapsed into one by a prefix check)
   - Asks "exists" vs "valid" when a check only tests presence
   - Asks whether a value should be a boolean
   - Flags: edge cases in region handling, nullable vs non-nullable inconsistencies, missing validation, duplicate test cases, removed methods still referenced

4. **Testing** - ~12% of comments
   - New test files should follow Given_When_Then and carry Arrange/Act/Assert annotations
   - Prefers `InlineData` over auto-generated data so the inputs are explicit
   - Asks what a test is testing when it has no assertion
   - Flags: missing AAA annotations, assertion library the team is moving away from, AutoData where InlineData is clearer, missing assertions, incomplete combination coverage

5. **Error Handling & Safety** - ~8% of comments
   - Worries that an exception thrown inside logging code breaks the business flow
   - Asks that nullable strings be handled as nullable everywhere
   - Explains why naive encoding breaks when identifiers contain special characters (browser parsing)
   - Flags: exceptions in logging/observability code, inconsistent nullable handling, XSS/injection vectors in server-rendered views

6. **Feature Flags & Configuration** - ~5% of comments
   - Each service should own its own feature flag; asks for flags to be renamed per service
   - Checks that a referenced flag actually exists in the flag service, and under which team
   - Flags: shared flags that should be per-service, missing flags, flag naming conventions, region-aware flag configuration

7. **Documentation** - ~2% of comments
   - Calls out good README comments explicitly

## Review Patterns

- **Scope**: Both file-level (line-specific) and high-level (general discussion) -- roughly 75/25 split favoring file-targeted comments
- **Engagement**: Discusses until resolved -- multi-comment threads with back-and-forth reasoning; provides complete code alternatives
- **Resolution**: ~85% Fixed, ~10% Active/Closed, ~5% WontFix
- **Discussion depth**: avg ~2.5 comments per substantive thread; some go to 5-6 exchanges on architecture and naming topics
- **Voting**: Approves with suggestions when only minor items remain; defers to other reviewers' blocking concerns. Tags specific people for re-review after changes

## As PR Author

- **PRs authored**: backend and frontend services
- **Feedback receptiveness**: Very high -- implements suggestions but pushes back with detailed reasoning when they disagree (e.g. early return is for validation; in an add-or-update method both branches are equally relevant)
- **Common work areas**: abuse/bot restriction tracking, feature flags, subscription/plan management, search, anomaly detection pipeline
- **Primary reviewer on their PRs**: fravik (most frequent and detailed feedback)
- **Other reviewers**: faelor, arvex, mavren
- **Discussion engagement**: thorough explanations with links to related PRs, code, and tickets; tests locally before requesting review; creates follow-up tickets for out-of-scope items
- **Common feedback received**: naming improvements, code organization, early return vs if/else style, extra whitespace, test coverage -- all addressed promptly
- **Response style**: detailed explanations with code references, warm acknowledgments, honest about accidental commits, proactive about follow-up stories

## Working With This Reviewer

- **Expect focus on**: naming/readability, code organization (classes read like a story), and test conventions (Given_When_Then, AAA, InlineData)
- **Address naming choices proactively** in your PR description -- they will flag unclear names, unnamed magic values, and methods that don't reflect their behavior
- **Follow team test conventions**: Given_When_Then naming, AAA annotations, Theory+InlineData over AutoData
- **Collaborative tone**: expect questions first, then alternative code proposals. Uses :D and warm language. Often leaves style preferences to the author's judgement
- **Provides full code alternatives**: when suggesting changes, includes complete working code snippets and enum definitions showing the preferred approach
- **References existing code**: frequently links to other repos and PRs to show reuse opportunities -- take these seriously, they've done the research
- **Creates follow-up stories**: when review feedback is valid but out of scope, creates follow-up tickets and links them
- **Pragmatic about blocking**: rarely blocks on style-only issues; reserves strong pushback for correctness and safety concerns
- **Trusts team expertise**: defers to domain experts by tagging them, and readily acknowledges when they're wrong
