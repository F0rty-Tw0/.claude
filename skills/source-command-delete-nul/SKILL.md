---
name: "source-command-delete-nul"
description: "Migrated source command `delete-nul`"
---

# source-command-delete-nul

Use this skill when the user asks to run the migrated source command `delete-nul`.

## Command Template

Delete Windows reserved `nul` files from the current directory.

```
Remove-Item -LiteralPath "\\?\$PWD\nul" -Force
```
