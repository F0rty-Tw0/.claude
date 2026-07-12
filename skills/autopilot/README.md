# autopilot

Thin router / alias. Autopilot no longer hand-rolls its own lifecycle -- it routes end-to-end autonomous requests to `flow` in autonomous mode (`flow --auto`), which drives idea -> plan -> execute -> QA -> review -> verify -> finish via the native Workflow tool. Its old phase gates are already covered 1:1 by flow's Stage Gates, so nothing is duplicated.

## When to Use

- End-to-end autonomous execution from an idea to working code
- User says "autopilot", "auto pilot", "autonomous", "build me", "create me", "make me", "full auto", "handle it all", or "I want a/an..."
- Task requires multiple phases: planning, coding, testing, and validation
- User wants hands-off execution and is willing to let the system run to completion

---
