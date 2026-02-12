#----------------------------------------------------------------
# GIT ALIASES AND FUNCTIONS
#----------------------------------------------------------------
function Git-CheckoutMaster { git checkout master @args }
New-Alias -Name gcm -Value Git-CheckoutMaster -Force -Option AllScope

function Git-CheckoutBranch {
    param ([Parameter(Mandatory = $true, Position = 0)][string]$BranchName)
    if ([string]::IsNullOrWhiteSpace($BranchName)) {
        Write-Error "Branch name cannot be empty. Usage: gcb <new-branch-name>"
        return
    }
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
