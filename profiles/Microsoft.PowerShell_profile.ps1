# Antigravity terminal blindness fix - See https://www.reddit.com/r/GeminiAI/comments/1ppik6d/
if ($env:ANTIGRAVITY_AGENT) {
    . "$HOME\Documents\PowerShell\env.ps1"
    function prompt { "$ " }
    return
}

. "$HOME\Documents\PowerShell\env.ps1"
Write-Host "Profile loaded successfully."
