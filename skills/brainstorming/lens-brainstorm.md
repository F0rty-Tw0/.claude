# Wide Mode: Lens Brainstorm

Parallel fresh agents, one lens each, generate divergent concepts; you synthesize them into the 2-3 approaches of step 6. A single session anchors on its first idea; agents that share no context with you or each other don't.

## 1. Seed

Turn your step 5 note into a seed every agent receives verbatim:

```
SEED
- The idea: <one sentence, the user's words lightly cleaned>
- Underlying need: <one sentence>
- Constraints: <audience, stack, budget/timeline — mark what the user said vs what you assumed>
- Success looks like: <one sentence>
- Out of scope: <bullets>
```

## 2. Lens agents

Pick 3-5 lenses that fit the seed and dispatch them in waves of at most 3 (`general-purpose`, so they can use WebSearch); larger waves hit the session rate limit.

| Lens | Asks |
|---|---|
| Technical | How could this be built? Cheapest viable v0? Which tech choice changes the shape most? |
| User experience | Who reaches for this, at what moment, click by click? What brings them back? |
| Contrarian / pre-mortem | Why won't this work? Who tried and bounced off? What's the boring reason nobody adopts it? |
| Prior art | What already exists? Closest 3-5 alternatives and the gap they all leave? Cite URLs. |
| Lateral | Same problem in another domain? What if the most obvious assumption were removed? |
| First principles | The minimal artifact that delivers the value? What is the user actually buying? |

Prompt for each:

```
You are a fresh thinker with no prior context. Your lens is <LENS>: <its questions>.
Stay in that lens; other agents cover the others. Don't try to cover all bases.

<SEED>

Give 2-3 concepts that would lead to materially different products or strategies,
not variations of one idea. Half-formed is fine. For each:
- Name (3-6 words)
- The bet (1-2 sentences)
- Why it could win (1 sentence)
- Why it could fail (1 sentence, honest)
- Sources (URLs, if you searched)
```

## 3. Gap sweep

One more fresh agent gets the seed plus the deduplicated concepts: "What did they all miss? Which lens did nobody use? Give 2-3 concepts none of these touch, same format."

## 4. Synthesize

Cluster the concepts by theme, then present step 6's 2-3 approaches drawn from the strongest. Add two short lists: where the lenses agreed (usually load-bearing) and where they disagreed (where the open questions live). Cite sources inline.
