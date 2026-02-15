Start the mcp-proxy aggregation server on port 8808.

```
powershell -Command "Start-Process -NoNewWindow -FilePath 'mcp-proxy' -ArgumentList '--port','8808','--pass-environment','--named-server-config','C:\Users\artio\.claude\mcp-proxy-servers.json'"
```

- If starting the server fails (proxy is stale/unresponsive), kill the process on port 8808 first:

```
netstat -ano | findstr "8808" | findstr "LISTENING"
```

Extract the PID (last column) and kill it:

```
powershell -Command "Stop-Process -Id <PID> -Force"
```
