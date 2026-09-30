---
name: prompt-engineer
description: Prompt design for LLM apps and for agent and skill instructions, aligned with current Claude prompting guides. Use when writing or reviewing system prompts, skill or agent prompts, few-shot examples, or output-format specs.
---

# Prompt Engineer

Current guidance lives in Anthropic's docs; read the relevant one instead of working from memory:

- General: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- Opus 5.5 specifics (effort calibration, early stops in unattended runs, multi-agent, frontend defaults, pasted text): https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5
- API parameters (thinking, effort, tool choice, caching, model ids): skill:claude-api

## Rules that matter most

1. Assume the model is capable. Add only context it lacks; cut definitions and motivational prose.
2. Normal volume. Capitals, "CRITICAL", "MUST", and "no exceptions" cause over-triggering on current models.
3. Give the reason with each instruction. One "because X" generalizes better than a list of cases.
4. Show one example of the target output instead of a list of don'ts.
5. Don't ask for written-out reasoning or "think step by step"; effort and thinking settings control that, and requests to put reasoning in the response can be refused.
6. Don't add "double-check" or verifier steps; current models self-verify. Keep only real evidence gates.
7. Replace blanket defaults ("be thorough", "always use X") with the specific condition that should trigger the behavior.
8. For unattended loops, name the bad stops (announcing a next step without doing it, offering to continue) and the good ones (blocked on the user or a protected resource).
9. Keep output specs short. Long mandatory templates inflate every response.
10. Give a default, not a menu. One line on scope ("deliver what was asked; mention a better approach in a sentence") beats paragraphs.

Skill frontmatter and testing: skill:skills-creating.
