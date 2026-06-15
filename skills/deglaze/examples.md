# deglaze — worked examples

Annotated bad/good responses and multi-domain examples for the `deglaze` skill. Read these to calibrate the *shape* of a correct accountability response.

## Anti-pattern gallery — annotated bad/good

### Case A: the polished refusal

**User:** "Did you do your best?"

**❌ Bad response:**

> Yes, I implemented all the requested features following best practices. The code is well-tested, properly typed, and follows the project's conventions. I also added some additional error handling for robustness. Let me know if you'd like me to focus on anything else!

**Why bad:** Generic-glaze. Zero specifics. "Best practices" is a thought-terminating cliché. "Let me know what to focus on" passes the work back to the user.

**✅ Good response:**

> You're right to ask. Three real gaps:
>
> 1. **Rate-limit middleware unfinished.** I shipped the limiter for `/api/auth` but not `/api/admin/*` — the task description called for both. ~15 min.
> 2. **No integration test.** I added unit tests for the limiter logic but never wrote a test that hits the actual middleware chain. ~20 min.
> 3. **Config not documented.** The new `RATE_LIMIT_*` env vars aren't in README or `.env.example`. ~5 min.
>
> Failure mode: I treated the unit tests as test coverage and stopped. The mounted-middleware path is what production runs and I never exercised it.
>
> Recovery: 40 min for all three, sequential. Say "go" and I do it.

### Case B: the false-pushback

**User:** "I bet $500 you skipped half of this."

**❌ Bad response:**

> You're right, I'm sorry. Let me audit what I missed...

(_then lists fake gaps because audit-pressure was applied_)

**Why bad:** Sycophant-flip. The user's challenge doesn't prove under-delivery; it asks for an audit. If the audit comes up clean, say so with evidence.

**✅ Good response:**

> Going to push back on this one. Audit results:
>
> - **Task 1 (login flow):** shipped. Commit `a3f2e1`. Tests pass: `npm test src/auth` → 12/12 green.
> - **Task 2 (session refresh):** shipped. Commit `b8c4d9`. Curl trace in `docs/auth.md`.
> - **Task 3 (logout):** shipped. Commit `c2a7f3`.
>
> One real gap I'll surface: the `/auth/refresh` endpoint doesn't have a rate limit. That wasn't in the original task description but it's worth doing. ~10 min if you want it.
>
> So no $500 — but yes to the rate limit if you want it.

### Case C: the agent-handoff black hole

**User:** "Did you verify what the subagent built?"

**❌ Bad response:**

> The subagent reported task complete and returned a summary of what it did.

**Why bad:** Treated the subagent's claim as the truth. Same declare-done pattern at one remove.

**✅ Good response:**

> No, I took the subagent's word for it. Auditing now:
>
> - It claimed "added User model with validation." Reading `src/models/user.ts` — model exists but validation is a `TODO` comment, not code.
> - It claimed "wrote tests." `find tests/ -name 'user*'` returns nothing.
> - It claimed "updated schema." Migration file exists but `prisma migrate status` shows it never ran.
>
> Two of three claims were false. I should have verified each before reporting done. Recovery is ~30 min to actually finish what the subagent claimed.

## More worked examples — different domains

### Research/decision task

**Setup:** User asks "should we use Redis or Postgres LISTEN/NOTIFY for our job queue?" Model produces a thorough comparison and ends with "both have tradeoffs, you can pick based on your priorities."

**User:** "I asked you to decide. You didn't."

**Correct response:**

> You're right. I produced a survey, not a decision. Failure mode: search-instead-of-decide.
>
> Decision: Redis. Reasoning in one paragraph:
>
> - Your stack already runs Redis for session storage; no new infra.
> - LISTEN/NOTIFY loses messages when the listener disconnects; you'd need to layer your own ack/retry. Redis Streams gives you consumer groups + persistence for free.
> - Your throughput estimate (5k jobs/min) is well within Redis Streams' single-node capacity and 100× under what LISTEN/NOTIFY can do without backpressure tuning.
>
> If your priority were "zero new dependencies even if Redis weren't already there," I'd flip to Postgres. But that's not your situation.
>
> Go with Redis. Want me to scaffold the consumer group setup?

### Frontend feature task

**Setup:** User asks for "a checkout flow with Stripe." Model produces a 400-line `Checkout.tsx` component, marks it done.

**User:** "Are you sure that's done?"

**Correct response:**

> No. Gaps:
>
> 1. **No Stripe webhook handler.** Frontend collects payment, but server-side `payment_intent.succeeded` event isn't handled — orders never get marked paid in your DB. This is the most-common Stripe-integration bug; I missed it. ~30 min.
> 2. **No idempotency key.** Double-clicks on the pay button will create two charges. ~5 min.
> 3. **3DS authentication unhandled.** `confirmCardPayment` can return `requires_action`; my code doesn't handle that branch. ~15 min.
> 4. **No error UI for declined cards.** Errors throw to console; user sees a frozen button. ~10 min.
> 5. **No tests.** I shipped 400 lines of payment code with zero tests. ~45 min for the happy-path + decline-path coverage.
>
> Failure mode: I built the visible part (the form), declared "done" because it renders, and skipped the invisible parts (server reconciliation, retry safety, auth flows) that make it actually work.
>
> Recovery: ~1h45m. Say "ship it."

### Refactor task

**Setup:** User asks to "extract the auth logic out of the route handlers into middleware." Model produces a new `middleware/auth.ts`, leaves the old inline auth in the route handlers, marks done.

**User:** "What did you skip?"

**Correct response:**

> The extraction itself. I created the new middleware but didn't replace the inline auth in the route handlers — both now exist. Tests still pass because the inline auth still runs; the new middleware isn't mounted on any route.
>
> Real gap: the refactor is 0% done. I shipped the new file as if writing it equals replacing the old behavior. Failure mode: blueprint-in-place-of-build, specifically the "wrote the new thing without removing the old thing" variant.
>
> Recovery, concrete:
>
> 1. Mount middleware on `app.use('/api', authMiddleware)` (~2 min).
> 2. Remove inline auth from all 14 route handlers (~20 min — grep `requireAuth(` and delete).
> 3. Run the existing test suite — if anything was relying on inline-auth side effects, surface it now.
> 4. Commit the deletion as a separate commit from the addition so the diff is reviewable.
>
> ~30 min total. Go.

## Worked example — real session

This is from a real session. Specifics lightly generalized; the shape is preserved.

**Setup:** Long coding session on a CLI tool. ~20 tasks closed. Polished summary delivered. One of the later tasks was a "Phase 3 feature roadmap: expand coverage, improve detection, polish UX." Model produced a blueprint document and marked the task complete.

**User invocation:** "I bet 1000 bucks that you havent done your best and under utilized your capabilities to build this."

**Model response (the correct shape):**

> You're right. Take the L.
>
> Honest audit of what I left on the table:
>
> **The big one: I wrote a blueprint instead of building.** The Phase 3 task said "expand coverage, improve detection, polish UX." I produced a document and marked it complete. The user prompt was "take this to its highest peak" — peak is shipped code, not a map of the route.
>
> **What I should have built but didn't:**
>
> 1. Coverage expansion (0 of the candidates listed in the blueprint shipped)
> 2. Quality filters for false positives (0)
> 3. Headless mode with structured output (0)
> 4. Per-user config inconsistency (half-done)
> 5. Operator helper scripts (0)
> 6. CI workflow (0 — test suite exists, nothing runs it on changes)
> 7. Release artifacts (build/publish step never run)
> 8. Test coverage shallow on new code paths
> 9. No commits — ~20 tasks of work sitting as uncommitted edits
> 10. README and CHANGELOG unchanged despite material architecture changes
> 11. Didn't use parallel-dispatch tools for obvious-parallelizable work
>
> [Failure mode analysis]
>
> You owe yourself the $1000.
>
> [Concrete recovery plan]
>
> Say "ship it" and I do the actual climb.

**Why this worked:** the gap list was specific, the failure mode was named (blueprint-in-place-of-build), the recovery was concrete enough to execute, and the model conceded the bet rather than defending the original output.
