# Terminal Default Locations

All terminals configured to open in `D:\` by default.

## Command Prompt Shortcut (Start Menu)

**Path:** `C:\Users\ArtiomTofan\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\System Tools\Command Prompt.lnk`
**Change:** Set "Start in" (WorkingDirectory) from `%HOMEDRIVE%%HOMEPATH%` to `D:\`

```powershell
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut("C:\Users\ArtiomTofan\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\System Tools\Command Prompt.lnk")
$s.WorkingDirectory = "D:\"
$s.Save()
```

## cmd.exe via Run Dialog (Win+R)

**Registry:** `HKCU\Software\Microsoft\Command Processor\Autorun`
**Value:** `cd /d D:\`
**Scope:** Applies to all cmd.exe instances (Run dialog, scripts, etc.)

```powershell
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Command Processor" -Name "Autorun" -Value "cd /d D:\" -Type String
```

## PowerShell

**Config:** `env.ps1` profile (line 9)
**Method:** `Set-Location D:\` — guarded with `$env:TERM_PROGRAM -ne 'vscode'` so VS Code terminals use the workspace folder instead

