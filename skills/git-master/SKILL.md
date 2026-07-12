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
Agent(subagent_type="git-master", model="sonnet", prompt="<git task>")
```

## Capabilities

- Atomic commits with conventional format
- Interactive rebasing
- Branch management
- History cleanup
- Style detection from repo history
