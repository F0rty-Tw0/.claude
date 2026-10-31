import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

const SCRIPT = join(import.meta.dirname, 'cloud-setup.sh');
const home = mkdtempSync(join(tmpdir(), 'cloud-setup-'));
const dst = join(home, '.claude');
mkdirSync(dst);
// What the cloud harness and `claude plugin marketplace add` leave behind.
writeFileSync(join(dst, 'settings.json'), JSON.stringify({ extraKnownMarketplaces: { f42: { source: { source: 'github', repo: 'F0rty-Tw0/.claude' } } } }));
writeFileSync(join(dst, 'stop-hook-git-check.sh'), 'harness');
// PATH without rtk, so the rtk-dependent hooks must be dropped.
const env = { ...process.env, HOME: home, PATH: '/usr/bin:/bin' };
const result = spawnSync('bash', [SCRIPT], { env, encoding: 'utf8' });
const settings = JSON.parse(readFileSync(join(dst, 'settings.json'), 'utf8'));
const commands = settings.hooks.PreToolUse.flatMap((entry) => entry.hooks.map((hook) => hook.command));

describe('cloud-setup', () => {
  after(() => rmSync(home, { recursive: true, force: true }));

  it('WHEN run THEN it exits 0', () => assert.equal(result.status, 0, result.stderr));

  it('WHEN run THEN memory files, agents and skills land in ~/.claude and harness files stay', () => {
    for (const file of ['CLAUDE.md', 'AGENTS.md', 'agents/executor.md', 'skills/grug/SKILL.md', 'hooks/read-hint.js']) {
      assert.ok(existsSync(join(dst, file)), file);
    }
    assert.ok(!existsSync(join(dst, '.git')));
    assert.equal(readFileSync(join(dst, 'stop-hook-git-check.sh'), 'utf8'), 'harness');
  });

  it('WHEN merged THEN harness keys stay, ours land, and session-owned keys are dropped', () => {
    assert.ok(settings.extraKnownMarketplaces.f42);
    assert.equal(settings.env.COLD_CACHE_GUARD, 'on');
    for (const key of ['model', 'permissions', 'statusLine', 'enabledPlugins']) assert.ok(!(key in settings), key);
  });

  it('WHEN rtk is missing THEN the rtk and cpu-guard hooks are dropped and the rest kept', () => {
    assert.ok(!commands.some((command) => /^rtk |cpu-guard/.test(command)), commands.join('\n'));
    assert.ok(commands.some((command) => command.includes('read-hint.js')));
  });
});
