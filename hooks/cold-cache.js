#!/usr/bin/env node
// UserPromptSubmit guard: stops the first prompt after the session's prompt cache expired,
// because that prompt silently re-caches the whole conversation. A blocked prompt makes no
// API request, so the stop is free. Ported (minus the cost ledger) from
// https://github.com/vzakharov/muthur/blob/main/.claude/cold-cache/CLAUDE.md
//
// - Cold = the transcript's last main-chain response is older than the TTL the session's own
//   cache writes used (1h if any response wrote 1h cache, else 5m).
// - The shared system/tool prefix stays warm, so the first response's cache read is subtracted.
// - Once per cold spell: a block records the last response id; the next prompt against that id
//   passes. A bare `!` resends the stopped prompt (a hook can't rewrite prompts, so it passes `!`
//   with context telling the model to act on the stored one).
// - /compact pays the same re-cache (it's a request at full context); only /clear skips it.
//
// Registered in settings.json for local sessions and in the f42 plugin's hooks.json for cloud. Env: COLD_CACHE_GUARD=off
// disables (set it in settings.json `env`, or a project's .claude/settings.local.json for one repo);
// COLD_CACHE_MIN_TOKENS (default 50000) skips small re-caches.
// ponytail: thresholds in tokens, not dollars — no price table to rot. Add one if $ matters.
const fs = require('fs');
const path = require('path');
const os = require('os');

const RESEND = '!';
const TTL_1H = 3600;
const TTL_5M = 300;

// Commands that shed context or make no model request over this session's context, per
// https://code.claude.com/docs/en/commands. Skills and model-prompting built-ins are stopped.
const PASSES = new Set(`
  compact clear reset new
  add-dir advisor agents android app artifacts auto-mode-setup autocompact
  bashes branch bug cd checkpoint chrome color config context continue copy
  cost design-login desktop diff effort exit export fast feedback focus
  heapdump help hooks ide import install-github-app install-slack-app ios
  keybindings list-agents login logout mcp memory mobile model output-style
  passes permissions allowed-tools plugin powerup privacy-settings quit radio
  rate-limit-options rc release-notes reload-plugins reload-skills
  remote-control remote-env rename resume rewind sandbox scroll-speed settings
  setup-bedrock setup-vertex share skill-doctor skills stats status stickers
  stop tasks teleport terminal-setup theme tp tui undo upgrade usage
  usage-credits voice web-setup workflows
`.split(/\s+/).filter(Boolean));

const passes = (prompt) => {
  const word = prompt.split(/\s+/)[0];
  return word.startsWith('/') && PASSES.has(word.slice(1));
};

const contextOf = (usage) =>
  (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) +
  (usage.cache_read_input_tokens || 0) + (usage.output_tokens || 0);

// First and last main-chain responses, and the TTL the session's cache writes used.
function readHistory(file) {
  let first, last, hour = false;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('"type":"assistant"')) continue; // skip parsing the bulk of the file
    let record;
    try { record = JSON.parse(line); } catch { continue; } // the line Claude Code is still writing
    const message = record.message || {};
    if (record.type !== 'assistant' || record.isSidechain || !message.usage || message.model === '<synthetic>') continue;
    first = first || record;
    last = record;
    if ((message.usage.cache_creation || {}).ephemeral_1h_input_tokens > 0) hour = true;
  }
  return last && { first, last, ttl: hour ? TTL_1H : TTL_5M };
}

const span = (s) => (s >= 5400 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 60)} min`);
const kilo = (t) => `${Math.round(t / 1000)}k`;

function main() {
  if (process.env.COLD_CACHE_GUARD === 'off') return;
  const minTokens = Number(process.env.COLD_CACHE_MIN_TOKENS || 50000);
  const event = JSON.parse(fs.readFileSync(0, 'utf8'));
  const session = event.session_id || '';
  if (!/^[\w-]+$/.test(session)) return; // also keeps the state path inside its dir
  const prompt = (event.prompt || '').trim();
  if (passes(prompt) || !event.transcript_path || !fs.existsSync(event.transcript_path)) return;

  const history = readHistory(event.transcript_path);
  if (!history) return;
  const lastId = history.last.message.id;
  const stateDir = path.join(os.tmpdir(), 'claude-cold-cache');
  const stateFile = path.join(stateDir, `${session}.json`);
  let state = {};
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch {}
  if (state.after === lastId) {
    if (prompt === RESEND && typeof state.prompt === 'string') {
      const additionalContext = `The user's \`${RESEND}\` resends the prompt the cold-cache guard stopped. ` +
        `Act on that prompt exactly as if they had sent it again, verbatim:\n\n${state.prompt}`;
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext } }));
    }
    return; // already stopped once this cold spell
  }

  const idle = Date.now() / 1000 - Date.parse(history.last.timestamp) / 1000;
  if (!(idle > history.ttl)) return;
  const context = contextOf(history.last.message.usage);
  const shared = Math.min(history.first.message.usage.cache_read_input_tokens || 0, context);
  const recache = context - shared;
  if (recache < minTokens) return;

  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify({ after: lastId, prompt }));
  const reason = [
    `Prompt cache expired: ${span(idle)} since the last response (TTL ${span(history.ttl)}),`,
    `~${kilo(recache)} tokens to re-cache${shared ? ` (~${kilo(shared)} shared prefix still warm)` : ''}.`,
    `This message was not sent: send ${RESEND} alone to send it as written, send anything else to carry on`,
    'with that instead, or /clear for a fresh session if everything the work needs is on disk',
    '(/compact pays the same re-cache).',
  ].join(' ');
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
}

try { main(); } catch (e) {
  process.stderr.write(`cold-cache: ${e.message}; prompt let through.\n`); // never break prompting
}
