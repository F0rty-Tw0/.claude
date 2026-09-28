#!/usr/bin/env node
// PreToolUse guard: blocks `gh pr create` / `gh pr edit --body…` unless the PR body has a `## Proof` section.
// Enforces "every PR ships with proof" (code-review skill, proof mode) mechanically instead of by prose.
// ponytail: checks the heading exists, not that the proof is real — the code-review reviewer judges content.
const fs = require('fs');

let raw = '';
try { raw = fs.readFileSync(0, 'utf8'); } catch { process.exit(0); }
let cmd = '';
try { cmd = (JSON.parse(raw).tool_input || {}).command || ''; } catch { process.exit(0); }

// matches `gh pr create`, `rtk gh pr edit`, `/usr/bin/gh pr create`, also after `&&`, `;`, `|`
const ghPr = cmd.match(/(^|[;&|]\s*|\s)(rtk\s+)?(\S*\/)?gh\s+pr\s+(create|edit)\b/);
if (!ghPr) process.exit(0);

const isCreate = ghPr[4] === 'create';
const bodyFile = cmd.match(/(?:--body-file|-F)[\s=]+(['"]?)([^\s'"]+)\1/);
const hasInlineBody = /(?:--body|-b)[\s=]/.test(cmd.replace(/--body-file/g, ''));

// `gh pr edit` that doesn't touch the body (labels, reviewers, title) is fine
if (!isCreate && !bodyFile && !hasInlineBody) process.exit(0);

const hasProof = (text) => /(^|["'])[ \t]*## Proof\b/m.test(text); // quote: inline body may open with the heading

let body = '';
if (bodyFile) {
  try { body = fs.readFileSync(bodyFile[2], 'utf8'); } catch { body = ''; }
} else {
  body = cmd.replace(/\\n/g, '\n'); // inline --body / heredoc: the text is inside the command itself
}
if (hasProof(body)) process.exit(0);

process.stderr.write(
  'pr-proof-guard: PR body has no `## Proof` section. Load the pr-description skill: its Step 0 builds proof with ' +
  'the code-review skill (proof mode + fresh review) and appends `## Proof`. Then pass the full body via --body or --body-file.'
);
process.exit(2);
