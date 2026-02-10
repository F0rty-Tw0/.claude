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

Request step-by-step reasoning

```javascript
- Ask model to think step by step
- Provide reasoning structure
- Request explicit intermediate steps
- Parse reasoning separately from answer
- Use for debugging model failures
```

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
| Using default temperature for all tasks         | medium   | Task-appropriate temperature (0 for factual, 0.7+ for creative) |
| Not considering prompt injection in user input  | high     | Defend against injection with input validation and delimiters |

## Related Skills

Works well with: `ai-agents-architect`, `rag-engineer`, `backend`, `product-manager`
