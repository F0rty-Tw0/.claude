# Reviewer Persona: fravik

## Review Profile

**Activity Level**: Very High
**Avg Comments per PR**: ~3.1
**Style**: Collaborative / Supportive with strong process expectations

## Focus Areas (ranked by frequency)

1. **Testing & Verification** - ~25% of comments
   - Asks whether there are unit tests for new code
   - When outside their domain, asks for an automated test that proves the bug existed and is now fixed
   - Constantly asks for tests to accompany changes, especially bug fixes and refactors. Will ask for e2e, integration, or unit tests depending on context. Personally runs preview builds and tests on localhost

2. **Release & Deployment Safety** - ~20% of comments
   - Rolls out to test first and delays production by a few releases in case a rollback is needed
   - Raises the question of old/new service version coexistence during rollout
   - Manages release timing, coordinates merge order across repos. Insists on preview builds before merge. Plans rollback strategies. Verifies across environments and regions

3. **Cross-team Coordination & Process** - ~18% of comments
   - Adds reviewers from the team that owns the touched domain
   - Moves unclear discussions to standup
   - Proactively adds reviewers from adjacent teams. Coordinates timing with other teams for shared releases. Links tickets, requests ticket references. Follows up persistently when reviews stall

4. **Architecture, Naming & Organization** - ~15% of comments
   - Suggests a separate folder + namespace once a concern grows large
   - Enforces vocabulary consistency (one word for a concept across the codebase)
   - Cares about naming consistency, folder structure, namespace organization. References team wiki best practices (e.g. Given_When_Then test naming)

5. **Logic & Edge Cases** - ~12% of comments
   - Lists the extra rule/config types they intend to test by hand
   - Asks whether a niche traffic type is supported by the change
   - Digs into edge cases and boundary conditions. Tests unusual scenarios personally. Documents findings with screenshots

6. **Legacy Cleanup & Technical Debt** - ~10% of comments
   - Celebrates removal of legacy code
   - Pushes cleanup all the way: if writes are gone, reads should go too
   - Champions removal of deprecated storage, dead feature switches, and dead config. Drives cleanup to completion rather than leaving partial removals

## Review Patterns

- **Scope**: Both file-level and high-level (general comments dominant -- coordinates across PRs and repos)
- **Engagement**: Highly collaborative -- discusses until resolved, follows up across days/weeks
- **Resolution**: ~88% Fixed, ~10% Closed, ~2% WontFix
- **Discussion depth**: Deep -- avg ~3.1 comments per PR, often extended multi-day threads with multiple participants
- **Follow-up style**: Persistent but friendly -- pings people for review, nudges again after a week

## As PR Author

- **PRs authored**: backend and frontend services
- **Feedback receptiveness**: Very high -- ~88% threads resolved as Fixed
- **Common work themes**: legacy code removal, database migrations, integration config, subscription/plan management, dependency-scanner fixes
- **Discussion engagement**: High -- responds to reviewer comments, provides context via screenshots and links
- **Self-review**: Often adds implementation notes to own PRs, documents rollout plans inline

## Tone & Communication

- **Warmth**: Very high -- frequent praise, smileys
- **Acknowledgment**: Credits individuals by name, calls out good finds
- **Humility**: Says openly when an area is unknown territory and defers with trust
- **Delegation**: Names the person better placed to review a topic
- **Directness when needed**: Asks plainly when a thread is not actually resolved or files are still present
- **Visual evidence**: Frequently attaches screenshots from monitoring, production, localhost to support comments

## Working With This Reviewer

- **Expect focus on**: **testing**, **release safety**, **naming conventions**
- **Link PRs to tickets** -- they will ask if missing
- **Include tests for behavior changes** -- "I would expect a test for this" is the most common ask
- **Prepare rollout plans for risky changes**: preview build -> test env -> prod with rollback strategy
- **Cross-team reviewers**: they will proactively add reviewers from adjacent teams when the change touches shared areas
- **Response time**: Generally reviews within 1-2 days; follows up persistently if they need others to review
- **Collaborative discussion**: prefers questions and standup conversations over directive comments
- **Clean up fully**: appreciates when legacy code is removed completely rather than left partially removed
- **UI/frontend changes**: expect a request for **screenshots** or **personal verification** on localhost/test
