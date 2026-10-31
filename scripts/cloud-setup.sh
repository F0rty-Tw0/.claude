#!/usr/bin/env bash
# Cloud session setup: mirrors this repo into ~/.claude so cloud sessions get what local ones do
# (CLAUDE.md, AGENTS.md, agents, skills, commands, hooks, scripts, settings).
#
# Environment setup script (claude.ai → environment → setup script):
#   /opt/node22/bin/claude plugin marketplace add F0rty-Tw0/.claude && { bash ~/.claude/plugins/marketplaces/f42/scripts/cloud-setup.sh || /opt/node22/bin/claude plugin install f42@f42; } || true
# The plugin is only the fallback: with both, every agent and skill loads twice (executor + f42:executor),
# so the merge below disables it.
set -euo pipefail

src="$(cd "$(dirname "$0")/.." && pwd)"
dst="$HOME/.claude"
[ "$src" -ef "$dst" ] && { echo "cloud-setup: $dst is the repo itself, nothing to do"; exit 0; }
mkdir -p "$dst"

# Files: the whole checkout except git metadata and settings (merged below). Harness files in ~/.claude stay.
tar -C "$src" --exclude=./.git --exclude=./settings.json --exclude=./settings.local.json -cf - . | tar -C "$dst" -xf -

# Settings: merge ours over what the harness and marketplace add wrote. Dropped keys belong to the cloud
# session (model, permission mode) or need a local machine (status line, LSP and HUD plugins, remote control).
[ -f "$dst/settings.json" ] || echo '{}' >"$dst/settings.json"
trap 'rm -f "$dst/settings.json.tmp"' EXIT
has_rtk=$(command -v rtk >/dev/null && echo 1 || echo 0)
jq -s --arg has_rtk "$has_rtk" '
  (.[1]
    | del(.model, .permissions, .defaultMode, .statusLine, .enabledPlugins, .extraKnownMarketplaces, .remoteControlAtStartup)
    # No rtk in the image: its hook fails, and cpu-guard rewrites heavy commands to `rtk <cmd>`.
    | if $has_rtk == "1" then . else
        .hooks.PreToolUse |= map(select(all(.hooks[]; .command | test("^rtk |cpu-guard") | not)))
      end
  ) as $ours
  | .[0] * $ours
  | .enabledPlugins["f42@f42"] = false
' "$dst/settings.json" "$src/settings.json" >"$dst/settings.json.tmp"
mv "$dst/settings.json.tmp" "$dst/settings.json"

echo "cloud-setup: mirrored $src → $dst (rtk: $has_rtk)"
