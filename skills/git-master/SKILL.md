---
name: git-master
description: Use when the user needs git operations handled -- atomic commits, interactive rebasing, branch management, or history cleanup matching the repo's existing commit style.
---

# Git Master Command

Routes to the git-master agent for git operations.

## Usage

```
git-master <git task>
```

## Routing

```
Agent(subagent_type="git-master", prompt="<git task>")
```

## When to Route Here

Route for multi-concern changes (3+ files spanning different concerns), interactive rebases, history archaeology,
or branch cleanup. Skip it and just `git commit` yourself for a single trivial one-file change -- the agent's value
is atomic-split judgment and style detection, which a one-file commit doesn't need.

## Capabilities

- Atomic commits with conventional format
- Interactive rebasing
- Branch management
- History cleanup
- Style detection from repo history
