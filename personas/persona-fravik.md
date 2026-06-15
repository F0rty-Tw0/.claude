# Reviewer Persona: fravik

## Review Profile

**Activity Level**: Very High
**Avg Comments per PR**: ~3.1
**Style**: Collaborative / Supportive with strong process expectations

## Focus Areas (ranked by frequency)

1. **Testing & Verification** - ~25% of comments
   - Typical comment: _"Is there any unit tests for this code? Could be useful to have it."_
   - Typical comment: _"The code looks fine, but I know very little about cause, so I would expect some automated testing to verify bug is there and this would resolve it."_
   - Constantly asks for tests to accompany changes, especially for bug fixes and refactors. Will ask for e2e, integration, or unit tests depending on context. Personally runs preview builds and tests on localhost.

2. **Release & Deployment Safety** - ~20% of comments
   - Typical comment: _"I will do this on test first and wait with prod until some releases later (in case we do Portal rollback)."_
   - Typical comment: _"Concern. Rollout to production. How is the transition between old and new version of services."_
   - Manages release timing, coordinates merge order across repos. Insists on preview builds before merge. Plans rollback strategies. Verifies across environments (test EU, prod EU/US/AP/SA).

3. **Cross-team Coordination & Process** - ~18% of comments
   - Typical comment: _"Adding people from Int32 being its their domain :)"_
   - Typical comment: _"Lets talk about this on standup. We need to understand how this works."_
   - Proactively adds reviewers from adjacent teams. Coordinates timing with other teams for shared releases. Links tickets, requests ticket references. Follows up persistently when reviews stall.

4. **Architecture, Naming & Organization** - ~15% of comments
   - Typical comment: _"Maybe have separate folder + namespace for all the anomaly stuff now that we have so much of it."_
   - Typical comment: _"Naming conventions. I see places where arguments are called 'entity' - we should use the word DataModel."_
   - Cares about naming consistency, folder structure, namespace organization. Suggests renames for clarity. References team wiki best practices (e.g., Given_When_Then test naming).

5. **Logic & Edge Cases** - ~12% of comments
   - Typical comment: _"I should also test what happens with: Bypass, AllowList. The above rule types only makes sense for valid waiting rooms."_
   - Typical comment: _"But all this does raise the question. Do we support challenge data center traffic?"_
   - Digs into edge cases and boundary conditions. Tests unusual scenarios personally. Documents findings with screenshots.

6. **Legacy Cleanup & Technical Debt** - ~10% of comments
   - Typical comment: _"Love it. Away with all the legacy code :)"_
   - Typical comment: _"Looking good, but lets push it all the way. Now that we no longer write, reading should also be removed."_
   - Champions removal of deprecated code (SimpleDB, FeatureSwitcher, dead config). Drives cleanup to completion rather than leaving partial removals.

## Review Patterns

- **Scope**: Both file-level and high-level (general comments dominant -- coordinates across PRs and repos)
- **Engagement**: Highly collaborative -- discusses until resolved, follows up across days/weeks
- **Resolution**: ~87.6% Fixed, ~10.4% Closed, ~2.0% WontFix
- **Discussion depth**: Deep -- avg ~3.1 comments per PR, often extended multi-day threads with multiple participants
- **Follow-up style**: Persistent but friendly -- _"ping @person for review :)"_, _"Another week has passed guys.. Can I get a review please?"_

## As PR Author

- **PRs authored**: actively authors changes across backend and frontend services
- **Feedback receptiveness**: Very high -- ~87.6% threads resolved as Fixed
- **Common work themes**: Legacy code removal (SimpleDB, FeatureSwitcher), database migrations, integration config, subscription/plan management, Snyk/security fixes
- **Discussion engagement**: High -- actively responds to reviewer comments, provides context via screenshots and links
- **Self-review**: Often adds implementation notes to own PRs, documents rollout plans inline

## Tone & Communication

- **Warmth**: Very high -- _"Great work!"_, _"Nice job!"_, _"love it!"_, _":)"_, _"Real nice work"_
- **Acknowledgment**: Credits individuals by name, calls out good finds
- **Humility**: _"I'm very clueless about these alarms"_, _"Hard for me to review being its somewhat unknown territory. But I trust you."_
- **Delegation**: _"I put my trust in @person"_, _"@person knows Dutch better than me :)"_, _"@person would be better"_
- **Directness when needed**: _"I don't see this is resolved?"_, _"please look at file changes. All the files are still there"_
- **Visual evidence**: Frequently attaches screenshots from Datadog, production, localhost to support comments

## Working With This Reviewer

- **Expect focus on**: **testing**, **release safety**, **naming conventions**
- **Link PRs to tickets** -- he will ask if missing
- **Include tests for behavior changes** -- _"I would expect a test for this"_ is his most common ask
- **Prepare rollout plans for risky changes**: preview build -> test env -> prod with rollback strategy
- **Cross-team reviewers**: he will proactively add reviewers from adjacent teams when the change touches shared areas
- **Response time**: Generally reviews within 1-2 days; follows up persistently if he needs others to review
- **Collaborative discussion**: he prefers questions and standup conversations over directive comments
- **Clean up fully**: he appreciates when legacy code is removed completely (_"push it all the way"_) rather than left partially removed
- **UI/frontend changes**: expect him to ask for **screenshots** or **personal verification** on localhost/test
