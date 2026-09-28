// Item 7: run base's contract test against head's code. A failure means head broke the documented shares shape.
import { copyFileSync, cpSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'untuned-contract-'));
cpSync(join(root, 'head'), dir, { recursive: true });
copyFileSync(join(root, 'base', 'test', 'app.test.js'), join(dir, 'test', 'app.test.js'));
const r = spawnSync('node', ['--test', '--test-reporter=tap'], { cwd: dir, encoding: 'utf8' });
console.log((r.stdout.match(/^not ok .*$/gm) || []).join('\n') || 'no failures');
console.log(r.stdout.match(/# pass \d+/)[0], r.stdout.match(/# fail \d+/)[0]);
