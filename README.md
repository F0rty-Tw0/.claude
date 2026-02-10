Make sure to update the director of your `.claude` folder based of your machine to:

# settings.json

```json
statusLine: {
  "command": "node C:\\Users\\artio\\.claude\\hud\\omc-hud.mjs"
}
```

# plugins/oh-my-claude/installed_plugins.json

```json
"plugins": {
  "oh-my-claudecode@omc": [
    {
      "installPath": "C:\\Users\\artio\\.claude\\plugins\\cache\\omc\\oh-my-claudecode\\4.1.10",
    }
  ]
}
```

# plugins/oh-my-claude/known_marketplaces.json

```json
"claude-plugins-official": {
  "installLocation": "C:\\Users\\artio\\.claude\\plugins\\marketplaces\\claude-plugins-official",
},
"omc": {
  "installLocation": "C:\\Users\\artio\\.claude\\plugins\\marketplaces\\omc",
}
```
