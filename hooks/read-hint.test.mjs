import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const { readTargets } = createRequire(import.meta.url)('./read-hint.js');

const reads = [
  ['cat a.ts', ['a.ts']],
  ['sed -n 1,80p a.ts && grep x a.ts', ['a.ts']],
  ['head -n 20 src/a.ts | grep x', ['src/a.ts']],
  ['tail -50 log.txt', ['log.txt']],
  ['cd x && cat "my file.ts"', ['my file.ts']],
  ['sed -n 1,5p a.ts b.ts', ['a.ts', 'b.ts']],
  ['cat a.ts 2>/dev/null', ['a.ts']],
  ['cat a.ts 2>&1', ['a.ts']],
  ['cat < a.ts', ['a.ts']],
  ['tail -n +10 a.ts', ['a.ts']],
  ["sed -e 's/x/y/' a.ts", ['a.ts']],
  ["sed --expression='s/x/y/' a.ts", ['a.ts']],
  ['cat a.ts &', ['a.ts']],
  ['cat a.ts # comment', ['a.ts']],
  ['rtk proxy cat a.ts', ['a.ts']],
  ['rtk cat a.ts', ['a.ts']],
  ['sudo cat a.ts', ['a.ts']],
  ['LC_ALL=C cat a.ts', ['a.ts']],
  ['cat a.ts; head a.ts', ['a.ts']],
  ['cat a.ts >&2', ['a.ts']],
  ['head -c 1k a.ts', ['a.ts']],
  ['cat a.ts # c\nhead b.ts', ['a.ts', 'b.ts']],
  ['cat a.ts >; cat b.ts', ['b.ts']],
];
const notReads = [
  "cat <<EOF > file\nhi\nEOF", "cat <<'EOF' > a.ts\nhi\nEOF", "cat <<EOF\nhi\nEOF",
  "cat <<-EOF > run.sh\n\tcat config.json\n\tEOF",
  'cat a.ts > b.ts', 'cat a.ts >> b.ts', 'cat a.ts 1> b.ts', 'cat a.ts &> b.ts', 'cat a.ts >| b.ts',
  'cat a.ts >& out.txt', 'cat 3<a.ts',
  "sed -i 's/a/b/' a.ts", 'echo hi | tee a.ts',
  'git log | head -5', 'ls -la', 'cat -',
];
for (const [cmd, want] of reads) test(`reads: ${JSON.stringify(cmd)}`, () => assert.deepEqual(readTargets(cmd), want));
for (const cmd of notReads) test(`no hint: ${JSON.stringify(cmd)}`, () => assert.deepEqual(readTargets(cmd), []));
test('a huge command does not overflow the stack', () => assert.equal(readTargets(`cat ${'a '.repeat(5e5)}`).length, 1));

test('CLI never blocks and speaks only when something was read', () => {
  const run = (command) => spawnSync('node', [new URL('./read-hint.js', import.meta.url).pathname],
    { input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8' });
  const hit = run('sed -n 1,80p a.ts && grep x a.ts');
  assert.equal(hit.status, 0);
  assert.match(JSON.parse(hit.stdout).hookSpecificOutput.additionalContext, /a\.ts.*Read/s);
  const miss = run("cat <<EOF > f\nx\nEOF");
  assert.equal(miss.status, 0);
  assert.equal(miss.stdout, '');
  assert.equal(spawnSync('node', [new URL('./read-hint.js', import.meta.url).pathname], { input: 'not json' }).status, 0);
  const many = JSON.parse(run('cat f1.ts f2.ts f3.ts f4.ts').stdout).hookSpecificOutput.additionalContext;
  assert.match(many, /f1\.ts, f2\.ts, f3\.ts does not/);
  assert.doesNotMatch(many, /f4\.ts/);
});
