<!-- Proof section for AI-assisted PRs. Paste into the PR body. Every line needs real output, not adjectives. See references/proof.md -->

## Proof

**Blast radius:** <Leaf | Branch | Trunk> <n>/10 — <one-line reason>
**Gate:** <flag name, default OFF, checked at file:line> | <none — why>
**Rollback:** <flag OFF | revert deploy | needs data repair: …>
**Review:** <verdict> — independent reviewer @ <head sha>. Human must deep-read: <file:line ranges | none (Leaf)>

### Tests
```
$ <exact test command>
<pass/fail counts + exit code>
```
- New tests: <what behavior each proves>
- Base check (bug fixes): <test name> FAILS on base: <output line>

### Runtime evidence
```
$ <command that runs the feature for real, non-mocked>
<log excerpt with ids/timestamps>
```

### Visual (UI changes)
<screenshots/recording: normal, empty, error, flag OFF>

### Confidence
**Verified:** <specific behaviors, each backed by an artifact above>
**Not verified:** <what was not checked and why — must not be empty for Trunk>
