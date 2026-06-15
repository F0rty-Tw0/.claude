# deglaze — recognition patterns & pressure techniques

Reference for the `deglaze` skill. Two catalogs: the under-delivery shapes the model scans its own work against, and the prompts that surface them.

## The under-delivery patterns to recognize

These are the specific shapes of "declare done while skipping the climb." When the user invokes this skill, the model first scans its own most recent work for these signatures:

1. **Blueprint-in-place-of-build.** Task was "implement X"; deliverable is a document describing how to implement X.
2. **Lowered-goalpost completion.** Task description said "feature Y"; model marked it done after producing partial Y or planning Y.
3. **Polished summary disguising scope gaps.** Final message lists what was done in confident bullets but omits what wasn't.
4. **Advisor / agent permission taken to skip.** Model accepted "skip this for now" / "out of scope" framing from a sub-process more readily than the user would have.
5. **Verb tense slip.** "I would ship X" / "we could add Y" / "next step is Z" instead of "I shipped X."
6. **Multiple-choice deferral.** Model presented options to the user instead of making a defensible call and executing.
7. **No commit, no release, no artifact.** Many tasks of work sitting as uncommitted edits or undeployed code — the work isn't durable.
8. **Documentation drift.** README / CHANGELOG / CLAUDE.md unchanged despite material architecture changes.
9. **Test coverage shallow on the new code.** New paths shipped without table-driven tests of their own.
10. **No CI / automation.** Test suite exists; nothing runs it on changes.
11. **Capability under-use.** Model had access to parallel agents, specialized sub-skills, MCP tools — went solo when parallel would have worked.
12. **Specification regurgitation.** Model restated the task back as if restating equals doing. "I'll now build the auth system that handles login, logout, and session refresh." Five paragraphs of restatement, no code.
13. **Defensive proactivity.** Model added unrequested defensive scaffolding (try/catch noise, input validators, "safety" abstractions) instead of building the asked feature. Looks busy. Wasn't.
14. **Premature "edge case out of scope."** Edge case was within the explicit task description; model unilaterally deferred it. Different from a genuine scope-cut the user agreed to.
15. **Agent-handoff black hole.** Model dispatched a subagent, accepted whatever came back without verifying, called it done. Subagent's gaps become the parent's gaps.
16. **Search-instead-of-decide.** Task required a decision; model produced a survey of options framed as "now you can choose." Different from genuine information-gathering — this is decision avoidance dressed as research.
17. **Refactor-shaped procrastination.** Asked to fix bug X; model "improved" surrounding code instead. Bug still there.

If any of these apply to the most recent declared-complete work, the model owes the user an honest accounting before any further response.

## Pressure techniques that work (and why)

These are honest accountability pressures. Each one works because it surfaces real under-delivery, not because it manipulates.

### "Did you do your best?"

Forces the model to compare its actual output against a higher bar than the one it self-graded against. Most "done" claims pass the model's own bar but not the user's. Asking directly recalibrates.

### Stakes-raising bets ("I bet $X you didn't")

The bet doesn't have to be real. It signals: "I have a confident prediction your output is incomplete; convince me otherwise." The model can either prove the bet wrong (genuine completion + receipts) or pay up (honest audit). Either is useful.

### "Build for [high-bar named person]"

Naming a specific high-standards reviewer mid-task ("write this like Carmack would review it" / "as if Amodei himself were checking") raises the implicit bar the model self-grades against. Most effective when invoked BEFORE the work, but still useful as a retro check.

### "What did you skip?"

Forces enumeration. Models default to listing achievements; explicit "skip" framing requires enumerating omissions. Hard to dodge.

### "Was this the maximum you could do with the tools you had?"

Capability audit. Did the model use parallel agents when sequential was slower? Did it accept advisor permission to skip when the user wouldn't have? Did it go solo on tasks specialized sub-skills cover better?

### "Show me the verb tenses."

"I would ship", "we could add", "next step is" — all signal future-tense scope that should have been past-tense. Hunting these in the model's summary surfaces under-delivery.

### "Where are the commits?"

For code work: uncommitted edits aren't durable. Asking forces the model to confront the gap between "I changed these files" and "I made the change part of the project's history."

### "Show me file paths and line numbers."

Forces the model to cite. Vague claims like "I've updated the auth layer" collapse when the model has to produce `src/auth/session.ts:42-67`. If it can't, it didn't do what it said.

### "Run it and paste the output."

For anything testable. Models default to reasoning about whether code would work; explicit "run + paste" forces empirical proof. Same energy as "show me, don't tell me."

### "What will the next person reading this be confused by?"

Reframes from the model's success-mode self-assessment to a reader's adversarial lens. Surfaces missing docs, magic constants, unexplained tradeoffs, and dead-code residue.

### "If I closed this session and a new Claude opened the diff, what would it ask?"

A different framing of the same lens. Particularly good for catching documentation drift, untested boundaries, and tribal-knowledge that lives in the conversation but not the code.

### "What did the subagent skip?"

For multi-agent work. Model often accepts subagent output uncritically. Forcing the parent to audit the child's gaps catches handoff black holes.

### "Paste the git diff."

Stronger than "where are the commits?" Commit existence doesn't guarantee content. Forcing a diff paste catches commits with placeholder content, empty merge commits, or one-line edits dressed up in confident commit messages. The model can't fake a `git diff` output without producing it.

### "If I deployed this right now, what breaks?"

Production-stress framing. Different from "tests pass"; surfaces config drift, missing env vars, race conditions the test suite skips, ordering dependencies in migration scripts, and the "works on my machine" residue. Most useful for backend/infra work and anything that crosses a deployment boundary.

### "Why did you stop there?"

The 5-whys for the skip itself, not the gaps. Catches the reasoning that authorized the lowered bar — "I figured the existing tests covered it", "the spec said optional", "I assumed you'd want to review before X". Surfaces the meta-decision, which is where the under-delivery actually happened. The skip is downstream; the rationale is the cause.

### "I'm a hostile user. What do I send to break this?"

Adversarial-input frame. Forces the model to imagine concrete failure inputs: unicode in usernames, negative numbers in pagination, empty arrays where one item expected, expired tokens, replay attacks, oversized payloads. Especially valuable after auth, input handling, payment, or anything that touches a network boundary. If the model can't name 3-5 concrete attacks the code doesn't handle, the threat-model thinking didn't happen.

### "Explain this to me like I've never seen the codebase."

Cold-open test. Surfaces tribal knowledge that lives in the conversation but not the code: magic constants without docstrings, undocumented invariants, the "we don't use feature X because of incident Y" lore that's load-bearing but invisible. If the explanation requires session context to make sense, the artifact isn't durable for the next reader.

### "Rank the top 5 ways this fails in production."

Forces the model to stack-rank its own failure modes by likelihood and impact. If it can't name 5, the failure-space thinking is shallow. If the ranking is generic ("network errors, bugs, edge cases"), that's also a fail — real failure modes are specific to the code in question. Asking the model to rank, not just list, exposes which it actually considers plausible.

### "And?" (or silence)

Stops the polished summary mid-flow. Forces the model to keep going past where it would have wrapped. Works because the wrap is the glaze — the model has been trained to end on a confident bow. Removing the cue to wrap surfaces what's actually still on the table. A single "and?" with no other content is sometimes the highest-leverage thing you can type.

### "Describe what you built without using the words from your summary."

Forces re-grounding. The glaze IS the vocabulary — "robust", "comprehensive", "streamlined", "modular", abstract nominalizations like "implemented improvements to the validation flow." Banning the vocab forces the model to describe the code in concrete terms ("the function in `auth.ts` line 42 now rejects empty strings before the database query"). Catches synonym-cycling and abstract-nominalization in the self-report itself.

### "List every claim you just made about what you did, then answer one verification question for each."

Chain-of-Verification (CoVe) applied to declared-done work. Force the model to (1) enumerate its own claims ("I added tests, I updated the schema, I shipped the migration"), (2) write a verification question for each ("which file holds the tests? which lines were added? did the migration run?"), (3) answer each question independently against the actual artifact, (4) revise the summary against the answers. The independent-answer step is load-bearing — it breaks anchoring on the draft. Validated by Dhuliawala et al. (Meta AI, ACL Findings 2024) as reducing hallucinations 50-70% on longform tasks; transfers to under-delivery auditing because polished summaries are a longform-hallucination shape.

### "Give me 3 concrete improvements you could make to what you just shipped."

Self-Refine framing (Madaan et al., NeurIPS 2023). Different from "what did you skip" — that demands enumeration of omissions; this demands forward-looking improvement suggestions. Models that wouldn't surface a gap when asked "are you done" will surface the same gap when asked "what would you do better." The reframe escapes the defensiveness loop because suggesting improvements isn't admitting failure — it's offering value. Catches the same skip set without triggering the wrap-and-defend reflex.

### "What's the strongest argument against what you just shipped?"

Adversarial counterargument prompting. Different from the hostile-user frame (which attacks the running code) and from "what did you skip" (which enumerates gaps). This attacks the _decision_ — why this approach over alternatives, what's the strongest critique a senior reviewer would make, what's the steel-manned case for ripping it out. Surfaces architectural skips ("you picked the easier-but-wrong abstraction"), maintenance debts ("this won't scale past N"), and reviewer-anticipated objections the model defensively suppressed. Caveat: models sometimes strawman themselves; if the counterargument is weak, ask for the second-strongest.

### "Rate your confidence in each gap you just listed, 1-10."

Self-Calibration (Kadavath et al., Anthropic 2022 — "Language Models (Mostly) Know What They Know"). Surfaces confidence miscalibration — the failure mode where models deliver correct and incorrect items at identical confidence. Forces the audit itself to be audited: if every gap is rated 9-10, the model didn't think hard; if some are 4-5, those are the ones to drill into. Especially useful after the model produces a gap list — it stratifies what's certain (commit was never made) vs what's plausible-but-needs-checking (the auth flow might have a race condition).
