// Run: node --test scripts/tool-friction.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'tool-friction.py');
const py = spawnSync('python3', ['-c', '1']).status === 0;
const root = mkdtempSync(join(tmpdir(), 'tool-friction-'));
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');

const use = (id, name, input) => ({ message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
const fail = (id, text) => ({ message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content: text }] } });

describe('tool-friction', () => {
  after(() => rmSync(root, { recursive: true, force: true }));

  it('tool-friction counts sleep blocks, Monitor schema errors, 137 shapes and denials from a fixture', { skip: !py }, () => {
    const rows = [
      use('a', 'Bash', { command: 'sleep 60 && echo done' }),
      fail('a', '<tool_use_error>Blocked: sleep 60 followed by: echo done. To wait for a condition, use Monitor'),
      use('b', 'Monitor', { command: 'until [ -s f ]; do sleep 2; done' }),
      fail('b', '<tool_use_error>InputValidationError: Monitor failed due to the following issue:\nThe required parameter `description` is missing'),
      use('c', 'Bash', { command: 'while true; do pgrep vitest || break; sleep 5; done' }),
      fail('c', 'Exit code 137'),
      use('d', 'Bash', { command: 'cd /x && rtk proxy git log --oneline -5' }),
      fail('d', 'Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Interfere With Workloads].'),
    ];
    mkdirSync(join(root, 'p'));
    writeFileSync(join(root, 'p', 's.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n'));
    const out = spawnSync('python3', ['-I', '-B', script, '--root', root], { encoding: 'utf8' });
    assert.equal(out.status, 0, out.stderr);
    const got = JSON.parse(out.stdout);
    assert.equal(got.sleep_blocks, 1);
    assert.equal(got.monitor_schema_errors, 1);
    assert.deepEqual(got.exit_137, { poll_loop: 1, heavy_run: 0, other: 0 });
    assert.deepEqual(got.denials, [{ reason: 'Interfere With Workloads', tool: 'Bash', head: 'git log', count: 1 }]);
  });

  it('tool-friction skips a transcript that vanished after listing and still reports the rest', { skip: !py }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'tool-friction-gone-'));
    after(() => rmSync(dir, { recursive: true, force: true }));
    symlinkSync(join(dir, 'missing.jsonl'), join(dir, 'dangling.jsonl'));
    writeFileSync(join(dir, 'ok.jsonl'), JSON.stringify(use('a', 'Bash', { command: 'sleep 60' })));
    const out = spawnSync('python3', ['-I', '-B', script, '--root', dir], { encoding: 'utf8' });
    assert.equal(out.status, 0, out.stderr);
    assert.equal(JSON.parse(out.stdout).sleep_blocks, 0);
  });

  it('Task 6.6 AGENTS.md: waiting uses run_in_background or Monitor with its required fields', () => {
    const agents = read('AGENTS.md');
    assert.match(agents, /a foreground `sleep` is blocked by the harness/);
    assert.match(agents, /load it with ToolSearch \(`select:Monitor`\) first/);
    assert.match(agents, /`command`, `description` and `timeout_ms` \(not `timeout`\)/);
  });

  it('Task 6.6 settings.json allowlist holds read-only prefixes only', () => {
    // Vacuous while permissions.allow is []: the loop body never runs. It starts guarding on the first rule added.
    const allow = JSON.parse(read('settings.json')).permissions.allow;
    const readOnly = /^Bash\((git (log|status|diff|show|branch|rev-parse|ls-files|blame)|gh (pr (view|checks|list|status)|run (list|view))|ls|wc|rg|grep)\b/;
    const destructive = /\b(rm|mv|push|merge|reset|checkout|clean|kill|sudo|-delete)\b/;
    for (const rule of allow) {
      assert.match(rule, readOnly, rule);
      assert.doesNotMatch(rule, destructive, rule);
    }
  });
});
