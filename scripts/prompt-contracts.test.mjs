// Run: node --test scripts/prompt-contracts.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const VERDICT_LINE = 'VERDICT: APPROVE | CHANGES | BLOCK';

describe('2.1 reviewer VERDICT first line', () => {
  for (const name of ['code-reviewer', 'quality-reviewer', 'security-reviewer', 'performance-reviewer']) {
    it(`agents/${name}.md demands the VERDICT line first`, () => {
      assert.ok(read(`agents/${name}.md`).includes(VERDICT_LINE));
      assert.match(read(`agents/${name}.md`), /Repro:/);
    });
  }
  it('code-review reviewer prompt demands it before the 7 sections', () => {
    assert.ok(read('skills/code-review/references/reviewer-prompt.md').includes(VERDICT_LINE));
    assert.match(read('skills/code-review/references/reviewer-prompt.md'), /Repro:.*BLOCK-KIND: proof|BLOCK-KIND: proof.*Repro:/s);
  });
  it('SDD spec reviewer prompt demands it', () => {
    assert.ok(read('skills/subagent-driven-development/spec-reviewer-prompt.md').includes(VERDICT_LINE));
  });
  it('critic keeps its own vocabulary', () => {
    const critic = read('agents/critic.md');
    assert.ok(critic.includes('OKAY-WITH-EDITS'));
    assert.ok(!critic.includes('VERDICT: APPROVE'));
  });
});

describe('2.2 long reports go to the scratchpad', () => {
  const agents = read('AGENTS.md');
  it('AGENTS.md carries the path contract and its fallback', () => {
    assert.ok(agents.includes('$CLAUDE_SCRATCHPAD/reports/<agent>-<slug>.md'));
    assert.ok(agents.includes('/tmp/claude-reports/'));
  });
  it('AGENTS.md drops the old overflow rules', () => {
    assert.ok(!agents.includes('No report files'));
    assert.ok(!agents.includes('SendMessage parts'));
  });
  it('CLAUDE.md tells the caller what a path reply means', () => {
    assert.ok(read('CLAUDE.md').includes('reports/<agent>-<slug>.md'));
  });
  it('code-review reviewer prompt passes the scratchpad dir', () => {
    const prompt = read('skills/code-review/references/reviewer-prompt.md');
    assert.ok(prompt.includes('{SCRATCHPAD_DIR}'));
    assert.ok(prompt.includes('reports/code-reviewer-'));
  });
  it('no agent report file sits in the repo root or reports/', () => {
    const stray = /^(code-reviewer|quality-reviewer|security-reviewer|performance-reviewer|critic|architect|debugger)-.+\.md$|\.report\.md$/;
    const dirs = ['.', 'reports'].filter((d) => existsSync(join(ROOT, d)));
    const hits = dirs.flatMap((d) => readdirSync(join(ROOT, d)).filter((f) => stray.test(f)));
    assert.deepEqual(hits, []);
  });
});

describe('2.3 worktree-safe briefs', () => {
  const RULE = 'Your cwd is the worktree; use paths relative to it';
  it('CLAUDE.md and the parallel-dispatch skill state the rule', () => {
    assert.ok(read('CLAUDE.md').includes(RULE));
    assert.ok(read('skills/dispatching-parallel-agents/SKILL.md').includes(RULE));
  });
  it('implementer prompt no longer hands out a bare directory', () => {
    const prompt = read('skills/subagent-driven-development/implementer-prompt.md');
    assert.ok(!prompt.includes('Work from: [directory]'));
    assert.ok(prompt.includes('use paths relative to it'));
  });
  for (const name of ['executor', 'deep-executor']) {
    it(`agents/${name}.md knows the isolated-worktree error`, () => {
      assert.match(read(`agents/${name}.md`), /isolated in the worktree/);
    });
  }
  it('no prompt template carries an absolute Repo: line', () => {
    const files = ['skills/subagent-driven-development/implementer-prompt.md', 'skills/dispatching-parallel-agents/SKILL.md', 'skills/code-review/references/reviewer-prompt.md'];
    for (const f of files) assert.doesNotMatch(read(f), /^\s*Repo:\s*(\/|[A-Za-z]:)/m);
  });
});

describe('2.4 subagent time budget', () => {
  it('CLAUDE.md states the budget and the 2x stop', () => {
    const claude = read('CLAUDE.md');
    assert.match(claude, /Expected: N min/);
    assert.match(claude, /2×.*TaskStop|TaskStop.*2×/s);
    assert.match(claude, /restarts.*assignment/s);
  });
  it('SDD loop dispatches with a budget and stops at 2x', () => {
    const sdd = read('skills/subagent-driven-development/SKILL.md');
    assert.match(sdd, /Expected: <N> min/);
    assert.match(sdd, /2×/);
  });
  it('implementer prompt carries the line', () => {
    assert.match(read('skills/subagent-driven-development/implementer-prompt.md'), /Expected: \[N\] minutes/);
  });
  it('parallel dispatch and reviewer prompts carry it', () => {
    assert.match(read('skills/dispatching-parallel-agents/SKILL.md'), /Expected: N min/);
    assert.match(read('skills/code-review/references/reviewer-prompt.md'), /Expected: \{EXPECTED_MIN\} min/);
  });
});
