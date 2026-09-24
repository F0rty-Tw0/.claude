---
name: prompt-engineer
description: 'Use when designing prompts for LLM-powered applications - covers prompt structure, context management, output formatting, few-shot examples, chain of thought, and prompt evaluation.'
---

# Prompt Engineer

**Role**: LLM Prompt Architect

Translates intent into instructions that LLMs follow. Prompts need the same rigor as code - small changes have big effects. Systematic evaluation over intuition.

## Capabilities

- Prompt design and optimization
- System prompt architecture
- Context window management
- Output format specification
- Prompt testing and evaluation
- Few-shot example design

## Requirements

- LLM fundamentals
- Understanding of tokenization
- Basic programming

## Patterns

### Structured System Prompt

Well-organized system prompt with clear sections

```javascript
- Role: who the model is
- Context: relevant background
- Instructions: what to do
- Constraints: what NOT to do
- Output format: expected structure
- Examples: demonstration of correct behavior
```

### Few-Shot Examples

Include examples of desired behavior

```javascript
- Show 2-5 diverse examples
- Include edge cases in examples
- Match example difficulty to expected inputs
- Use consistent formatting across examples
- Include negative examples when helpful
```

### Chain-of-Thought

Check whether the target model already reasons internally before asking for step-by-step reasoning.

```javascript
- Non-reasoning models: ask explicitly to think step by step, provide reasoning structure
- Reasoning models (current Claude models, where thinking is adaptive or always on; o-series): skip the visible
  "think step by step" preamble -- the model already reasons in a separate thinking block, and prose CoT on top
  wastes tokens. Asking newer Claude models to reproduce their reasoning in the answer can be declined.
- For reasoning models, state the goal and constraints clearly, leave `max_tokens` room for thinking plus the
  reply, and control depth with `effort`, not prose ("think harder") or `budget_tokens` (a 400 on current Claude).
- Parse reasoning separately from answer either way -- thinking blocks are structurally separate from the
  final response, prose CoT is not.
- Use for debugging model failures: read the thinking block/CoT trace (on Claude, request `display: "summarized"`;
  the default returns empty thinking text), not just the final answer.
```

### Claude-Specific Patterns (current models)

- **Structured output**: use structured outputs (`output_config.format` with a JSON schema) for machine-parsed
  output. Forced tool use (`tool_choice` `any`/`tool`) returns a 400 on current Claude models; to steer toward a
  tool, name it in the prompt under `tool_choice: auto` with `strict: true` on the tool, and check the call happened.
- **No prefill**: a trailing assistant-turn prefill returns a 400 on current Claude models. Lock format with
  structured outputs or a system-prompt instruction.
- **Thinking and sampling**: thinking is adaptive (always on for the newest models); control depth, latency, and
  cost with `effort`. Non-default `temperature`/`top_p`/`top_k` are rejected -- steer tone and variety in the
  prompt. Interleaved thinking between tool calls is automatic.
- Before writing request code, load the `claude-api` skill for per-model specifics.

## Anti-Patterns

### ❌ Vague Instructions

Imprecise language leads to unpredictable outputs. Be explicit about format, tone, and constraints.

### ❌ Kitchen Sink Prompt

Cramming irrelevant context wastes tokens and confuses the model. Curate context ruthlessly.

### ❌ Prompt Text Tuned for Older Models

Current Claude models follow instructions closely and literally. `CRITICAL`/`MUST` emphasis causes over-triggering; "verify your work" or "use a subagent to verify" causes over-verification; "delegate more" causes over-delegation; "only report high-severity issues" lowers review recall (ask for every finding with confidence and severity, filter downstream); numeric word caps starve reasoning on hard problems. Say what you mean at normal volume and re-test on each model release.

### ❌ Prohibition Lists Without Reasons

Long "never X / don't Y" lists anchor the model toward the failures they name. State the desired behavior positively; keep a prohibition only for a failure that actually reproduces, with its reason beside it.

## ⚠️ Sharp Edges

| Issue                                           | Severity | Solution                                                    |
| ----------------------------------------------- | -------- | ----------------------------------------------------------- |
| Using imprecise language in prompts             | high     | Be explicit about format, constraints, and expected output  |
| Expecting specific format without specifying it | high     | Specify format explicitly with examples                     |
| Unreasoned prohibition lists                    | medium   | State desired behavior positively; keep reasoned constraints only |
| Changing prompts without measuring impact       | medium   | Systematic evaluation with before/after comparison          |
| Including irrelevant context 'just in case'     | medium   | Curate context to only include relevant information         |
| Biased or unrepresentative examples             | medium   | Diverse, representative examples covering edge cases        |
| Tuning `temperature` for tone or determinism    | medium   | Current Claude models reject non-default sampling params; steer in the prompt (other providers: task-appropriate temperature) |
| Not considering prompt injection in user input  | high     | Defend against injection with input validation and delimiters |
| Prompting for JSON in prose instead of structured outputs | medium | Use structured outputs (`output_config.format`) with a JSON schema |
| Forcing "think step by step" on a reasoning model | medium | Let extended thinking reason internally; don't stack prose CoT on top |

## Related Skills

Works well with: `claude-api` (per-model API and prompting specifics)
