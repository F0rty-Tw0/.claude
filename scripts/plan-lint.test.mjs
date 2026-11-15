import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

const SCRIPT = join(import.meta.dirname, 'plan-lint');
const root = mkdtempSync(join(tmpdir(), 'plan-lint-'));
const CLEAN = /^plan-lint: 0 errors, 0 warnings\n$/;
const FENCE = '```';
let cases = 0;

const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
const rows = (count) => 'x\n'.repeat(count);
// Blank rows between the counted ones, so a counter of all lines would see twice as many.
const spaced = (count) => 'x\n\n'.repeat(count);

function repoWith(files) {
  const repo = join(root, `case-${cases++}`);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), content);
  }

  return repo;
}

function lint(plan, files = {}, flags = []) {
  const repo = repoWith({ 'plan.md': plan, ...files });

  return run(join(repo, 'plan.md'), '--repo', repo, ...flags);
}

describe('plan-lint', () => {
  after(() => rmSync(root, { recursive: true, force: true }));

  it('WHEN a cite names a file that does not exist THEN it is an error and the exit code is 1', () => {
    const result = lint('# Plan\n\nSee `src/gone.ts:5` for the guard.\n');
    assert.match(result.stdout, /plan\.md:3: error: cite src\/gone\.ts:5: file does not exist\n/);
    assert.match(result.stdout, /plan-lint: 1 errors, 0 warnings\n$/);
    assert.equal(result.status, 1);
  });

  it('WHEN a cite names a missing file by bare name THEN it is a warning, and an existing root file is still range-checked', () => {
    const result = lint('See `idle.ts:50-52` and `README.md:9`.\n', { 'README.md': rows(4) });
    assert.match(result.stdout, /plan\.md:1: warn: cite idle\.ts:50-52: no folder in the path, cannot check\n/);
    assert.match(result.stdout, /plan\.md:1: error: cite README\.md:9: past the last line \(README\.md has 4 lines\)/);
    assert.match(result.stdout, /plan-lint: 1 errors, 1 warnings\n$/);
  });

  it('WHEN a cite points past the last line THEN the error names the real line count', () => {
    const result = lint('The loop at `src/a.ts:2-9` leaks.\n', { 'src/a.ts': rows(4) });
    assert.match(result.stdout, /plan\.md:1: error: cite src\/a\.ts:2-9: past the last line \(src\/a\.ts has 4 lines\)/);
    assert.equal(result.status, 1);
  });

  it('WHEN a cite points at a path on a Create line THEN there is no finding', () => {
    const result = lint('- Create: `src/new.ts`\n\nThe guard goes at `src/new.ts:40`.\n');
    assert.match(result.stdout, CLEAN);
    assert.equal(result.status, 0);
  });

  it('WHEN a cite is inside the file THEN there is no finding', () => {
    const result = lint('See `src/a.ts:2-4` and `notes.md:1`.\n', { 'src/a.ts': rows(4), 'notes.md': rows(1) });
    assert.match(result.stdout, CLEAN);
    assert.equal(result.status, 0);
  });

  it('WHEN a Modify path does not exist THEN it is an error', () => {
    const result = lint('**Files:**\n- Modify: `src/gone.ts` (the guard only)\n');
    assert.match(result.stdout, /plan\.md:2: error: Modify: src\/gone\.ts does not exist\n/);
    assert.equal(result.status, 1);
  });

  it('WHEN a Modify path is created earlier in the plan THEN there is no finding', () => {
    const result = lint('- Create: `src/new.ts`\n\n### Task 1.2\n\n- Modify: `src/new.ts:1-20`\n');
    assert.match(result.stdout, CLEAN);
  });

  it('WHEN a Create path already exists THEN it is a warning and the exit code is 0', () => {
    const result = lint('- Create: `src/a.ts`\n', { 'src/a.ts': rows(4) });
    assert.match(result.stdout, /plan\.md:1: warn: Create: src\/a\.ts already exists\n/);
    assert.match(result.stdout, /plan-lint: 0 errors, 1 warnings\n$/);
    assert.equal(result.status, 0);
  });

  it('WHEN a Run line names a file that does not exist THEN it is an error', () => {
    const plan = 'Run: `pnpm exec vitest run src/gone.spec.ts --reporter=out/r.json src/*.ts`\n';
    const result = lint(plan);
    assert.match(result.stdout, /plan\.md:1: error: Run names a file that does not exist: src\/gone\.spec\.ts\n/);
    assert.match(result.stdout, /plan-lint: 1 errors, 0 warnings\n$/);
    assert.equal(result.status, 1);
  });

  it('WHEN a Run line names a Test path that does not exist yet THEN there is no finding', () => {
    const plan = '- Test: `src/new.spec.ts`\n\nRun: `node --test src/new.spec.ts src/a.ts`\n';
    const result = lint(plan, { 'src/a.ts': rows(4) });
    assert.match(result.stdout, CLEAN);
    assert.equal(result.status, 0);
  });

  it('WHEN a cite or a Modify line sits inside a fenced code block THEN it is ignored', () => {
    const fenced = `${FENCE}markdown\n- Modify: \`src/gone.ts\`\nsee \`src/gone.ts:5\`\n${FENCE}\n`;
    assert.match(lint(fenced).stdout, CLEAN);
    const afterFence = lint(`${fenced}\nsee \`src/gone.ts:5\`\n`);
    assert.match(afterFence.stdout, /plan\.md:6: error: cite src\/gone\.ts:5/);
  });

  it('WHEN a Modify file reaches 85% of the cap THEN it warns, and one line below it does not', () => {
    const files = { 'src/at.ts': spaced(128), 'src/below.ts': spaced(127) };
    const result = lint('- Modify: `src/at.ts`\n- Modify: `src/below.ts`\n', files);
    assert.match(result.stdout, /plan\.md:1: warn: src\/at\.ts has 128 non-blank lines \(cap 150\): name the split\n/);
    assert.match(result.stdout, /plan-lint: 0 errors, 1 warnings\n$/);
    assert.equal(result.status, 0);
  });

  it('WHEN a Modify file is a spec or test file THEN the cap is doubled', () => {
    const files = { 'src/a.spec.ts': rows(254), 'src/b.test.mjs': rows(255), 'src/c_test.go': rows(255) };
    const result = lint('- Modify: `src/a.spec.ts`\n- Modify: `src/b.test.mjs`\n- Modify: `src/c_test.go`\n', files);
    assert.match(result.stdout, /plan\.md:2: warn: src\/b\.test\.mjs has 255 non-blank lines \(cap 300\): name the split\n/);
    assert.match(result.stdout, /plan\.md:3: warn: src\/c_test\.go has 255 non-blank lines \(cap 300\)/);
    assert.match(result.stdout, /plan-lint: 0 errors, 2 warnings\n$/);
  });

  it('WHEN --cap is given THEN the warning uses it', () => {
    const result = lint('- Modify: `src/a.ts`\n', { 'src/a.ts': rows(17) }, ['--cap', '20']);
    assert.match(result.stdout, /warn: src\/a\.ts has 17 non-blank lines \(cap 20\)/);
  });

  it('WHEN the plan is a folder THEN every .md in it is linted and a Create line in one file covers the others', () => {
    const index = '- Create: `src/new.ts`\n\nsee `src/gone.ts:1`\n';
    const phase = 'see `src/new.ts:9` and `src/gone.ts:2`\n';
    const repo = repoWith({ 'plan/index.md': index, 'plan/01-core.md': phase, 'plan/notes.txt': 'see `src/gone.ts:3`\n' });
    const result = run(join(repo, 'plan'), '--repo', repo);
    assert.match(result.stdout, /01-core\.md:1: error: cite src\/gone\.ts:2/);
    assert.match(result.stdout, /index\.md:3: error: cite src\/gone\.ts:1/);
    assert.match(result.stdout, /plan-lint: 2 errors, 0 warnings\n$/);
    assert.equal(result.status, 1);
  });

  it('WHEN no plan path is given THEN the exit code is 2', () => {
    const result = run('--repo', root);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /usage: plan-lint/);
  });

  it('WHEN the plan path does not exist THEN the exit code is 2', () => {
    const result = run(join(root, 'no-such-plan'));
    assert.equal(result.status, 2);
    assert.match(result.stderr, /plan not found/);
  });
});
