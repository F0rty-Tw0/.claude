Delete Windows reserved `nul` files from the current directory.

Windows reserved filenames (`nul`, `con`, `aux`, `prn`, etc.) cannot be deleted with standard shell commands. PowerShell's `Remove-Item` with `-LiteralPath` and the `\\?\` extended-length path prefix handles this.

## Steps

1. Run this PowerShell command:

```
Remove-Item -LiteralPath "\\?\$PWD\nul" -Force
```

2. Run `git status --short` to confirm the `nul` file is no longer listed.

Report the result to the user.
