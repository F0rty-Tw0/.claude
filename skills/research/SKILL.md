---
name: research
description: Use when a research goal or question needs to be decomposed into parallel investigations run by multiple agents, when comprehensive multi-angle analysis of a codebase or topic requires cross-validated findings, or when the user wants fully autonomous multi-stage investigation (AUTO mode) that ends in a synthesized report.
argument-hint: <research goal>
---

# Research Skill

Orchestrate parallel scientist agents for comprehensive research workflows with optional AUTO mode for fully autonomous
execution.

## Overview

Research is a multi-stage workflow that decomposes complex research goals into parallel investigations:

1. **Decomposition** - Break research goal into independent stages/hypotheses
2. **Execution** - Investigate small stages directly; run scientist agents in parallel only on sizeable, independent stages
3. **Verification** - Cross-validate findings, check consistency
4. **Synthesis** - Aggregate results into comprehensive report

Heavy reference material (tag-extraction regex patterns, the full report template, figure protocol) lives in
`references/extraction-and-templates.md` and is loaded only when actually extracting findings or generating a report.

## Usage Examples

```
research <goal>                    # Standard research with user checkpoints
research AUTO: <goal>              # Fully autonomous until complete
research status                    # Check current research session status
research resume                    # Resume interrupted research session
research list                      # List all research sessions
research report <session-id>       # Generate report for session
```

### Quick Examples

```
research What are the performance characteristics of different sorting algorithms?
research AUTO: Analyze authentication patterns in this codebase
research How does the error handling work across the API layer?
```

## Research Protocol

### Stage Decomposition Pattern

When given a research goal, decompose it into as many independent stages as it genuinely has. LOW-tier stages
(enumerating files, counting usages, single lookups) you do yourself; only MEDIUM/HIGH stages go to scientist agents:

```markdown
## Research Decomposition

**Goal:** <original research goal>

### Stage 1: <stage-name>

- **Focus:** What this stage investigates
- **Hypothesis:** Expected finding (if applicable)
- **Scope:** Files/areas to examine
- **Tier:** LOW | MEDIUM | HIGH

### Stage 2: <stage-name>

...
```

### Parallel Scientist Invocation

Fire independent stages in parallel via the Agent tool:

```
// Sizeable, independent stages only - all in one message
Agent(subagent_type="scientist", prompt="[RESEARCH_STAGE:2] Analyze...")
Agent(subagent_type="scientist", prompt="[RESEARCH_STAGE:3] Deep analysis of...")
```

### Model Routing

`scientist` runs on the model its agent frontmatter sets. Override `model` only for an exceptionally hard stage.

### Routing Decision Guide

| Research Task               | Tier   | Example Prompt                                         |
| ---------------------------- | ------ | -------------------------------------------------------- |
| "Count occurrences of X"    | LOW    | "Count all usages of useState hook"                    |
| "Find all files matching Y" | LOW    | "List all test files in the project"                   |
| "Analyze pattern Z"         | MEDIUM | "Analyze error handling patterns in API routes"        |
| "Document how W works"      | MEDIUM | "Document the authentication flow"                     |
| "Explain why X happens"     | HIGH   | "Explain why race conditions occur in the cache layer" |
| "Compare approaches A vs B" | HIGH   | "Compare Redux vs Context for state management here"   |

### Verification Loop

After the stages report, cross-check their findings yourself while synthesizing (contradictions between stages,
missing connections, gaps in coverage, evidence quality) and mark the result `[VERIFIED]` or `[CONFLICTS:<list>]`.
Don't spawn a separate agent to re-check findings you are already reading.

**On `[CONFLICTS]`:** re-run only the conflicting stages once with sharper scope. If they still disagree, report both findings with their evidence and let the user adjudicate -- never silently pick one or loop.

## AUTO Mode

AUTO mode runs the complete research workflow autonomously with loop control.

### Promise Tags

| Tag                           | Meaning                        | When to Use                                      |
| ------------------------------ | ------------------------------- | -------------------------------------------------- |
| `[PROMISE:RESEARCH_COMPLETE]` | Research finished successfully | All stages done, verified, report generated      |
| `[PROMISE:RESEARCH_BLOCKED]`  | Cannot proceed                 | Missing data, access issues, circular dependency |

### AUTO Mode Rules

1. **Max Iterations:** 10 (configurable)
2. **Continue until:** Promise tag emitted OR max iterations
3. **State tracking:** Persist after each stage completion
4. **No-progress stop:** if two consecutive iterations complete zero new stages, emit `[PROMISE:RESEARCH_BLOCKED]` naming the stuck stage -- do not burn the remaining iterations.
5. **Cancellation:** `cancel` or "stop", "cancel"

### AUTO Mode Example

```
research AUTO: Comprehensive security analysis of the authentication system

[Decomposition]
- Stage 1 (LOW): Enumerate auth-related files
- Stage 2 (MEDIUM): Analyze token handling
- Stage 3 (MEDIUM): Review session management
- Stage 4 (HIGH): Identify vulnerability patterns
- Stage 5 (MEDIUM): Document security controls

[Execution - Parallel]
Firing stages 1-3 in parallel...
Firing stages 4-5 after dependencies complete...

[Verification]
Cross-validating findings...

[Synthesis]
Generating report...

[PROMISE:RESEARCH_COMPLETE]
```

## Parallel Execution Patterns

### Independent Dataset Analysis (Parallel)

When stages analyze different data sources:

```
// All fire simultaneously
Agent(subagent_type="scientist", prompt="[STAGE:1] Analyze src/api/...")
Agent(subagent_type="scientist", prompt="[STAGE:2] Analyze src/utils/...")
Agent(subagent_type="scientist", prompt="[STAGE:3] Analyze src/components/...")
```

### Hypothesis Battery (Parallel)

When testing multiple hypotheses:

```
// Test hypotheses simultaneously
Agent(subagent_type="scientist", prompt="[HYPOTHESIS:A] Test if caching improves...")
Agent(subagent_type="scientist", prompt="[HYPOTHESIS:B] Test if batching reduces...")
Agent(subagent_type="scientist", prompt="[HYPOTHESIS:C] Test if lazy loading helps...")
```

### Concurrency Limit

**Cap concurrent scientists at `maxConcurrentScientists`** (default 5; hard ceiling 20) to prevent resource exhaustion.

If stages exceed the cap, batch them:

```
Batch 1: Stages 1-5 (parallel)
[wait for completion]
Batch 2: Stages 6-7 (parallel)
```

## Session Management

### Directory Structure

```
.claude/local/research/{session-id}/
  state.json              # Session state and progress
  stages/
    stage-1.md            # Stage 1 findings
    stage-2.md            # Stage 2 findings
    ...
  findings/
    raw/                  # Raw findings from scientists
    verified/             # Post-verification findings
  figures/
    figure-1.png          # Generated visualizations
    ...
  report.md               # Final synthesized report
```

### State File Format

```json
{
  "id": "research-20240115-abc123",
  "goal": "Original research goal",
  "status": "in_progress | complete | blocked | cancelled",
  "mode": "standard | auto",
  "iteration": 3,
  "maxIterations": 10,
  "stages": [
    {
      "id": 1,
      "name": "Stage name",
      "tier": "LOW | MEDIUM | HIGH",
      "status": "pending | running | complete | failed",
      "startedAt": "ISO timestamp",
      "completedAt": "ISO timestamp",
      "findingsFile": "stages/stage-1.md"
    }
  ],
  "verification": {
    "status": "pending | passed | failed",
    "conflicts": [],
    "completedAt": "ISO timestamp"
  },
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp"
}
```

### Session Commands

| Command                        | Action                                   |
| -------------------------------- | ------------------------------------------ |
| `research status`              | Show current session progress            |
| `research resume`              | Resume most recent interrupted session   |
| `research resume <session-id>` | Resume specific session                  |
| `research list`                | List all sessions with status            |
| `research report <session-id>` | Generate/regenerate report               |
| `research cancel`              | Cancel current session (preserves state) |

## Tag Extraction and Report Generation

Scientists report findings via `[FINDING]`/`[EVIDENCE]`/`[CONFIDENCE]` tags, and the final report follows a fixed
template with a figure-embedding protocol. The full tag grammar, extraction regexes, quality-validation checklist,
and report/figure templates are in `references/extraction-and-templates.md` - load that file when parsing scientist
output or assembling `report.md`.

## Configuration

Optional settings in `.claude/settings.json`:

```json
{
  "research": {
    "maxIterations": 10,
    "maxConcurrentScientists": 5,
    "defaultTier": "MEDIUM",
    "autoVerify": true,
    "generateFigures": true,
    "evidenceContextLines": 5
  }
}
```

## Cancellation

```
cancel
```

Or say: "stop research", "cancel research", "abort"

Progress is preserved in `.claude/local/research/{session-id}/` for resume.

## Troubleshooting

**Stuck in verification loop?**

- Check for conflicting findings between stages
- Review state.json for specific conflicts
- May need to re-run specific stages with different approach

**Scientists returning low-quality findings?**

- Check tier assignment - complex analysis needs HIGH tier
- Ensure prompts include clear scope and expected output format
- Review if research goal is too broad

**AUTO mode exhausted iterations?**

- Review state to see where it's stuck
- Check if goal is achievable with available data
- Consider breaking into smaller research sessions

**Missing figures in report?**

- Verify figures/ directory exists
- Check [FIGURE:] tags in findings
- Ensure paths are relative to session directory
