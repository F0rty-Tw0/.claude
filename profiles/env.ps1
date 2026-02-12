#----------------------------------------------------------------
# CORE SETUP AND CONFIGURATION
#----------------------------------------------------------------

# Set strict mode to catch common scripting errors.
Set-StrictMode -Version Latest

# Default working directory (skip in VS Code — it sets its own workspace folder).
if ($env:TERM_PROGRAM -ne 'vscode') {
    Set-Location D:\
}

# Disable module auto-loading for controlled, predictable startup performance.
#$PSModuleAutoLoadingPreference = 'None'

# Manually import core modules required for the profile script itself.
#Import-Module Microsoft.PowerShell.Utility
#Import-Module Microsoft.PowerShell.Management

#----------------------------------------------------------------
# PROMPT AND THEME INITIALIZATION
#----------------------------------------------------------------
Write-Host "Initializing Shell..."

# Oh My Posh: Initialize only if not already running in the current process.
# $OhMyPoshExecutionTime = Measure-Command {
#     if ($env:POSH_PID -ne $PID) {
#         oh-my-posh init pwsh --config "$env:POSH_THEMES_PATH/tokyonight_storm.omp.json" | Invoke-Expression
#     }
# }
# Only show timing if it actually ran the init
# if ($OhMyPoshExecutionTime.TotalMilliseconds -gt 1) {
#     Write-Host "-> Oh My Posh initialization took $($OhMyPoshExecutionTime.TotalMilliseconds) ms"
# }

#----------------------------------------------------------------
# LAZY LOADING FOR TERMINAL-ICONS (PERFORMANCE)
#----------------------------------------------------------------
# This section defers the loading of Terminal-Icons until it's first needed.
# This dramatically speeds up shell startup time.

# Create a flag to track if the module is loaded.
$global:TerminalIconsLoaded = $false

# Create a wrapper function for Get-ChildItem.
function Invoke-GetChildItemWithIcons {
    # Check if the module has been loaded in this session yet.
    if (-not $global:TerminalIconsLoaded) {
        Write-Host "[Lazy-Loading Terminal-Icons...]"
        $importTime = Measure-Command { Import-Module -Name Terminal-Icons }
        Write-Host "-> Module loaded in $($importTime.TotalMilliseconds) ms."
        # Set the flag so we don't load it again.
        $global:TerminalIconsLoaded = $true
    }
    
    # Execute the original Get-ChildItem command with all provided arguments.
    Get-ChildItem @PSBoundParameters
}

# Overwrite the built-in aliases to point to our new wrapper function.
Set-Alias -Name ls -Value Invoke-GetChildItemWithIcons -Option AllScope -Force
Set-Alias -Name dir -Value Invoke-GetChildItemWithIcons -Option AllScope -Force

#----------------------------------------------------------------
# CLAUDE CODE
#----------------------------------------------------------------
function Claude-Continue { claude @args }
New-Alias -Name cc -Value Claude-Continue -Force -Option AllScope

#----------------------------------------------------------------
# GIT ALIASES AND FUNCTIONS
#----------------------------------------------------------------
# (Your Git aliases remain unchanged as they are already efficient)

function Git-CheckoutMaster { git checkout master @args }
New-Alias -Name gcm -Value Git-CheckoutMaster -Force -Option AllScope

function Git-CheckoutBranch {
    param([Parameter(Mandatory = $true, Position = 0)][string]$BranchName)
    if ([string]::IsNullOrWhiteSpace($BranchName)) { Write-Error "Branch name cannot be empty."; return }
    git checkout -b $BranchName @args
}
New-Alias -Name gcb -Value Git-CheckoutBranch -Force -Option AllScope

if (Get-Alias -Name gc -ErrorAction SilentlyContinue) { Remove-Alias -Name gc -Force }
function Git-Checkout { git checkout @args }
New-Alias -Name gc -Value Git-Checkout -Force -Option AllScope

function Git-Pull { git pull origin @args }
New-Alias -Name gp -Value Git-Pull -Force -Option AllScope

function Git-PullMaster { git pull origin master @args }
New-Alias -Name gpm -Value Git-PullMaster -Force -Option AllScope

function Git-FetchMaster { git fetch origin --prune @args }
New-Alias -Name gfm -Value Git-FetchMaster -Force -Option AllScope

function Git-Status { git status -sb @args }
New-Alias -Name gs -Value Git-Status -Force -Option AllScope

#----------------------------------------------------------------
# CLEANUP UTILITIES
#----------------------------------------------------------------
function Remove-NodeModules {
    Get-ChildItem -Path . -Recurse -Directory -Force | Where-Object {
        $_.Name -in @('node_modules', '.nx', '.angular', 'dist', 'tmp', 'coverage')
    } | ForEach-Object {
        Write-Host "Removing folder: $($_.FullName)"
        Remove-Item -Path $_.FullName -Recurse -Force
    }
    Get-ChildItem -Path . -Recurse -File -Force | Where-Object {
        $_.Name -in @('pnpm-lock.yaml', 'package-lock.json')
    } | ForEach-Object {
        Write-Host "Removing file: $($_.FullName)"
        Remove-Item -Path $_.FullName -Force
    }
}
New-Alias -Name rmnm -Value Remove-NodeModules -Force -Option AllScope

Write-Host "Profile loaded successfully. Type 'ls' to activate Terminal-Icons."