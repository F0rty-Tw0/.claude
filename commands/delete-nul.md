Delete Windows reserved `nul` files from the current directory.

```
Remove-Item -LiteralPath "\\?\$PWD\nul" -Force
```
