Start the mcp-proxy aggregation server on port 8808.

## Steps

1. Check if port 8808 is already in use:

```
powershell -Command "Get-NetTCPConnection -LocalPort 8808 -ErrorAction SilentlyContinue"
```

If the port is in use, skip to step 3 to show current status.

2. Start the proxy in the background:

```
powershell -Command "Start-Process -NoNewWindow -FilePath 'mcp-proxy' -ArgumentList '--port','8808','--pass-environment','--named-server-config','C:\Users\artio\.claude\mcp-proxy-servers.json'"
```

3. Wait 5 seconds for servers to initialize, then verify:

```
powershell -Command "Start-Sleep -Seconds 5; (Invoke-RestMethod -Uri 'http://127.0.0.1:8808/status').server_instances | ConvertTo-Json"
```

Report which servers are available to the user in a table.
