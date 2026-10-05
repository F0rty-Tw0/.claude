#!/usr/bin/env node
// SessionStart hook (plugin): injects the always-on rules into cloud sessions only.
// Locally ~/.claude/CLAUDE.md already @-imports these, so injecting again would duplicate them.
//
// Usage: node cloud-context.js <part>. Claude Code cuts each hook's context to a 2KB preview
// above ~10KB, so the text is split at "## " headings into <=9000-char parts, one hook per part.
const fs = require('fs');
const path = require('path');

if (process.env.CLAUDE_CODE_REMOTE !== 'true') process.exit(0);

const MAX = 9000;
const root = path.join(__dirname, '..');
const files = ['AGENTS.md', 'skills/grug/SKILL.md'];
const text = files
  .map(f => {
    try {
      return fs.readFileSync(path.join(root, f), 'utf8');
    } catch {
      return ''; // ponytail: a missing file just drops that section, no reason to fail the session
    }
  })
  .join('\n\n');

const parts = [''];
for (const section of text.split(/(?=\n## )/)) {
  if (parts[parts.length - 1].length + section.length > MAX) parts.push('');
  parts[parts.length - 1] += section;
}

// ponytail: hooks.json runs a fixed number of parts; add an entry there if the rules outgrow it
const part = parts[Number(process.argv[2])];
if (!part) process.exit(0);
process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: part.slice(0, MAX) },
}));
