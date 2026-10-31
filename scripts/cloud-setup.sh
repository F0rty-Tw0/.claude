#!/usr/bin/env bash
# Cloud session setup: mirrors this repo into ~/.claude so cloud sessions get what local ones do
# (CLAUDE.md, AGENTS.md, agents, skills, commands, hooks, scripts, settings).
#
# Environment setup script (claude.ai → environment → setup script):
#   /opt/node22/bin/claude plugin marketplace add F0rty-Tw0/.claude \
#     && bash ~/.claude/plugins/marketplaces/f42/scripts/cloud-setup.sh || true
# Don't also `plugin install f42@f42`: every agent and skill would load twice (executor + f42:executor).
set -euo pipefail

src="$(cd "$(dirname "$0")/.." && pwd)"
dst="$HOME/.claude"
mkdir -p "$dst"

# Files: everything tracked except git metadata and settings (merged below). Harness files in ~/.claude stay.
tar -C "$src" --exclude=./.git --exclude=./settings.json --exclude=./settings.local.json -cf - . | tar -C "$dst" -xf -

# Settings: merge ours over what the harness and marketplace add wrote. Dropped keys belong to the cloud
# session (model, permission mode) or need a local machine (status line, LSP and HUD plugins, remote control).
[ -f "$dst/settings.json" ] || echo '{}' >"$dst/settings.json"
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
' "$dst/settings.json" "$src/settings.json" >"$dst/settings.json.tmp"
mv "$dst/settings.json.tmp" "$dst/settings.json"

echo "cloud-setup: mirrored $src → $dst (rtk: $has_rtk)"
