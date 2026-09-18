# ---- PATH ----
# Ensure user-local bin (starship etc.) is on PATH
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) export PATH="$HOME/.local/bin:$PATH" ;;
esac

# ---- History (big, shared, de-duped) ----
HISTFILE=~/.zsh_history
HISTSIZE=50000
SAVEHIST=50000
setopt SHARE_HISTORY          # all tabs/panes share one history
setopt HIST_IGNORE_DUPS       # don't store consecutive duplicates
setopt HIST_IGNORE_SPACE      # commands starting with space aren't saved
setopt HIST_REDUCE_BLANKS     # trim extra whitespace
setopt EXTENDED_HISTORY       # record timestamps
setopt INC_APPEND_HISTORY     # write as you go, not on exit

# ---- Navigation quality-of-life ----
setopt AUTO_CD                # type a dir name to cd into it
setopt AUTO_PUSHD             # cd pushes onto a dir stack
setopt PUSHD_IGNORE_DUPS
# The following lines were added by compinstall
zstyle :compinstall filename "$HOME/.zshrc"

autoload -Uz compinit
compinit
# End of lines added by compinstall

# --- Shared shell aliases/functions (single source of truth with bash) ---
[ -f ~/.bash_aliases ] && source ~/.bash_aliases

# Color aliases (these lived in ~/.bashrc, not ~/.bash_aliases)
alias grep='grep --color=auto'
alias fgrep='fgrep --color=auto'
alias egrep='egrep --color=auto'

# ---- Aliases (Ubuntu/Debian renamed binaries) ----
command -v fdfind >/dev/null 2>&1 && alias fd='fdfind'
command -v batcat >/dev/null 2>&1 && alias bat='batcat'

# ---- fzf: use fd (fast, .gitignore-aware, shows dotfiles, skips .git) ----
if command -v fdfind >/dev/null 2>&1; then
  export FZF_DEFAULT_COMMAND='fdfind --type f --hidden --exclude .git'
  export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
  export FZF_ALT_C_COMMAND='fdfind --type d --hidden --exclude .git'
fi
command -v fzf >/dev/null 2>&1 && source <(fzf --zsh)

# Icon-enabled ls via eza (zsh equivalent of PowerShell Terminal-Icons).
# eza is a compiled binary -> no startup cost -> no lazy-load needed.
# Falls back to plain colored ls if eza not installed.
if command -v eza >/dev/null 2>&1; then
  alias ls='eza --icons --group-directories-first'
  alias ll='eza -alF --icons --group-directories-first'
  alias la='eza -A --icons'
  alias l='eza -CF --icons'
else
  alias ls='ls --color=auto'
  alias ll='ls -alF'
  alias la='ls -A'
  alias l='ls -CF'
fi

# --- Word navigation / deletion (emacs keymap) ---
bindkey -e
bindkey '^[[3;5~' kill-word           # Ctrl+Delete    -> delete word forward
bindkey '^H'      backward-kill-word   # Ctrl+Backspace -> delete word backward
bindkey '^W'      backward-kill-word   # Ctrl+W         -> delete word backward (consistent)
bindkey '^[^?'    backward-kill-line   # Alt+Backspace  -> delete to start of line
bindkey '^[[1;5C' forward-word         # Ctrl+Right
bindkey '^[[1;5D' backward-word        # Ctrl+Left

# --- Completion & autosuggestions ---
# Highlighted, arrow-navigable Tab menu
zstyle ':completion:*' menu select
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}'   # case-insensitive
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"     # colored matches
zstyle ':completion:*' use-cache on
zstyle ':completion:*:descriptions' format '%F{yellow}%d%f'

# Fish-style inline autosuggestions (greyed ghost text; accept with → )
source /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh

# ---- Prompt: starship (activates automatically once installed) ----
command -v starship >/dev/null 2>&1 && eval "$(starship init zsh)"

# Command syntax highlighting — MUST be sourced last
source /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
