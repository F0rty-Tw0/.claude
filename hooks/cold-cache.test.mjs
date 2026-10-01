// Run: node --test hooks/cold-cache.test.mjs
import { after, test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hook = fileURLToPath(new URL('./cold-cache.js', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'cold-cache-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const ago = (s) => new Date(Date.now() - s * 1000).toISOString();
const response = (id, secondsAgo, { read = 0, write = 0, hour = true, sidechain = false } = {}) => JSON.stringify({
  type: 'assistant', isSidechain: sidechain, timestamp: ago(secondsAgo),
  message: {
    id, model: 'claude-opus-5-5',
    usage: {
      input_tokens: 2, output_tokens: 500, cache_read_input_tokens: read, cache_creation_input_tokens: write,
      cache_creation: { ephemeral_1h_input_tokens: hour ? write : 0, ephemeral_5m_input_tokens: hour ? 0 : write },
    },
  },
});

let n = 0;
// Each case gets its own session id, so state from one case never leaks into another.
const transcript = (...lines) => {
  const file = join(dir, `t${++n}.jsonl`);
  writeFileSync(file, [JSON.stringify({ type: 'user' }), ...lines, '{"partial'].join('\n'));
  return { file, session: `s${n}` };
};
const run = ({ file, session }, prompt, env = {}) => {
  const r = spawnSync('node', [hook], {
    input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: session, transcript_path: file, prompt }),
    env: { ...process.env, TMPDIR: dir, TEMP: dir, TMP: dir, ...env },
    encoding: 'utf8',
  });
  assert.strictEqual(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout) : null;
};
const cold = () => transcript(response('m1', 7300, { write: 200_000 }), response('m2', 7200, { read: 200_000, write: 1000 }));

test('warm cache passes', () => {
  assert.strictEqual(run(transcript(response('m1', 60, { write: 200_000 })), 'hi'), null);
});

test('cold cache blocks once, then passes', () => {
  const t = cold();
  const out = run(t, 'do the thing');
  assert.strictEqual(out.decision, 'block');
  assert.match(out.reason, /2\.0 h since the last response .*~202k tokens to re-cache/);
  assert.strictEqual(run(t, 'do the thing'), null);
});

test('bare ! resends the stopped prompt', () => {
  const t = cold();
  run(t, 'do the thing');
  const ctx = run(t, '!').hookSpecificOutput.additionalContext;
  assert.match(ctx, /verbatim:\n\ndo the thing$/);
});

test('! without a block passes untouched', () => {
  assert.strictEqual(run(transcript(response('m1', 60, { write: 200_000 })), '!'), null);
});

test('context-shedding and non-model commands pass while cold', () => {
  assert.strictEqual(run(cold(), '/clear'), null);
  assert.strictEqual(run(cold(), '/model opus'), null);
  assert.strictEqual(run(cold(), '/plan something').decision, 'block');
});

test('5m TTL applies when the session never wrote 1h cache', () => {
  const t = transcript(response('m1', 600, { write: 200_000, hour: false }));
  assert.strictEqual(run(t, 'hi').decision, 'block');
  assert.strictEqual(run(transcript(response('m1', 600, { write: 200_000 })), 'hi'), null);
});

test('shared warm prefix is subtracted before the threshold', () => {
  // 60k context, 40k of it read from cache on the first response -> ~20k to re-cache.
  const t = transcript(response('m1', 7300, { read: 40_000, write: 20_000 }));
  assert.strictEqual(run(t, 'hi'), null);
  assert.match(run(t, 'hi', { COLD_CACHE_MIN_TOKENS: '10000' }).reason, /~21k tokens .*~40k shared prefix/);
});

test('sidechain responses do not count as the last response', () => {
  const t = transcript(response('m1', 7200, { write: 200_000 }), response('sub', 10, { write: 5000, sidechain: true }));
  assert.strictEqual(run(t, 'hi').decision, 'block');
});

test('COLD_CACHE_GUARD=off disables', () => {
  assert.strictEqual(run(cold(), 'hi', { COLD_CACHE_GUARD: 'off' }), null);
});
