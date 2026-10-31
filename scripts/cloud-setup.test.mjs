import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

const SCRIPT = join(import.meta.dirname, 'cloud-setup.sh');
const homes = [];

// Fresh cloud home (what the harness and `claude plugin marketplace add` leave), then the script.
function setUp({ withRtk, failingJq = false }) {
  const home = mkdtempSync(join(tmpdir(), 'cloud-setup-'));
  homes.push(home);
  const dst = join(home, '.claude');
  mkdirSync(dst);
  const harness = {
    extraKnownMarketplaces: { f42: { source: { source: 'github', repo: 'F0rty-Tw0/.claude' } } },
    enabledPlugins: { 'f42@f42': true, 'other@mkt': true },
    effortLevel: 'low',
    harnessOnly: 1,
    env: { HARNESS_ENV: '1' },
  };
  writeFileSync(join(dst, 'settings.json'), JSON.stringify(harness));
  // What the cloud harness writes to ~/.gitconfig.
  writeFileSync(join(home, '.gitconfig'), '[user]\n\tname = Claude\n\temail = noreply@anthropic.com\n[commit]\n\tgpgsign = true\n' +
    '[url "https://github.com/"]\n\tinsteadOf = git@github.com:\n');
  writeFileSync(join(dst, 'stop-hook-git-check.sh'), 'harness');
  const bin = join(home, 'bin');
  mkdirSync(bin);
  if (withRtk) {
    writeFileSync(join(bin, 'rtk'), '#!/bin/sh\n');
    chmodSync(join(bin, 'rtk'), 0o755);
  }
  if (failingJq) {
    writeFileSync(join(bin, 'jq'), '#!/bin/sh\nexit 5\n');
    chmodSync(join(bin, 'jq'), 0o755);
  }
  const env = { ...process.env, HOME: home, PATH: `${bin}:/usr/bin:/bin` };
  const result = spawnSync('bash', [SCRIPT], { env, encoding: 'utf8' });
  const settings = JSON.parse(readFileSync(join(dst, 'settings.json'), 'utf8'));
  const commands = settings.hooks?.PreToolUse.flatMap((entry) => entry.hooks.map((hook) => hook.command)) ?? [];
  return { home, dst, result, settings, commands };
}

const { home, dst, result, settings, commands } = setUp({ withRtk: false });

describe('cloud-setup', () => {
  after(() => homes.forEach((home) => rmSync(home, { recursive: true, force: true })));

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
    assert.equal(settings.harnessOnly, 1);
    assert.equal(settings.env.COLD_CACHE_GUARD, 'on');
    assert.equal(settings.effortLevel, 'high', 'ours wins over the harness value');
    assert.deepEqual(Object.keys(settings.extraKnownMarketplaces), ['f42']);
    for (const key of ['model', 'permissions', 'defaultMode', 'statusLine', 'remoteControlAtStartup']) assert.ok(!(key in settings), key);
    assert.ok(!existsSync(join(dst, 'settings.json.tmp')));
  });

  it('WHEN rtk is missing THEN the rtk and cpu-guard hooks are dropped and the rest kept', () => {
    assert.ok(!commands.some((command) => /^rtk |cpu-guard/.test(command)), commands.join('\n'));
    assert.ok(commands.some((command) => command.includes('read-hint.js')));
    assert.ok(commands.some((command) => command.includes('commit-attribution-guard.js')));
  });

  it('WHEN merged THEN git commits as the user, unsigned, and harness git settings stay', () => {
    assert.equal(settings.env.HARNESS_ENV, '1');
    assert.equal(settings.env.GIT_CONFIG_GLOBAL, join(dst, 'cloud.gitconfig'));
    assert.ok(!('GIT_CONFIG_COUNT' in settings.env), 'the harness owns the GIT_CONFIG_COUNT slots');
    // The harness also sets config through GIT_CONFIG_COUNT/KEY_n env slots; those must keep working.
    const env = { ...process.env, HOME: home, GIT_CONFIG_GLOBAL: settings.env.GIT_CONFIG_GLOBAL,
      GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'credential.interactive', GIT_CONFIG_VALUE_0: 'false' };
    const get = (key) => spawnSync('git', ['config', '--get', key], { env, cwd: home, encoding: 'utf8' }).stdout.trim();
    assert.equal(get('user.name'), 'Artiom Tofan', 'ours wins over the harness Claude identity');
    assert.equal(get('user.email'), '60610474+F0rty-Tw0@users.noreply.github.com');
    assert.equal(get('commit.gpgsign'), 'false');
    assert.equal(get('url.https://github.com/.insteadOf'), 'git@github.com:', 'harness ~/.gitconfig still included');
    assert.equal(get('credential.interactive'), 'false', 'harness env slots untouched');
  });

  it('WHEN merged THEN both f42 plugin copies and the locally disabled plugins are off, and the harness ones stay', () => {
    assert.equal(settings.enabledPlugins['f42@f42'], false);
    assert.equal(settings.enabledPlugins['f42@synced'], false, 'the claude.ai-synced copy');
    assert.equal(settings.enabledPlugins['cc-plugin-telemetry@builtin'], false);
    const on = Object.entries(settings.enabledPlugins).filter(([, enabled]) => enabled).map(([id]) => id);
    assert.deepEqual(on, ['other@mkt'], 'a harness plugin stays on and nothing of ours turns on');
  });

  it('WHEN rtk is installed THEN the rtk and cpu-guard hooks stay', () => {
    const withRtk = setUp({ withRtk: true });
    assert.equal(withRtk.result.status, 0, withRtk.result.stderr);
    assert.ok(withRtk.commands.includes('rtk hook claude'));
    assert.ok(withRtk.commands.some((command) => command.includes('cpu-guard.js')));
  });

  it('WHEN the settings merge fails THEN it exits non-zero and ~/.claude is left as it was', () => {
    const failed = setUp({ withRtk: false, failingJq: true });
    assert.notEqual(failed.result.status, 0);
    assert.ok(!existsSync(join(failed.dst, 'CLAUDE.md')), 'nothing copied, so the plugin fallback loads alone');
    assert.ok(!existsSync(join(failed.dst, 'settings.json.tmp')));
    assert.deepEqual(failed.settings.enabledPlugins, { 'f42@f42': true, 'other@mkt': true });
  });
});
