# Finishing a Development Branch

Guide completion of development work by verifying tests, presenting structured options, and handling the chosen workflow. Verify tests, present options, execute choice, clean up.

## What It Does

Follows a structured completion process:

1. **Verify tests pass** (stop if they fail - cannot proceed)
2. **Determine base branch** (main/master)
3. **Present exactly 4 options:**
   - Merge back to base branch locally
   - Push and create a Pull Request
   - Keep the branch as-is
   - Discard this work
4. **Execute the chosen option** with appropriate steps
5. **Cleanup worktree** (only for merge and discard options)

| Option       | Merge | Push | Keep Worktree | Cleanup Branch |
| ------------ | ----- | ---- | ------------- | -------------- |
| 1. Merge     | Yes   | -    | -             | Yes            |
| 2. Create PR | -     | Yes  | Yes           | -              |
| 3. Keep      | -     | -    | Yes           | -              |
| 4. Discard   | -     | -    | -             | Yes (force)    |

---

## When to Use

Triggers when you:

- Complete implementation with all tests passing
- Need to decide how to integrate finished work
- Are called by subagent-driven-development or plans-executing after all tasks complete

---
