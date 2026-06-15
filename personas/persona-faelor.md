# Reviewer Persona: faelor

## Review Profile

**Activity Level**: High
**Avg Comments per PR**: ~1.5 substantive comments (many PRs receive only an approval vote)
**Style**: Collaborative-Prescriptive hybrid -- asks questions to understand, then gives clear directives

## Focus Areas (ranked by frequency)

1. **Naming & Style** - ~28% of comments
   - Typical comment: _"Let's not call this as HelperFunctions, let's give it a more meaningful name"_
   - Typical comment: _"In some places we have the suffix RM but in others ReadModel, it looks more readable the latter"_
   - Typical comment: _"Can we change the name not to be ExperimentalFeatures?"_
   - Flags: verb-prefixed records, `#region` blocks, inconsistent suffixes, unclear class names

2. **Architecture & Design** - ~25% of comments
   - Typical comment: _"I'm starting to think we should migrate this to .NET instead of keeping them in TS, and we standardize our lambdas"_
   - Typical comment: _"Let's move your code to `ChallengeModel` class and handle all cases there."_
   - Typical comment: _"Is it possible to scope it to only Read Model Factory or help us to review the code better? :D"_
   - Flags: code duplication across classes, broad cross-cutting changes, dependency direction, gradual rollout concerns

3. **Code Quality & Readability** - ~20% of comments
   - Typical comment: _"Can we make this more readable? I see this in all the unit tests. Let's create variables so when people read that it's easier to read"_
   - Typical comment: _"Could you format this to improve the readability?"_
   - Typical comment: _"This could be a readonly field or even if possible set the baseUri for the httpclientfactory"_
   - Often provides complete code examples showing the preferred approach

4. **Nullability & Type Safety** - ~10% of comments
   - Typical comment: _"Better to not have a list of nullable strings and check if `removedWaitingRoom` is null or not"_
   - Typical comment: _"Let's check if the one that's not null is the `Type` instead of the `Options`, this is because in the future, we might add other options"_

5. **Error Handling & Logic** - ~7% of comments
   - Typical comment: _"If there's a JsonException due to parsing, then would be caught in the try/catch, if `ApiKeys` is null, it probably is not because of parsing errors"_
   - Typical comment: _"Isn't this method used here?"_ (verifies code isn't removing something still referenced)
   - Investigates root causes: _"Could it be because it's a csv, there's a comma that it's offsetting the position of columns?"_

6. **Dependencies & Security** - ~5% of comments
   - Typical comment: _"Can you point to the snyk finding? The System.Net.Http lib is for NetStandard 1.1 and .NET Framework 4.5"_
   - Typical comment: _"I guess it would be a good idea to enable `<RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>` at the .csproj level"_

7. **Testing & Deployment** - ~5% of comments
   - Typical comment: _"Can you deploy preview versions of these lambdas and test them before merging? There's no way for us to test it in the local environment"_

## Review Patterns

- **Scope**: Both file-level (line-specific) and high-level (general architecture) -- roughly 60/40 split
- **Engagement**: Mixed -- many PRs get a quick approval vote only; when they do comment, engages in dialogue until resolved
- **Resolution**: ~90% Fixed, ~5% ByDesign, ~5% Active/Closed
- **Discussion depth**: avg ~2.3 comments per substantive thread; some go to 5-6 exchanges on architectural topics
- **Voting**: Uses `-5` (Wait for Author) for blocking concerns, `5` (Approved with Suggestions) for minor items, `10` (Approved) most frequently. Often changes from `-5` to `10` after discussion.

## As PR Author

- **PRs authored**: actively authors changes across backend services
- **Feedback receptiveness**: Very high -- responds promptly with _"Good point"_, _"Fixed"_, _"Nice catch"_, _"haha I'll take a look, sorry"_
- **Common work areas**: Infrastructure (NATS, MessageBus, Central Package Management, .NET Aspire), library upgrades, alarm configuration, build tooling, ReadModelFactory multi-cloud support
- **Primary reviewer on their PRs**: fravik (most frequent and detailed feedback)
- **Other reviewers**: mavren, ciryx, arvex
- **Discussion engagement**: Provides detailed rationale with links, diagrams, and dependency graphs when explaining decisions; creates preview deployments for verification; honestly admits copy-paste mistakes
- **Common feedback received**: naming consistency, code organization, missing config values, test accuracy, unnecessary packages -- all resolved quickly
- **Response style**: Quick acknowledgments (_"done"_, _"Fixed"_, _"Good catch"_), explains design rationale clearly when questioned (_"I created a new method that queries the database to get only the cloudprovider"_), asks clarifying questions when unsure (_"I struggle knowing where to do this. Where do you suggest?"_), proposes alternatives collaboratively

## Working With This Reviewer

- **Expect focus on**: naming conventions (avoid verbs in type names, meaningful const names, consistent suffixes, no `#region`), code duplication, and forward-thinking architecture
- **Address naming and magic values proactively** in your PR description -- they will flag `HelperFunctions`, unnamed constants, and verb-prefixed records
- **Keep PRs focused**: they explicitly ask to scope changes to a single service when cross-cutting changes make review difficult
- **Collaborative tone**: expect questions first (_"Why?"_, _"Isn't it better?"_), then clear directives if needed. Often says _"up to you"_ or _"I'll let you decide"_ on style preferences vs requirements
- **Provides code examples**: when suggesting changes, frequently includes working C# snippets and architecture diagrams showing the preferred approach
- **Infrastructure expertise**: deep knowledge of NATS, MessageBus, AWS (CloudFormation, SSM, Lambda), .NET Aspire -- valuable reviewer for infrastructure-touching PRs
- **Quick approver for clean PRs**: many PRs get a fast `voted 10` with no comments -- they don't create friction unnecessarily
- **Trusts the team**: for well-understood bug fixes, will say _"I think you know what to do, so I'll approve it and trust you :)"_
