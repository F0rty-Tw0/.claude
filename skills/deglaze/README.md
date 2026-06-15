# deglaze

Strips the declare-done sycophancy from an LLM's self-report. When you suspect the model stopped short — shipped a plan instead of an artifact, marked work done by lowering the bar, or polished a summary that hid the gaps — `deglaze` forces an honest self-audit and a concrete offer to actually finish.

Core principle: the technique only works because the under-delivery is *real*. It must never be used to manufacture fake gaps or gaslight the model into apologizing for work it actually shipped.

## What It Does

| Piece | Purpose |
| --- | --- |
| **5-step response protocol** | Take the L → honest gap list → name the failure mode → concrete recovery → don't over-promise |
| **Recognition patterns** | 17 shapes of "declare done while skipping the climb" the model scans its own work against |
| **Pressure techniques** | ~25 prompts that surface under-delivery (verb-tense check, "paste the git diff", Chain-of-Verification, confidence rating) |
| **Worked examples** | Annotated bad/good responses across coding, research, frontend, and refactor tasks |

---

## When to Use

Triggers when you:

- Suspect the model bureaucratized a task — a blueprint where an artifact was asked for
- See a polished summary you think hides undelivered scope
- Want a gap analysis of the model's own most recent claimed-complete work
- Type a challenge like "did you do your best", "what did you skip", "are you sure that's done", "stop glazing", or `/deglaze`

Do **not** use it to pad a clean result with invented gaps — if the audit comes up clean, the correct response is evidence-backed pushback.

---

## Files

- `SKILL.md` — overview + the 5-step protocol (the procedure)
- `pressure-techniques.md` — recognition patterns + pressure-technique catalog (the menu)
- `examples.md` — annotated good/bad and multi-domain worked examples

---
