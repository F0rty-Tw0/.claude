# ~/.bash_aliases — sourced by ~/.bashrc
# Ported from Microsoft.PowerShell_profile.ps1

#----------------------------------------------------------------
# CLAUDE CODE 
#----------------------------------------------------------------
# NOTE: `cc` shadows the C compiler. Use `/usr/bin/cc` for the compiler.
alias cc='claude'

#----------------------------------------------------------------
# GIT ALIASES AND FUNCTIONS
#----------------------------------------------------------------
alias gcm='git checkout master'
alias gc='git checkout'
alias gp='git pull origin'
alias gpm='git pull origin master'
alias gpo='git push origin'
alias gfo='git fetch origin --prune'
# NOTE: `gs` shadows Ghostscript. Use `/usr/bin/gs` for Ghostscript.
alias gs='git status -sb'

# gcb <branch> — create and switch to a new branch
gcb() {
    if [ -z "$1" ]; then
        echo "Branch name cannot be empty." >&2
        return 1
    fi
    git checkout -b "$@"
}

#----------------------------------------------------------------
# MCP PROXY
#----------------------------------------------------------------
start-mcp() {
    # Ensure node/pnpm are on PATH even in non-interactive contexts (cron, scripts)
    command -v node >/dev/null 2>&1 || { export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" >/dev/null 2>&1; }
    nohup mcp-proxy \
        --port 8808 \
        --pass-environment \
        --named-server-config "$HOME/.claude/mcp-proxy-servers.json" \
        >"$HOME/.cache/mcp-proxy.log" 2>&1 &
    disown
    local pid=$!
    sleep 2
    if kill -0 "$pid" 2>/dev/null; then
        echo "mcp-proxy starting (pid $pid) — binding 8808 (pnpm dlx may take a while on first run)"
        echo "log: ~/.cache/mcp-proxy.log"
    else
        echo "mcp-proxy FAILED to start — last log lines:"
        tail -5 "$HOME/.cache/mcp-proxy.log"
    fi
}

# stop-mcp — terminate all running mcp-proxy instances (and their child servers)
stop-mcp() {
    if pkill -f 'bin/mcp-proxy'; then
        echo "mcp-proxy stopped"
    else
        echo "no mcp-proxy running"
    fi
}

#----------------------------------------------------------------
# CLEANUP UTILITIES
#----------------------------------------------------------------
# rmnm — recursively remove build/dependency artifacts and lockfiles
rmnm() {
    find . -type d \( \
        -name node_modules -o \
        -name .nx -o \
        -name .angular -o \
        -name dist -o \
        -name tmp -o \
        -name coverage \
    \) -prune -print -exec rm -rf {} +
    find . -type f \( \
        -name pnpm-lock.yaml -o \
        -name package-lock.json \
    \) -print -delete
}
