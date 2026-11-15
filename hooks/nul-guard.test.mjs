// Run: node --test hooks/nul-guard.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const hook = fileURLToPath(new URL('./nul-guard.js', import.meta.url));
const run = (input) => spawnSync(process.execPath, [hook], { input, encoding: 'utf8' });
// The command the hook hands back, or null when it leaves the command alone.
const rewrite = (command) => {
  const { stdout } = run(JSON.stringify({ tool_input: { command, timeout: 5 } }));

  return stdout ? JSON.parse(stdout).hookSpecificOutput.updatedInput.command : null;
};

describe('FEATURE: nul-guard', () => {
  describe('GIVEN a redirect to the bare word nul outside quotes', () => {
    const cases = [
      ['dir 2>nul', 'dir 2>/dev/null'],
      ['dir >nul', 'dir >/dev/null'],
      ['dir 1>nul', 'dir 1>/dev/null'],
      ['dir 2>>nul', 'dir 2>>/dev/null'],
      ['dir > nul 2>&1', 'dir >/dev/null 2>&1'],
      ['dir >nul; ls', 'dir >/dev/null; ls'],
      ['dir 2>nul&&ls', 'dir 2>/dev/null&&ls'],
      ['(dir >nul)', '(dir >/dev/null)'],
      ['dir >nul|wc -l', 'dir >/dev/null|wc -l'],
      ['dir >nul\nls', 'dir >/dev/null\nls'],
    ];
    for (const [command, expected] of cases) {
      it(`WHEN the command is ${JSON.stringify(command)} THEN the redirect goes to /dev/null`, () => {
        assert.equal(rewrite(command), expected);
      });
    }

    it('WHEN the hook rewrites THEN the other tool_input fields are kept', () => {
      const { stdout } = run(JSON.stringify({ tool_input: { command: 'dir >nul', timeout: 5 } }));

      assert.deepEqual(JSON.parse(stdout).hookSpecificOutput, { hookEventName: 'PreToolUse', updatedInput: { command: 'dir >/dev/null', timeout: 5 } });
    });
  });

  describe('GIVEN a redirect to a file whose name only starts with nul', () => {
    for (const command of ['echo x > nul-guard.log', 'dir >nul.txt', 'dir 2>nul_1', 'dir >nulcheck.log', 'dir >null', 'dir >nul/out.txt', 'dir >nul"x"']) {
      it(`WHEN the command is ${JSON.stringify(command)} THEN it is left alone`, () => {
        assert.equal(rewrite(command), null);
      });
    }
  });

  describe('GIVEN a nul redirect inside quotes', () => {
    for (const command of ['cmd /c "ping -n 2 127.0.0.1 >nul"', "cmd /c 'dir 2>nul'", 'echo "use 2>nul on \\"cmd\\" only"', 'node -e "run(\'dir >nul\')"']) {
      it(`WHEN the command is ${JSON.stringify(command)} THEN it is left alone`, () => {
        assert.equal(rewrite(command), null);
      });
    }

    it('WHEN a bare nul redirect follows the quoted one THEN only the bare one is rewritten', () => {
      assert.equal(rewrite('cmd /c "dir >nul" 2>nul'), 'cmd /c "dir >nul" 2>/dev/null');
    });

    it('WHEN the quote character is backslash-escaped THEN the redirect after it is outside quotes and is rewritten', () => {
      assert.equal(rewrite('echo \\" >nul'), 'echo \\" >/dev/null');
    });
  });

  describe('GIVEN input the hook cannot use', () => {
    it('WHEN the command has no nul redirect THEN nothing is printed', () => {
      assert.equal(rewrite('ls -la 2>/dev/null'), null);
    });

    it('WHEN stdin is not JSON THEN nothing is printed and the exit code is 0', () => {
      const { status, stdout } = run('not json');

      assert.deepEqual([status, stdout], [0, '']);
    });

    it('WHEN the payload has no command THEN nothing is printed', () => {
      assert.equal(run(JSON.stringify({ tool_input: {} })).stdout, '');
    });
  });
});
