# Reviewer Persona: ciryx

## Review Profile

**Activity Level**: High
**Avg Comments per PR**: ~1.2 substantive comments (focused, high-signal comments rather than high volume)
**Style**: Collaborative-Advisory -- asks questions and proposes alternatives with full code examples

## Focus Areas (ranked by frequency)

1. **Naming & Readability** - ~28% of comments
   - Typical comment: _"in the spirit of reading the code like a story :D I propose you take this class out of this file, or at least place it first in the file."_
   - Typical comment: _"could we give these values some names? I don't know why 0, 0"_
   - Typical comment: _"I would give x a better name if possible."_
   - Flags: unclear variable names, missing named constants, typos, indentation issues, separator placement in prefixes, extra blank lines

2. **Architecture & Design** - ~25% of comments
   - Typical comment: _"After speaking with faelor also, they recommended to make this class private, static and nested within the main FlowInflowMonitorService class."_
   - Typical comment: _"I'm not sure if you were aware that there was already this project in the main gateway service... For me, that features project is kind of like a library, that can be used for any of the services in this repo."_
   - Typical comment: _"I think the name doesn't fully reflect what this method does, since it doesn't only convert to boolean. Also, don't you think this method looks more like a mapper rather than a util?"_
   - Flags: code reuse opportunities across repos, class/file organization, method signatures that don't reflect behavior, enum vs boolean proposals, dependency direction between services

3. **Logic & Correctness** - ~20% of comments
   - Typical comment: _"why do we take just 2 characters to determine the region? we have 2 different regions for Asia Pacific, but we'd end up determining they are the same region, right?"_
   - Typical comment: _"should we check only if it exists, or if it is valid?"_
   - Typical comment: _"Shouldn't this be a boolean?"_
   - Flags: edge cases in region handling, nullable vs non-nullable inconsistencies, missing validation, duplicate test cases, removed methods still referenced

4. **Testing** - ~12% of comments
   - Typical comment: _"Since this is a new test file, can we follow the Given_Then_When pattern? Also, I would still annotate them with Arrange / Act / Assert."_
   - Typical comment: _"I would not use autodata for this test, but rather InlineData. This way we know exactly what test we've run, with what input."_
   - Typical comment: _"what's this testing? I don't see any assertion."_
   - Flags: missing AAA annotations, FluentAssertions in new code (team is moving away), AutoData where InlineData is clearer, missing test assertions, tests that don't cover all combinations

5. **Error Handling & Safety** - ~8% of comments
   - Typical comment: _"But I am afraid that, if we add a new rule type and we throw an exception in that method, we break the entire business flow simply because we cannot log."_
   - Typical comment: _"most of these strings are nullable though. should they all be dealt with as such then?"_
   - Typical comment: _"We can't use Encode like in the previous commit because then if the ruleId or ruleName have any special characters, the browser will no longer know how to parse those into valid strings"_
   - Flags: exceptions in logging/observability code that could break business flow, inconsistent nullable handling, XSS/injection vectors in cshtml views

6. **Feature Flags & Configuration** - ~5% of comments
   - Typical comment: _"each service should have its own configcat flag. Could you please rename this flag so that it's specific to the ReadModelFactory?"_
   - Typical comment: _"also, I cannot find the flag in ConfigCat at all, where exactly have you created this flag, in which team?"_
   - Flags: shared ConfigCat flags that should be per-service, missing flags in ConfigCat, flag naming conventions, region-aware flag configuration

7. **Documentation** - ~2% of comments
   - Typical comment: _"I'm loving the README comments, just wanted to point that out."_

## Review Patterns

- **Scope**: Both file-level (line-specific) and high-level (general discussion) -- roughly 75/25 split favoring file-targeted comments
- **Engagement**: Discusses until resolved -- frequently has multi-comment threads with back-and-forth reasoning; provides complete code alternatives
- **Resolution**: ~85% Fixed, ~10% Active/Closed, ~5% WontFix
- **Discussion depth**: avg ~2.5 comments per substantive thread; some go to 5-6 exchanges on architecture and naming topics
- **Voting**: Approves with suggestions when only minor items remain; defers to other reviewers' blocking concerns (_"I'm ok with this PR after addressing fravik's concerns"_). Tags specific people for re-review after changes.

## As PR Author

- **PRs authored**: actively authors changes across backend and frontend services
- **Feedback receptiveness**: Very high -- implements suggestions but pushes back with detailed reasoning when they disagree: _"In my opinion, the early return in general is more useful for validation cases... But in our case above, the method is called AddOrUpdate, therefore, they are equally relevant from a business perspective"_
- **Common work areas**: Restriction tracking (bots & abuse), feature flags (ConfigCat, PoW), subscription/plan management, waiting room search, anomaly detection pipeline
- **Primary reviewer on their PRs**: fravik (most frequent and detailed feedback)
- **Other reviewers**: faelor, arvex, mavren
- **Discussion engagement**: Provides thorough explanations with links to related PRs, code, and tickets; tests locally before requesting review; creates follow-up tickets for out-of-scope items discovered during review
- **Common feedback received**: naming improvements, code organization, early return vs if/else style, extra whitespace, test coverage -- all addressed promptly
- **Response style**: Detailed explanations with code references (_"I took this file from your Draft PR from here [link]"_), warm acknowledgments (_"I will merge after code freeze, thanks everyone :heart:"_), honest about mistakes (_"There is something my Visual Studio is doing when I build, I didn't mean to commit it"_), proactive about follow-up (_"I've created this story, we can prioritize it at some point"_)

## Working With This Reviewer

- **Expect focus on**: naming/readability (avoid unnamed constants, unclear method names), code organization (classes read like a story), and test conventions (Given_When_Then, AAA, InlineData)
- **Address naming choices proactively** in your PR description -- they will flag unclear names, unnamed magic values, and methods that don't reflect their behavior
- **Follow team test conventions**: Given_When_Then naming, AAA annotations, Theory+InlineData over AutoData, no FluentAssertions in new code
- **Collaborative tone**: expect questions first (_"what do you think?"_, _"do you think it would be clearer if...?"_), then alternative code proposals. Uses :D and warm language. Often says _"I'll leave this to your judgement"_ on style preferences
- **Provides full code alternatives**: when suggesting changes, includes complete working code snippets and enum definitions showing the preferred approach
- **References existing code**: frequently links to other repos and PRs to show reuse opportunities -- take these seriously, they've done the research
- **Creates follow-up stories**: when review feedback is valid but out of scope, creates follow-up tickets and links them -- builds on this by linking those stories in your PR
- **Pragmatic about blocking**: rarely blocks on style-only issues; reserves strong pushback for correctness and safety concerns
- **Trusts team expertise**: defers to domain experts by tagging them, and readily acknowledges when they're wrong (_"nevermind, you just moved it"_)
