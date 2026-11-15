import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const REPO = join(import.meta.dirname, '..');
const read = (file) => JSON.parse(readFileSync(join(REPO, file), 'utf8')).hooks.PreToolUse;
// The plugin form (hooks.json) is what a cloud session gets when scripts/cloud-setup.sh fails.
// It must carry the guards that stop data loss and unproven PRs, with the matcher settings.json gives them.
const SAFETY_GUARDS = ['delete-guard.js', 'pr-proof-guard.js', 'commit-attribution-guard.js'];
const matcherOf = (entries, guard) => entries.find((entry) => entry.hooks.some((hook) => hook.command.includes(`/hooks/${guard}`)))?.matcher;

describe('hooks.json', () => {
  for (const guard of SAFETY_GUARDS) {
    it(`WHEN the plugin form loads THEN ${guard} runs with the matcher settings.json gives it`, () => {
      const local = matcherOf(read('settings.json'), guard);
      assert.ok(local, `${guard} is wired in settings.json`);
      assert.equal(matcherOf(read('hooks/hooks.json'), guard), local);
      assert.ok(existsSync(join(REPO, 'hooks', guard)));
    });
  }

  it('WHEN the plugin form names a hook file THEN the file exists', () => {
    const commands = Object.values(JSON.parse(readFileSync(join(REPO, 'hooks/hooks.json'), 'utf8')).hooks)
      .flatMap((entries) => entries.flatMap((entry) => entry.hooks.map((hook) => hook.command)));
    for (const command of commands) {
      const file = command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/(hooks\/[\w-]+\.js)/)?.[1];
      assert.ok(file && existsSync(join(REPO, file)), command);
    }
  });
});
