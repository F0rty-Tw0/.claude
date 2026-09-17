---
name: zoom-out
description: Tell the agent to zoom out and give broader context or a higher-level perspective. Use when you're unfamiliar with a section of code or need to understand how it fits into the bigger picture.
disable-model-invocation: true
---

I don't know this area of code well. Go up a layer of abstraction. Give me a map of all the relevant modules and callers, using the project's domain glossary vocabulary.

Calibrate the radius: stop at the callers and modules that actually change the answer. If the immediate file already explains the behavior, say that instead of padding the map — widen only as far as needed to surface a caller, constraint, or convention the local read didn't show.
