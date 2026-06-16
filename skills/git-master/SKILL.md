---
name: git-master
description: Git expert for atomic commits, rebasing, and history management
version: 1.0.0
---

# Git Master Command

Routes to the git-master agent for git operations.

## Usage

```
git-master <git task>
```

## Routing

```
Task(subagent_type="git-master", model="sonnet", prompt="{{ARGUMENTS}}")
```

## Capabilities

- Atomic commits with conventional format
- Interactive rebasing
- Branch management
- History cleanup
- Style detection from repo history

Task: {{ARGUMENTS}}
