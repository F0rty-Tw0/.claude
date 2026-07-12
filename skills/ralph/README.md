# ralph

A persistence loop that keeps working on a task until it is fully complete and architect-verified. Wraps ultrawork's parallel execution with session persistence, automatic retry on failure, and mandatory verification before completion.

## When to Use

- Task requires guaranteed completion with verification, not just "do your best"
- User says "ralph", "don't stop", "must complete", "finish this", or "keep going until done"
- Work may span multiple iterations and needs persistence across retries
- Task benefits from parallel execution with architect sign-off at the end

---
