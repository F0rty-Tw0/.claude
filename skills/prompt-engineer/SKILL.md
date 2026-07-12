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

Request step-by-step reasoning -- but check whether the target model already reasons internally first.

```javascript
- Non-reasoning models: ask explicitly to think step by step, provide reasoning structure
- Reasoning models (Claude Fable 5 / Opus 4.x / o-series with extended thinking): do NOT force a visible
  "think step by step" preamble -- the model already reasons in a separate thinking block. Forcing prose CoT
  on top of it wastes tokens and can shorten the model's own reasoning.
- For reasoning models, instead: state the goal and constraints clearly, give it room (don't cap output
  tokens tight), and let extended thinking do the step-by-step work. Set an explicit thinking token budget
  when the API/SDK exposes one, and raise it for harder problems.
- Parse reasoning separately from answer either way -- thinking blocks are structurally separate from the
  final response, prose CoT is not.
- Use for debugging model failures: read the thinking block/CoT trace, not just the final answer.
```

### Claude-Specific Patterns (4.5/5-era)

- **Structured output via tool-forcing**: for machine-parsed output, define a tool with the exact JSON schema
  and force it (`tool_choice: {"type": "tool", "name": "..."}` or the SDK's forced-tool-use option) instead of
  asking for JSON in prose. Forced tool-use is schema-validated and doesn't drift under paraphrase; prose "return
  JSON" instructions do.
- **Prefilling**: seed the start of the assistant turn (e.g. `{` for JSON, or a fixed opening line) to skip
  preamble and lock the output format. Not compatible with extended thinking turned on for that turn -- prefill
  only on non-thinking calls, or prefill after the thinking block completes.
- **Extended thinking**: when thinking is enabled, `temperature` is fixed by the API (not freely tunable) and
  prefill of the final text is restricted -- budget thinking tokens instead of fighting temperature for
  determinism. Use interleaved thinking (reasoning between tool calls, not just before the first one) for
  multi-step agentic prompts.

## Anti-Patterns

### ❌ Vague Instructions

Imprecise language leads to unpredictable outputs. Be explicit about format, tone, and constraints.

### ❌ Kitchen Sink Prompt

Cramming irrelevant context wastes tokens and confuses the model. Curate context ruthlessly.

### ❌ No Negative Instructions

Only saying what to do, without saying what NOT to do, leaves room for unwanted behavior.

## ⚠️ Sharp Edges

| Issue                                           | Severity | Solution                                                    |
| ----------------------------------------------- | -------- | ----------------------------------------------------------- |
| Using imprecise language in prompts             | high     | Be explicit about format, constraints, and expected output  |
| Expecting specific format without specifying it | high     | Specify format explicitly with examples                     |
| Only saying what to do, not what to avoid       | medium   | Include explicit constraints and negative instructions      |
| Changing prompts without measuring impact       | medium   | Systematic evaluation with before/after comparison          |
| Including irrelevant context 'just in case'     | medium   | Curate context to only include relevant information         |
| Biased or unrepresentative examples             | medium   | Diverse, representative examples covering edge cases        |
| Using default temperature for all tasks         | medium   | Task-appropriate temperature (0 for factual, 0.7+ for creative); fixed when extended thinking is on |
| Not considering prompt injection in user input  | high     | Defend against injection with input validation and delimiters |
| Prompting for JSON in prose instead of forcing a tool | medium | Use tool-forcing with a JSON-schema tool for structured output |
| Forcing "think step by step" on a reasoning model | medium | Let extended thinking reason internally; don't stack prose CoT on top |

## Related Skills

Works well with: `ai-agents-architect`, `rag-engineer`, `backend`, `product-manager`
