$ws = New-Object -ComObject WScript.Shell
$path = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\System Tools\Command Prompt.lnk"
if (Test-Path $path) {
    $s = $ws.CreateShortcut($path)
    Write-Host "Current WorkingDirectory:" $s.WorkingDirectory
    $s.WorkingDirectory = "D:\"
    $s.Save()
    Write-Host "Updated to: D:\"
} else {
    Write-Host "Shortcut not found at: $path"
}
