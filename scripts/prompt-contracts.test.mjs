// Run: node --test scripts/prompt-contracts.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const VERDICT_LINE = 'VERDICT: APPROVE | CHANGES | BLOCK';
const VERDICT_SENTENCE = "The reply's first line is `VERDICT: APPROVE | CHANGES | BLOCK` (keep one word, e.g. `VERDICT: CHANGES`), before any heading.";
const VERDICT_CARRIERS = ['agents/code-reviewer.md', 'agents/quality-reviewer.md', 'agents/security-reviewer.md', 'agents/performance-reviewer.md',
  'skills/code-review/references/reviewer-prompt.md', 'skills/subagent-driven-development/spec-reviewer-prompt.md'];

describe('2.1 reviewer VERDICT first line', () => {
  for (const name of ['code-reviewer', 'quality-reviewer', 'security-reviewer', 'performance-reviewer']) {
    it(`agents/${name}.md demands the VERDICT line first`, () => {
      assert.ok(read(`agents/${name}.md`).includes(VERDICT_LINE));
      assert.match(read(`agents/${name}.md`), /Repro:/);
    });
  }
  for (const name of ['quality-reviewer', 'security-reviewer', 'performance-reviewer']) {
    it(`agents/${name}.md puts the VERDICT sentence above its first heading`, () => {
      const block = read(`agents/${name}.md`).split('<Output_Format>')[1].split('</Output_Format>')[0];
      const heading = block.search(/^\s*#/m);
      const sentence = block.indexOf(VERDICT_SENTENCE);
      assert.ok(sentence >= 0 && heading >= 0 && sentence < heading, `sentence at ${sentence}, heading at ${heading}`);
    });
  }
  for (const file of VERDICT_CARRIERS) {
    it(`${file} states the VERDICT sentence once, verbatim`, () => {
      const text = read(file);
      assert.ok(text.includes(VERDICT_SENTENCE));
      assert.equal(text.split(VERDICT_LINE).length - 1, 1);
      assert.ok(!text.includes('Open the reply with'), 'a paraphrased second VERDICT rule');
    });
  }
  it('code-review reviewer prompt demands it before the 7 sections', () => {
    assert.ok(read('skills/code-review/references/reviewer-prompt.md').includes(VERDICT_LINE));
    assert.match(read('skills/code-review/references/reviewer-prompt.md'), /Repro:.*BLOCK-KIND: proof|BLOCK-KIND: proof.*Repro:/s);
  });
  it('SDD spec reviewer prompt demands it', () => {
    assert.ok(read('skills/subagent-driven-development/spec-reviewer-prompt.md').includes(VERDICT_LINE));
  });
  it('SDD spec reviewer maps P0/P1 to BLOCK, as code-reviewer does', () => {
    const spec = read('skills/subagent-driven-development/spec-reviewer-prompt.md');
    assert.ok(spec.includes('❌ → CHANGES, or BLOCK for any P0/P1'));
    assert.ok(spec.includes('P0-P3 severity'), 'the report must carry the severity the mapping reads');
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
    assert.ok(agents.includes('none → your OS temp dir + `/claude-reports/`'));
    assert.ok(!agents.includes('/tmp/claude-reports/'));
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
  it('the reviewer template alone says how to fill its placeholders; code-review points at it', () => {
    assert.match(read('skills/code-review/references/reviewer-prompt.md'), /Fill `\{SCRATCHPAD_DIR\}`.*`\{EXPECTED_MIN\}`.*default 20 min/);
    const skill = read('skills/code-review/SKILL.md');
    assert.ok(skill.includes("fill the template's placeholders"));
    assert.ok(!skill.includes('default 20 min'), 'the budget default lives in one place');
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
  it('implementer prompt names both worktree modes in Work from', () => {
    const prompt = read('skills/subagent-driven-development/implementer-prompt.md');
    assert.ok(prompt.includes('Work from: [isolated worktree: your cwd; use paths relative to it | slice mode: <absolute slice worktree path>, use absolute paths under it and run Bash as `cd <path> && …`]'));
  });
  for (const name of ['executor', 'deep-executor']) {
    it(`agents/${name}.md knows the isolated-worktree error`, () => {
      assert.match(read(`agents/${name}.md`), /isolated in the worktree/);
    });
    it(`agents/${name}.md scopes relative paths to isolated worktrees`, () => {
      const text = read(`agents/${name}.md`);
      assert.ok(text.includes('When your cwd is an isolated worktree (the brief gives no absolute `Work from:` path), work in it with paths relative to it.'));
      assert.ok(!text.includes('- Work in your cwd with paths relative to it.'));
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

describe('2.5 cold-reader agent', () => {
  const frontmatter = () => read('agents/cold-reader.md').split('---')[1];
  it('exists on sonnet with a description of 40 words or fewer', () => {
    const fm = frontmatter();
    assert.match(fm, /^model: sonnet$/m);
    const desc = fm.match(/^description: (.+)$/m)[1];
    assert.ok(desc.split(/\s+/).length <= 40, desc);
  });
  it('is read-only and sees no chat history', () => {
    const fm = frontmatter();
    assert.match(fm, /^disallowedTools:.*Write.*Edit/m);
    assert.match(fm, /no chat history/);
  });
  it('reads only the spec, never the code', () => {
    assert.match(read('agents/cold-reader.md'), /Read only the spec path/);
  });
  it('brainstorming and flow point at it, not general-purpose', () => {
    const tpl = read('skills/brainstorming/spec-document-reviewer-prompt.md');
    assert.ok(tpl.includes('subagent_type: "cold-reader"'));
    assert.ok(!tpl.includes('general-purpose'));
    assert.ok(read('skills/brainstorming/SKILL.md').includes('`cold-reader` agent'));
    assert.ok(read('skills/flow/SKILL.md').includes('`cold-reader` agent'));
  });
  it('touched prompts carry no machine-specific path', () => {
    const files = ['agents/cold-reader.md', 'agents/executor.md', 'agents/deep-executor.md', 'AGENTS.md', 'CLAUDE.md',
      'skills/brainstorming/SKILL.md', 'skills/dispatching-parallel-agents/SKILL.md', 'skills/code-review/references/reviewer-prompt.md'];
    for (const f of files) assert.doesNotMatch(read(f), /(?<![\w.-])\/home\/[a-z0-9_-]+\/|[A-Z]:\\+Users\\/i);
  });
});

describe('Task 3.1 review-round budget', () => {
  it('critic: second dispatch only after REJECT', () => {
    assert.match(read('agents/critic.md'), /again only after REJECT, never a third time/);
  });
  it('plan: critic loops capped at 2, no old caps left', () => {
    const t = read('skills/plan/SKILL.md');
    assert.match(t, /max 2 rounds; Critic runs again only after REJECT/);
    assert.match(t, /make one re-dispatch/);
    assert.match(t, /stop after 2 Planner\/Architect\/Critic iterations/);
    assert.doesNotMatch(t, /max 5 rounds|up to 3 rounds|after 5 rounds|stop after 5/);
  });
  it('brainstorming: critic step gets one re-dispatch', () => {
    const step = read('skills/brainstorming/SKILL.md').split('\n').find((l) => l.startsWith('11. **Critic check.**'));
    assert.match(step, /make one re-dispatch/);
    assert.doesNotMatch(step, /3 rounds/);
  });
  it('code-review: convention-only gate skips without waiting', () => {
    const t = read('skills/code-review/SKILL.md');
    assert.match(t, /node ~\/\.claude\/scripts\/convention-only\.mjs <range>/);
    assert.match(t, /Review skipped: convention-only diff/);
    assert.match(t, /write no stamp/);
    assert.match(t, /The caller waits for no reviewer/);
  });
  it('code-review: delta budget on sonnet, 2 rounds, BLOCK stops', () => {
    const t = read('skills/code-review/SKILL.md');
    assert.match(t, /\*\*Delta budget\.\*\*/);
    assert.match(t, /model: sonnet/);
    assert.match(t, /at most 2 delta rounds/);
    assert.match(t, /A BLOCK in delta round 2 stops for the user/);
    assert.match(read('skills/code-review/references/babysit.md'), /Delta budget/);
  });
  it('open-pr: delta cap, BLOCK stops, skipped review continues', () => {
    const t = read('skills/open-pr/SKILL.md');
    assert.match(t, /At most 2 delta rounds/);
    assert.match(t, /A BLOCK in delta round 2 stops for the user/);
    assert.match(t, /`Review skipped: convention-only diff` → continue as APPROVE/);
    assert.doesNotMatch(t, /introduced by the previous fix/);
  });
  it('SDD: convention-only diff skips code-review, keeps quality-reviewer', () => {
    const t = read('skills/subagent-driven-development/SKILL.md');
    assert.match(t, /Convention-only gate/);
    assert.match(t, /convention-only\.mjs <plan-base>\.\.HEAD/);
    assert.match(t, /the `quality-reviewer` pass stays/);
  });
});
