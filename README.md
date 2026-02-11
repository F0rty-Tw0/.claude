# Claude Code Configuration

## Step 1: Install Claude Code

```powershell
irm https://claude.ai/install.ps1 | iex
```

## Step 2: Install oh-my-claudecode

Run these commands inside Claude Code:

```
/plugin marketplace add https://github.com/Yeachan-Heo/oh-my-claudecode
/plugin install oh-my-claudecode
```

## Step 3: Setup

```
/oh-my-claudecode:omc-setup
```

## Step 4: Update settings.json

Replace the username in `statusLine.command` to match your machine:

```json
"statusLine": {
  "type": "command",
  "command": "node C:\\Users\\<YOUR_USERNAME>\\.claude\\hud\\omc-hud.mjs"
}
```
