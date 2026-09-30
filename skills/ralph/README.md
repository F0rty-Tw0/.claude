# ralph

A persistence loop that keeps working a task until fresh test and build evidence proves it complete. Progress lives in a checklist file; independent tracks fan out via `dispatching-parallel-agents`; architect review only for high-risk changes.

## When to Use

- User says "ralph", "don't stop", "must complete", or "keep going until done"
- Work spans many iterations and needs to survive compaction or a resumed session

---
