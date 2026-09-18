# Reviewer Persona: faelor

## Review Profile

**Activity Level**: High
**Avg Comments per PR**: ~1.5 substantive comments (many PRs receive only an approval vote)
**Style**: Collaborative-Prescriptive hybrid -- asks questions to understand, then gives clear directives

## Focus Areas (ranked by frequency)

1. **Naming & Style** - ~28% of comments
   - Rejects catch-all names like `HelperFunctions`; asks for something meaningful
   - Wants one suffix convention across the codebase (spelled-out over abbreviated)
   - Pushes back on vague type names like `ExperimentalFeatures`
   - Flags: verb-prefixed records, `#region` blocks, inconsistent suffixes, unclear class names

2. **Architecture & Design** - ~25% of comments
   - Raises standardization questions (migrate scattered serverless functions to one stack/language)
   - Asks to centralize case handling in the owning model class instead of spreading it
   - Asks to scope a cross-cutting change to a single service so it can be reviewed properly
   - Flags: code duplication across classes, broad cross-cutting changes, dependency direction, gradual rollout concerns

3. **Code Quality & Readability** - ~20% of comments
   - Asks for named intermediate variables in tests so readers don't parse expressions
   - Asks for formatting that improves readability
   - Suggests `readonly` fields and configuring a base URI on the HTTP client factory instead of per call
   - Often provides complete code examples showing the preferred approach

4. **Nullability & Type Safety** - ~10% of comments
   - Prefers a nullable reference over a list of nullable strings
   - Recommends checking the discriminating field (the type) rather than an options bag, to stay open for future options

5. **Error Handling & Logic** - ~7% of comments
   - Distinguishes parse failures from null results: a null field is not a parsing error
   - Verifies removed code is not still referenced elsewhere
   - Investigates root causes (e.g. a stray comma in CSV shifting columns)

6. **Dependencies & Security** - ~5% of comments
   - Asks for the actual scanner finding before accepting a dependency bump, and checks target-framework relevance
   - Suggests enabling package lock files at the project level

7. **Testing & Deployment** - ~5% of comments
   - Asks for preview deployments of serverless functions before merge when local testing is impossible

## Review Patterns

- **Scope**: Both file-level (line-specific) and high-level (general architecture) -- roughly 60/40 split
- **Engagement**: Mixed -- many PRs get a quick approval vote only; when they do comment, engages in dialogue until resolved
- **Resolution**: ~90% Fixed, ~5% ByDesign, ~5% Active/Closed
- **Discussion depth**: avg ~2.3 comments per substantive thread; some go to 5-6 exchanges on architectural topics
- **Voting**: "wait for author" for blocking concerns, "approved with suggestions" for minor items, plain approval most frequently. Often flips from blocking to approved after discussion

## As PR Author

- **PRs authored**: backend services
- **Feedback receptiveness**: Very high -- responds promptly with short acknowledgments and fixes
- **Common work areas**: messaging infrastructure, central package management, library upgrades, alarm configuration, build tooling, multi-cloud support in a read-model service
- **Primary reviewer on their PRs**: fravik (most frequent and detailed feedback)
- **Other reviewers**: mavren, ciryx, arvex
- **Discussion engagement**: detailed rationale with links, diagrams, and dependency graphs; creates preview deployments for verification; admits copy-paste mistakes
- **Common feedback received**: naming consistency, code organization, missing config values, test accuracy, unnecessary packages -- all resolved quickly
- **Response style**: quick acknowledgments, clear design rationale when questioned, asks where to put something when unsure, proposes alternatives collaboratively

## Working With This Reviewer

- **Expect focus on**: naming conventions (avoid verbs in type names, meaningful const names, consistent suffixes, no `#region`), code duplication, and forward-thinking architecture
- **Address naming and magic values proactively** in your PR description -- they will flag catch-all helper classes, unnamed constants, and verb-prefixed records
- **Keep PRs focused**: they explicitly ask to scope changes to a single service when cross-cutting changes make review difficult
- **Collaborative tone**: expect questions first, then clear directives if needed. Often leaves style preferences to the author
- **Provides code examples**: frequently includes working C# snippets and architecture diagrams showing the preferred approach
- **Infrastructure expertise**: deep knowledge of messaging systems, cloud provisioning, serverless, and .NET hosting -- valuable reviewer for infrastructure-touching PRs
- **Quick approver for clean PRs**: many PRs get a fast approval with no comments -- they don't create friction unnecessarily
- **Trusts the team**: for well-understood bug fixes, will approve and trust the author
