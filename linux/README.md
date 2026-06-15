# Linux keyboard setup (GNOME + keyd)

Fixes from 2026-06-11. Two problems, one machine (Ubuntu GNOME, Wayland).

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
