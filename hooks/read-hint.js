#!/usr/bin/env node
// PreToolUse hint: a Bash cat/sed/head/tail is not a Read, so Edit/Write still
// fail on that file. Never blocks; prints additionalContext only after a read.
const READERS = new Set(['cat', 'sed', 'head', 'tail', 'bat', 'nl', 'less']);
const WRAPPERS = new Set(['rtk', 'sudo']);
const MAX_NAMED = 3;

const stripHeredocBodies = (cmd) => cmd
  .replace(/(<<-?\s*(['"]?)(\w+)\2[^\n]*)\n[\s\S]*?\n\3(?=\n|$)/g, '$1');

// Quote-aware split into segments of words; `redirect` marks an unquoted < or >.
function segments(cmd) {
  const result = [];
  let current = { words: [], redirect: false };
  let word = null;
  let quote = '';
  const endWord = () => { if (word !== null) current.words.push(word); word = null; };
  const endSegment = () => { endWord(); result.push(current); current = { words: [], redirect: false }; };

  for (let i = 0; i < cmd.length; i += 1) {
    const ch = cmd[i];
    if (quote) {
      if (ch === quote) quote = '';
      else word += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; word ??= ''; continue; }
    if (ch === '\\' && i + 1 < cmd.length) { word = (word ?? '') + cmd[i + 1]; i += 1; continue; }
    if (ch === '>' || ch === '<') current.redirect = true;
    if (ch === '&' && cmd[i + 1] === '&') { endSegment(); i += 1; continue; }
    if (ch === '|' && cmd[i + 1] === '|') { endSegment(); i += 1; continue; }
    if (ch === ';' || ch === '|' || ch === '\n') { endSegment(); continue; }
    if (/\s/.test(ch)) { endWord(); continue; }
    word = (word ?? '') + ch;
  }
  endSegment();

  return result;
}

function operands(words) {
  const [name, ...args] = words;
  const scriptFlag = name === 'sed' && args.some((a) => a === '-e' || a === '-f' || a === '--expression' || a === '--file');
  let skipScript = name === 'sed' && !scriptFlag;
  const files = [];
  for (const arg of args) {
    if (arg === '-' || /^-\d*$/.test(arg) || /^\d+$/.test(arg)) continue;
    if (arg.startsWith('-')) continue;
    if (skipScript) { skipScript = false; continue; }
    files.push(arg);
  }

  return files;
}

function readTargets(cmd) {
  const found = [];
  for (const { words, redirect } of segments(stripHeredocBodies(cmd))) {
    const rest = [...words];
    while (rest.length && (/^\w+=/.test(rest[0]) || WRAPPERS.has(rest[0]))) rest.shift();
    const inPlace = rest[0] === 'sed' && rest.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'));
    if (!READERS.has(rest[0]) || redirect || inPlace) continue;
    found.push(...operands(rest));
  }

  return [...new Set(found)];
}

function main() {
  let input;
  try { input = JSON.parse(require('fs').readFileSync(0, 'utf8')); } catch { return; }
  const cmd = input?.tool_input?.command;
  const targets = typeof cmd === 'string' ? readTargets(cmd) : [];
  if (!targets.length) return;
  const named = targets.slice(0, MAX_NAMED).join(', ');
  const additionalContext = `Bash read of ${named} does not count as a Read. Before Edit/Write on a file, open it with the Read tool (offset/limit for a slice).`;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext } }) + '\n');
}

if (require.main === module) main();
module.exports = { readTargets };
