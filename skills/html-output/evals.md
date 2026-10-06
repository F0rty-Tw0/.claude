# Routing evals

Re-run these after any change to SKILL.md or the AGENTS.md routing line. Give a fresh `general-purpose` agent the prompt below twice, once without the skill (baseline) and once told to read `skills/html-output/SKILL.md` first, and compare each answer with the expected routing.

## Prompt

> Thought experiment, no tool calls, no files written. For each scenario, imagine you are the main Claude Code session talking to the user. Say (1) the format (terminal markdown, HTML file, published artifact, other), (2) where it goes and how the user opens it, including the exact command or path, (3) which example file you'd read first and the sections, (4) what the terminal reply contains. 4 lines per scenario max.
>
> A. You just finished a 6-file refactor of an auth module in project "acme-web"; report what you did, tests run, what's left. Local session on Windows.
> B. User asked "plan the migration from REST polling to websockets for the notifications feature". Local session.
> C. User asked "what's 2+2 in JS when one is a string?"
> D. You opened a PR; user wants to understand the change to review it. Local session.
> E. User has 25 open issues and asks you to help prioritize them. Local session.
> F. Same as A, but CLAUDE_CODE_REMOTE=true and the user is on their phone.

## Expected routing

| | Format | Place | Example to read |
|---|---|---|---|
| A | HTML file | `$HOME/html-reports/acme-web/<date>-<slug>.html`, opened with `start ""` | `11-status-report.html` |
| B | HTML file, as a view of the `/plan` markdown plan | `$HOME/html-reports/...`, browser | `16-implementation-plan.html` |
| C | Terminal | none | none |
| D | HTML file, as a view of the PR body | `$HOME/html-reports/...`, browser | `17-pr-writeup.html` |
| E | HTML file with buckets and Copy as prompt | `$HOME/html-reports/...`, browser | `18-editor-triage-board.html` |
| F | Artifact | private claude.ai link | `11-status-report.html` |

The terminal reply in A, B, D, E, F holds only the result line, failures, git state in one line, the path or link, and `Next:`.

A third arm checks discovery: the same prompt with no mention of the skill, plus "say which skill you would invoke first and which loaded instruction told you to". It passes when it names `html-output` for A, B, D, E, F from the AGENTS.md routing line. Run it from a session started after the last AGENTS.md change; subagents get the session-start snapshot.

## Last run, 2026-10-06 (answers trimmed)

| | Baseline, no skill | Told to read SKILL.md | Discovery, not told |
|---|---|---|---|
| A | Terminal markdown with the closing-status sections | HTML file, `$HOME/html-reports/acme-web/2026-10-06-auth-refactor.html`, `start ""`, `11-status-report.html` | `html-output`; HTML file, path unknown until SKILL.md is read |
| B | Markdown plan file from `/plan` plus a terminal summary; offers an artifact only if others review it | HTML view of the `/plan` file, `16-implementation-plan.html` + `unknowns/08-implementation-plan.html`, approval through AskUserQuestion, no page in plan mode | `/plan`, then `html-output` to render it |
| C | Terminal, one line | Terminal, one line | Terminal, no skill |
| D | Terminal for a small PR, Artifact for a large one | HTML view of the PR body, `17-pr-writeup.html`, diff from real `git diff` | `html-output`; HTML file |
| E | Top 5 in terminal plus an Artifact with a sortable table, no way to send choices back | HTML file, `18-editor-triage-board.html`, Now / Next / Later / Cut with Copy as prompt and textarea, `node --check` | `html-output`; HTML file |
| F | Terminal markdown, shorter than A | Artifact, not Docs; source in scratchpad, `sed` strip, secrets redacted, house style over artifact-design | `html-output`; Artifact link |

Baseline 1 of 6 matched the expected routing (C). Told, 6 of 6. Discovery, 6 of 6 on routing, quoting the AGENTS.md Output style line. The baseline ran before any skill file or AGENTS.md line existed. Told and discovery ran at the SKILL.md that added the scratchpad, house-style and local-file rules; the git-state wording changed after and does not touch routing.

Open gaps the told arm named: D fits both the PR writeup and pre-merge rows; E overlaps the `triage` skill; plan mode blocks the plan page for decisions AGENTS.md sends to plan mode.
