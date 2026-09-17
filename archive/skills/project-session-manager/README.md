# Project Session Manager (PSM)

Automates isolated development environments using git worktrees and tmux sessions, so PR reviews, issue fixes, and feature branches can run in parallel without stepping on each other. A lighter `teleport` command is included for worktree-only creation when a full tmux session isn't needed.

> **Warning:** This skill is tmux-based (terminal multiplexer for running multiple sessions in one window) and non-functional on Windows hosts without WSL (Windows Subsystem for Linux).

## What It Does

| Command | Purpose |
| --- | --- |
| `review <ref>` | Worktree + tmux session for a PR review |
| `fix <ref>` | Worktree + branch for an issue fix |
| `feature <proj> <name>` | Worktree + branch for new feature work |
| `list` / `attach` / `kill` / `cleanup` / `status` | Manage active sessions |
| `teleport` | Worktree only, no tmux, no Claude Code launch |

Supports GitHub (`gh` CLI) by default and Jira (`jira` CLI) via configured aliases. Project shortcuts and defaults live in `~/.psm/projects.json`; active sessions are tracked in `~/.psm/sessions.json`.

---

## When to Use

Trigger when you:
- need to work a PR review, bug fix, and feature branch simultaneously without conflicting local state
- want a disposable, auto-cleaned-up workspace tied to an issue or PR number
- just need a quick isolated worktree with no session management — use `teleport` instead of full PSM
