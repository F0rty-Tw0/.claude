# Linux setup

Backups + notes for this machine (Ubuntu GNOME, Wayland).

## Shell configs (backup)

Snapshots of the live dotfiles in `~`. Restore by copying back with the dot:

```bash
cp zshrc        ~/.zshrc
cp bashrc       ~/.bashrc
cp bash_aliases ~/.bash_aliases
cp profile      ~/.profile
```

- [zshrc](zshrc) — main zsh: history, plugins, fzf, eza, keybinds, starship
- [bashrc](bashrc) — bash defaults + nvm
- [bash_aliases](bash_aliases) — shared git/mcp aliases + functions (sourced by both)
- [profile](profile) — login PATH + `DISABLE_TELEMETRY`

Not backed up: `.zsh/` (plugin git repos), `.omp/` (oh-my-posh binary) — reinstall instead.

## Agent shells

`claude-shell.zsh` sets `nonomatch` when `CLAUDECODE` is set, so an unmatched glob (`echo 100*141/118`) passes through literally, like bash, instead of `zsh: no matches found`. Human shells keep zsh's strict default.

Copy the source line from `.zshrc` into the live `~/.zshrc`, then start a new Claude Code session (the shell snapshot is built at start).

`find` in agent shells is a function Claude Code injects into its snapshot (embedded bfs), so no rc file can unset it. A bare `-dir` fails for real `find` too; use `find ./-dir`.

# Keyboard setup (GNOME + keyd)

Fixes from 2026-06-11. Two problems, one machine.

## 1. VS Code multi-cursor (Ctrl+Alt+Up/Down)

GNOME grabbed Ctrl+Alt+Arrow for workspace switching, so VS Code never saw it.
Workspace switching still works via Super+PageUp/Down.

```bash
gsettings set org.gnome.desktop.wm.keybindings switch-to-workspace-up "['<Super>Page_Up']"
gsettings set org.gnome.desktop.wm.keybindings switch-to-workspace-down "['<Super>Page_Down']"
```

## 2. Windows-style language switch (tap Ctrl+Shift)

XKB's `grp:ctrl_shift_toggle` fires even mid-combo (Ctrl+Shift+P switched layout).
Replaced with keyd: tap Ctrl+Shift alone switches layout, Ctrl+Shift+key does not.

How it works: keyd `overload` fires the tap action only when the key is
released with no other key pressed in between. The tap emits Super+space,
which GNOME has bound to switch-input-source.

```bash
sudo apt install keyd                      # Debian ships the binary as keyd.rvaiya
sudo cp keyd-default.conf /etc/keyd/default.conf
sudo keyd.rvaiya reload                    # or: sudo systemctl restart keyd

# Drop the misfiring XKB option, bind GNOME's switcher to what keyd emits
gsettings set org.gnome.desktop.input-sources xkb-options "[]"
gsettings set org.gnome.desktop.wm.keybindings switch-input-source "['<Super>space']"
gsettings set org.gnome.desktop.wm.keybindings switch-input-source-backward "['<Shift><Super>space']"
```

Config lives in [keyd-default.conf](keyd-default.conf).

Known quirk: Ctrl+Shift+mouse-click still switches layout (keyd cannot see the mouse).
