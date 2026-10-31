#!/usr/bin/env bash
# Cloud session setup: mirrors this repo into ~/.claude so cloud sessions get what local ones do
# (CLAUDE.md, AGENTS.md, agents, skills, commands, hooks, scripts, settings).
#
# Environment setup script (claude.ai → environment → setup script):
#   /opt/node22/bin/claude plugin marketplace add F0rty-Tw0/.claude && { /opt/node22/bin/claude plugin marketplace update f42; bash ~/.claude/plugins/marketplaces/f42/scripts/cloud-setup.sh || /opt/node22/bin/claude plugin install f42@f42; } || true
# `update` matters: the environment keeps its old clone between sessions, and `add` on an existing clone
# pulls nothing, so without it this script and the mirror stay at the first setup's commit. A failed
# update still runs the clone on disk.
# The plugin is only the fallback: with both, every agent and skill loads twice (executor + f42:executor),
# so the merge below disables it.
set -euo pipefail

src="$(cd "$(dirname "$0")/.." && pwd)"
dst="$HOME/.claude"
[ "$src" -ef "$dst" ] && { echo "cloud-setup: $dst is the repo itself, nothing to do"; exit 0; }
mkdir -p "$dst"

# Settings: merge ours over what the harness and marketplace add wrote. Dropped keys belong to the cloud
# session (model, permission mode) or need a local machine (status line, LSP and HUD plugins, remote control).
[ -f "$dst/settings.json" ] || echo '{}' >"$dst/settings.json"
trap 'rm -f "$dst/settings.json.tmp"' EXIT
has_rtk=$(command -v rtk >/dev/null && echo 1 || echo 0)
gitconfig="$dst/cloud.gitconfig"
jq -s --arg has_rtk "$has_rtk" --arg gitconfig "$gitconfig" '
  (.[1].enabledPlugins // {} | with_entries(select(.value == false))) as $off
  | (.[1]
    | del(.model, .permissions, .defaultMode, .statusLine, .enabledPlugins, .extraKnownMarketplaces, .remoteControlAtStartup)
    # No rtk in the image: its hook fails, and cpu-guard rewrites heavy commands to `rtk <cmd>`.
    | if $has_rtk == "1" then . else
        .hooks.PreToolUse |= map(select(all(.hooks[]; .command | test("^rtk |cpu-guard") | not)))
      end
    # Git identity: see cloud.gitconfig below.
    | .env.GIT_CONFIG_GLOBAL = $gitconfig
  ) as $ours
  | .[0] * $ours
  # Keep the plugins switched off locally (f42@synced: the stale copy claude.ai syncs in), and the f42 plugin,
  # which the mirror replaces.
  | .enabledPlugins += $off + {"f42@f42": false}
' "$dst/settings.json" "$src/settings.json" >"$dst/settings.json.tmp"

# Files: the whole checkout except git metadata and settings. Copied only after the merge succeeded, so a
# failure leaves ~/.claude untouched and the plugin fallback doesn't load on top of a half mirror.
# Harness files in ~/.claude stay.
tar -C "$src" --exclude=./.git --exclude=./settings.json --exclude=./settings.local.json -cf - . | tar -C "$dst" -xf -
# The harness commits as Claude <noreply@anthropic.com> and rewrites ~/.gitconfig at worker start, so GitHub
# squash-merges add `Co-authored-by: Claude`. GIT_CONFIG_GLOBAL (set in the merged env) points git here instead:
# the harness file is included first, so its later rewrites still apply, then the user identity wins. Unsigned,
# because the harness signing key is not on the GitHub account of the user (a signed commit shows Unverified).
# Not GIT_CONFIG_COUNT/KEY_n: the harness already uses those slots for credential and insteadOf settings.
cat >"$gitconfig" <<EOF
[include]
	path = $HOME/.gitconfig
[user]
	name = Artiom Tofan
	email = 60610474+F0rty-Tw0@users.noreply.github.com
[commit]
	gpgsign = false
EOF
mv "$dst/settings.json.tmp" "$dst/settings.json"

echo "cloud-setup: mirrored $src → $dst (rtk: $has_rtk)"
