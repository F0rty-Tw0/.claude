Start the mcp-proxy aggregation server on port 8808.

## Steps

1. Check if port 8808 is already in use:

```
powershell -Command "Get-NetTCPConnection -LocalPort 8808 -ErrorAction SilentlyContinue"
```

If the port is in use, try to connect to verify the proxy is healthy:

```
powershell -Command "(Invoke-RestMethod -Uri 'http://127.0.0.1:8808/status' -TimeoutSec 3).server_instances | ConvertTo-Json"
```

- If the status check succeeds, skip to step 3 to show current status.
- If the status check fails (proxy is stale/unresponsive), kill the process on port 8808 first:

```
netstat -ano | findstr "8808" | findstr "LISTENING"
```

Extract the PID (last column) and kill it:

```
powershell -Command "Stop-Process -Id <PID> -Force"
```

Then continue to step 2 to start a fresh proxy.

2. Start the proxy in the background:

```
powershell -Command "Start-Process -NoNewWindow -FilePath 'mcp-proxy' -ArgumentList '--port','8808','--pass-environment','--named-server-config','C:\Users\artio\.claude\mcp-proxy-servers.json'"
```

3. Wait 5 seconds for servers to initialize, then verify:

```
powershell -Command "Start-Sleep -Seconds 5; (Invoke-RestMethod -Uri 'http://127.0.0.1:8808/status').server_instances | ConvertTo-Json"
```

Report which servers are available to the user in a table.

## Stopping the proxy

If the user asks to stop/disconnect the proxy:

1. Find the PID:

```
netstat -ano | findstr "8808" | findstr "LISTENING"
```

2. Kill it (use the PID from the last column):

```
powershell -Command "Stop-Process -Id <PID> -Force"
```

Note: Do NOT use `taskkill /PID` from Git Bash — it mangles the `/PID` flag. Always use PowerShell `Stop-Process`.
