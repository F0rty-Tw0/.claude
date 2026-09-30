<!-- Full proof bundle for AI-assisted PRs. Every line needs real output, not adjectives. See references/proof.md.
     In a PR body, pr-description (Step 3) puts compact one-line Proof in the body and the rest of this in a collapsed <details> block. -->


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
| | Before | After |
|---|---|---|
| <screen, state> | ![<screen> before](<scratch>/pr-shots/<screen>-before.png) | ![<screen> after](<scratch>/pr-shots/<screen>-after.png) |

States: normal, empty, error, flag OFF. Attach each path with `gh pr create --attach` (references/proof.md, Visual pair).

### Confidence
**Verified:** <specific behaviors, each backed by an artifact above>
**Not verified:** <what was not checked and why — must not be empty for Trunk>
