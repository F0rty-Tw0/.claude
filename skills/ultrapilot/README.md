# Ultrapilot

Parallel autopilot that decomposes a task into independent subtasks, assigns each an exclusive set of files, and runs up to 5 workers simultaneously. Falls back to sequential autopilot when a task isn't cleanly parallelizable.

## When to Use

- Multi-component systems (frontend + backend + database) that can be split along clear file boundaries
- Large refactorings spanning independent modules
- Parallel test or docs generation across unrelated files
- Multi-service architectures where each service can be worked on independently

---
