# Prompt Engineer

Translate intent into instructions that LLMs follow with the same rigor as code. Systematic evaluation over intuition - small changes have big effects.

## What It Does

Covers prompt design and optimization across key patterns:

| Pattern                  | Description                                                  |
| ------------------------ | ------------------------------------------------------------ |
| **Structured System Prompt** | Role, Context, Instructions, Constraints, Output format, Examples |
| **Few-Shot Examples**    | 2-5 diverse examples including edge cases                    |
| **Chain-of-Thought**     | Step-by-step reasoning with explicit intermediate steps      |

Also addresses anti-patterns: vague instructions, kitchen sink prompts (irrelevant context), and missing negative instructions.

---

## When to Use

Triggers when you:

- Design prompts for LLM-powered applications
- Need to structure system prompts or manage context windows
- Want to add few-shot examples or chain-of-thought reasoning
- Need to evaluate and iterate on prompt quality

---

## Sharp Edges

- Imprecise language leads to unpredictable outputs
- Expecting format without specifying it
- Changing prompts without measuring impact
- Biased or unrepresentative examples
- Not considering prompt injection in user input

---
