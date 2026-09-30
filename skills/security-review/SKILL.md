---
name: security-review
description: Runs a security review (OWASP Top 10, secrets, injection, authn/authz, dependencies) through the security-reviewer agent. Use when the user asks for a security review or audit, or before merging auth, crypto, or payment changes.
---

# Security Review

Dispatch one `security-reviewer` agent (`agents/security-reviewer.md`). It already carries the OWASP checklist, severity ranking, and remediation format, so don't restate them.

```
Agent(subagent_type="security-reviewer",
      prompt="Security review of <scope: diff range, paths, or feature>. Context: <what changed and why, trust boundaries touched>.")
```

- Scope: the user's target, else the current diff (`git diff` against the default branch).
- A very large surface may split into at most 3 reviewers, each over a separate area; one is the default.
- Relay the agent's findings as returned, highest severity first. Don't re-review its work yourself.
