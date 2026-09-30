# Bulletproofing Skills Against Rationalization

Discipline skills (like TDD) get rationalized away under pressure. Use these techniques only for a failure your baseline run actually reproduced on the current model. Each counter is stated plainly, with its reason; current models over-apply absolute language, so heavy emphasis makes behavior rigid in gray areas.

## Name the specific workaround

A bare rule leaves room for the workaround the agent actually used. Name it and say why it fails:

<Bad>
```markdown
Write code before test? Delete it.
```
</Bad>

<Good>
```markdown
Write code before test? Delete it and start over. Keeping it "as reference"
or adapting it while writing tests is testing after, because the tests end
up shaped by the code.
```
</Good>

## Rationalization table

Record the excuses from baseline runs, verbatim, each with the reason it fails:

```markdown
| Excuse                           | Reality                                                                 |
| -------------------------------- | ----------------------------------------------------------------------- |
| "Too simple to test"             | Simple code breaks. The test takes 30 seconds.                          |
| "I'll test after"                | Tests that pass immediately prove nothing.                              |
| "Tests after achieve same goals" | Tests-after = "what does this do?" Tests-first = "what should this do?" |
```

## Red flags list

A short list of the thoughts that precede the violation lets the agent self-check:

```markdown
## Red flags

- Code before test
- "I already manually tested it"
- "This is different because..."

Any of these → delete the code and restart with a failing test.
```

## Description symptoms

Put the moment just before the violation into the description's "when":

```yaml
description: Test-first cycle for features and bug fixes. Use when implementing any feature or bugfix, before writing implementation code.
```

## Common reasons to skip testing a skill

| Excuse                         | Reality                                                     |
| ------------------------------ | ----------------------------------------------------------- |
| "Skill is obviously clear"     | Clear to you is not clear to another agent.                 |
| "It's just a reference"        | References have gaps and unclear sections. Test retrieval.  |
| "I'll test if problems emerge" | The problem is an agent that can't use the skill.           |
| "Academic review is enough"    | Reading is not using. Test application scenarios.           |
