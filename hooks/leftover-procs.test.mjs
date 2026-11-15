import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const { ageSeconds, hookOutput, isLeftover, report } = createRequire(import.meta.url)('./leftover-procs.js');
const hook = fileURLToPath(new URL('./leftover-procs.js', import.meta.url));

const OLD_WAITER = '   4242   11520 /bin/zsh -c until grep -q READY /tmp/server.log; do sleep 5; done';
const YOUNG_WAITER = '   4300     599 /bin/zsh -c until grep -q READY /tmp/other.log; do sleep 5; done';
const UNRELATED_OLD = '   2947   80728 /usr/lib/systemd/systemd --user';
const LINUX_PS = [OLD_WAITER, YOUNG_WAITER, UNRELATED_OLD, ''].join('\n');
const LEFTOVER_COMMANDS = [
  '/bin/zsh -c until grep -q READY /tmp/x.log; do sleep 5; done',
  'tail -F /var/log/app.log',
  'tail -f app.log',
  'tail -n +1 -F app.log',
  '/usr/bin/tail --follow=name app.log',
  'python3 -m http.server 8000',
  '/usr/bin/python3.12 -m http.server',
  'Xvfb :99 -screen 0 1280x720x24',
  '/usr/bin/Xvfb :1',
  'bash -c while ! curl -s localhost:3000; do sleep 1; done',
];
const OTHER_COMMANDS = ['tail -n 50 app.log', 'node server.js', 'sleep 600', 'bash -c while true; do date; done', 'vim detail -f.txt', 'grep until notes.txt'];
const neverCalled = () => { throw new Error('ps must not run'); };
const NEW_WAITER = '   5555    7200 tail -F /var/log/app.log';
const OLD_WAITER_ROW = 'PID 4242  3h12m  /bin/zsh -c until grep -q READY /tmp/server.log; do sleep 5; done';
const NEW_WAITER_ROW = 'PID 5555  2h00m  tail -F /var/log/app.log';

function reportedRows(psOutput, sessionId) {
  const output = hookOutput({ session_id: sessionId }, 'linux', () => psOutput);
  if (!output) return [];

  return JSON.parse(output).hookSpecificOutput.additionalContext.split('\n').slice(1);
}

describe('FEATURE: leftover-procs hook', () => {
  describe('GIVEN Linux ps output with an old waiter, a young waiter and an unrelated old process', () => {
    describe('WHEN the report is built', () => {
      it('THEN only the old waiter is listed with PID, age and command', () => {
        const rows = report('linux', () => LINUX_PS).split('\n').slice(1);

        assert.deepEqual(rows, ['PID 4242  3h12m  /bin/zsh -c until grep -q READY /tmp/server.log; do sleep 5; done']);
      });

      it('THEN one line says to stop own leftovers by PID, never pkill -f, and leave other sessions alone', () => {
        const [instruction] = report('linux', () => LINUX_PS).split('\n');

        assert.match(instruction, /by PID.*never `pkill -f`.*leave other sessions' processes alone/);
      });

      it('THEN the line says the list covers every session of this user and to stop only this session\'s own', () => {
        const [instruction] = report('linux', () => LINUX_PS).split('\n');

        assert.match(instruction, /processes of every session of this user: stop only the ones this session/);
      });
    });

    it('WHEN the hook runs after a foreground Agent call THEN the report is PostToolUse additionalContext', () => {
      const input = { hook_event_name: 'PostToolUse', tool_response: { status: 'completed' } };

      const { hookSpecificOutput } = JSON.parse(hookOutput(input, 'linux', () => LINUX_PS));

      assert.equal(hookSpecificOutput.hookEventName, 'PostToolUse');
      assert.equal(hookSpecificOutput.additionalContext, report('linux', () => LINUX_PS));
    });

    it('WHEN the hook runs on UserPromptSubmit THEN the output names that event', () => {
      const input = { hook_event_name: 'UserPromptSubmit', prompt: 'x' };

      const { hookSpecificOutput } = JSON.parse(hookOutput(input, 'linux', () => LINUX_PS));

      assert.equal(hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    });

    it('WHEN the Agent call only launched a background subagent THEN nothing is printed', () => {
      const input = { hook_event_name: 'PostToolUse', tool_response: { status: 'async_launched' } };

      assert.equal(hookOutput(input, 'linux', () => LINUX_PS), '');
    });

    it('WHEN the platform is win32 THEN nothing is printed and ps never runs', () => {
      assert.equal(hookOutput({}, 'win32', neverCalled), '');
    });
  });

  describe('GIVEN a session that was already told about the old waiter', () => {
    let stateDir;
    let stateFile;

    beforeEach(() => {
      stateDir = mkdtempSync(join(tmpdir(), 'leftover-procs-'));
      stateFile = join(stateDir, 'leftover-seen-s1.json');
      process.env.LEFTOVER_PROCS_STATE_DIR = stateDir;
      reportedRows(LINUX_PS, 's1');
    });

    afterEach(() => {
      delete process.env.LEFTOVER_PROCS_STATE_DIR;
      rmSync(stateDir, { recursive: true, force: true });
    });

    it('WHEN the hook runs again with the same ps output THEN nothing is printed', () => {
      assert.equal(hookOutput({ session_id: 's1' }, 'linux', () => LINUX_PS), '');
    });

    it('WHEN a new old waiter has appeared THEN only that one is printed', () => {
      assert.deepEqual(reportedRows(`${LINUX_PS}${NEW_WAITER}\n`, 's1'), [NEW_WAITER_ROW]);
    });

    it('WHEN the same PID now runs a different command line THEN it is printed again', () => {
      const recycled = '   4242    7200 tail -F /var/log/app.log\n';

      assert.deepEqual(reportedRows(recycled, 's1'), ['PID 4242  2h00m  tail -F /var/log/app.log']);
    });

    it('WHEN the waiter is gone and a new one runs THEN the state file holds only the live PID', () => {
      reportedRows(`${NEW_WAITER}\n`, 's1');

      assert.deepEqual(JSON.parse(readFileSync(stateFile, 'utf8')), { 5555: 'tail -F /var/log/app.log' });
    });

    it('WHEN the waiter is gone and the PID comes back with the same command THEN it is printed again', () => {
      reportedRows('', 's1');

      assert.deepEqual(reportedRows(LINUX_PS, 's1'), [OLD_WAITER_ROW]);
    });

    it('WHEN the state file is corrupt THEN the waiter is printed again', () => {
      writeFileSync(stateFile, 'not json');

      assert.deepEqual(reportedRows(LINUX_PS, 's1'), [OLD_WAITER_ROW]);
    });

    it('WHEN the state file holds JSON that is not a PID map THEN the waiter is printed again', () => {
      writeFileSync(stateFile, 'null');

      assert.deepEqual(reportedRows(LINUX_PS, 's1'), [OLD_WAITER_ROW]);
    });

    it('WHEN the state file cannot be read or written THEN the waiter is printed on every run', () => {
      rmSync(stateFile);
      mkdirSync(stateFile);

      assert.deepEqual([reportedRows(LINUX_PS, 's1'), reportedRows(LINUX_PS, 's1')], [[OLD_WAITER_ROW], [OLD_WAITER_ROW]]);
    });

    it('WHEN another session runs the hook THEN the waiter is printed for that session', () => {
      assert.deepEqual(reportedRows(LINUX_PS, 's2'), [OLD_WAITER_ROW]);
    });

    it('WHEN the input has no session_id THEN the waiter is printed on every run', () => {
      assert.deepEqual([reportedRows(LINUX_PS, undefined), reportedRows(LINUX_PS, undefined)], [[OLD_WAITER_ROW], [OLD_WAITER_ROW]]);
    });

    it('WHEN the session_id is not a plain id THEN the waiter is printed and no state file is written', () => {
      const rows = reportedRows(LINUX_PS, '../escape');

      assert.deepEqual([rows, readdirSync(stateDir), existsSync(join(stateDir, '..', 'escape.json'))], [[OLD_WAITER_ROW], ['leftover-seen-s1.json'], false]);
    });
  });

  describe('GIVEN an old waiter whose command line is longer than 120 characters', () => {
    it('WHEN the report is built THEN the command is cut to 120 characters', () => {
      const command = `tail -F ${'a'.repeat(200)}`;

      const [, row] = report('linux', () => `77 700 ${command}\n`).split('\n');

      assert.equal(row, `PID 77  11m  ${command.slice(0, 120)}`);
    });
  });

  describe('GIVEN a waiter exactly 10 minutes old', () => {
    it('WHEN the report is built THEN nothing is printed', () => {
      assert.equal(hookOutput({}, 'linux', () => '77 600 tail -F app.log\n'), '');
    });
  });

  describe('GIVEN empty ps output', () => {
    it('WHEN the hook runs THEN nothing is printed', () => {
      assert.equal(hookOutput({}, 'linux', () => ''), '');
    });
  });

  describe('GIVEN macOS ps output with etime ages', () => {
    it('WHEN `01:02` is parsed THEN it is 62 seconds', () => {
      assert.equal(ageSeconds('01:02'), 62);
    });

    it('WHEN `01:02:03` is parsed THEN it is 3723 seconds', () => {
      assert.equal(ageSeconds('01:02:03'), 3723);
    });

    it('WHEN `2-01:02:03` is parsed THEN it is 176523 seconds', () => {
      assert.equal(ageSeconds('2-01:02:03'), 176523);
    });

    it('WHEN the age is not a time THEN the line is skipped', () => {
      assert.equal(report('darwin', () => '77 ELAPSED tail -F app.log\n'), '');
    });

    it('WHEN the report is built THEN only processes older than 10 minutes are listed', () => {
      const psOutput = ['  501 2-01:02:03 tail -F /var/log/system.log', '  502    09:59 tail -F young.log', '  503 01:02:03 /sbin/launchd'].join('\n');

      const rows = report('darwin', () => psOutput).split('\n').slice(1);

      assert.deepEqual(rows, ['PID 501  2d01h  tail -F /var/log/system.log']);
    });
  });

  describe('GIVEN an old process', () => {
    for (const command of LEFTOVER_COMMANDS) {
      it(`WHEN its command is \`${command}\` THEN it is a leftover`, () => {
        assert.equal(isLeftover({ age: 3600, command }), true);
      });
    }

    for (const command of OTHER_COMMANDS) {
      it(`WHEN its command is \`${command}\` THEN it is not a leftover`, () => {
        assert.equal(isLeftover({ age: 3600, command }), false);
      });
    }
  });

  describe('GIVEN the hook run as a command', () => {
    it('WHEN stdin is not JSON THEN it exits 0 and prints nothing', () => {
      const result = spawnSync(process.execPath, [hook], { input: 'not json', encoding: 'utf8' });

      assert.deepEqual([result.status, result.stdout, result.stderr], [0, '', '']);
    });

    it('WHEN ps cannot be started THEN it exits 0 and prints nothing', () => {
      const env = { PATH: '/nonexistent' };

      const result = spawnSync(process.execPath, [hook], { input: '{}', encoding: 'utf8', env });

      assert.deepEqual([result.status, result.stdout, result.stderr], [0, '', '']);
    });

    it('WHEN it reads the real process list THEN it exits 0 with no output or one PostToolUse context object', () => {
      const result = spawnSync(process.execPath, [hook], { input: '{}', encoding: 'utf8' });
      const eventName = result.stdout ? JSON.parse(result.stdout).hookSpecificOutput.hookEventName : 'PostToolUse';

      assert.deepEqual([result.status, eventName], [0, 'PostToolUse']);
    });
  });
});
