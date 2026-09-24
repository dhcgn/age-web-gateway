---
name: devcontainer-debug-windows
description: Debug DevContainer startup failures on Windows using @devcontainers/cli with trace logging to devcontainer-up.log. Use when DevContainer fails to build or start, `devcontainer up` errors, or user mentions devcontainer-up.log.
---

# DevContainer Debug (Windows)

Reproduce the failure with trace logging, then read the tail of the log.

## Prerequisites

```powershell
winget install OpenJS.NodeJS.LTS
npm install -g @devcontainers/cli
devcontainer --version
```

## Reproduce with trace log (PowerShell)

```powershell
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8
# No spinners or progress bars: the output goes to a log, not a terminal.
$env:CI = "true"; $env:NPM_CONFIG_PROGRESS = "false"; $env:NPM_CONFIG_LOGLEVEL = "error"
rm devcontainer-up.log
devcontainer up --workspace-folder . --remove-existing-container --log-level trace 2>&1 | Tee-Object -FilePath devcontainer-up.log
```

## Reproduce with trace log (bash)

```bash
# No spinners or progress bars: the output goes to a log, not a terminal.
export CI=true NPM_CONFIG_PROGRESS=false NPM_CONFIG_LOGLEVEL=error
rm -f devcontainer-up.log
devcontainer up --workspace-folder . --remove-existing-container --log-level trace 2>&1 | tee devcontainer-up.log
```

## Analyze devcontainer-up.log

```powershell
# Tail — most failures are at the end
Get-Content devcontainer-up.log -Tail 100

# Error lines only
Select-String -Path devcontainer-up.log -Pattern "error|failed|ERR" | Select-Object -Last 30
```

Bash equivalent:

```bash
tail -n 100 devcontainer-up.log
grep -iE "error|failed|ERR" devcontainer-up.log | tail -n 30
```
