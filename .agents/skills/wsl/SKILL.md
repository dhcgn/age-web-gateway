---
name: wsl
description: Windows Subsystem for Linux (WSL) allows you to run a Linux environment directly on Windows, unmodified, without the overhead of a traditional virtual machine. If you need to run Linux commands, scripts, or applications on a Windows machine, WSL is the way to go. This skill provides guidance on how to use WSL effectively.
---

```powershell
# Running on Windows
$env:OS
# Windows_NT

# Running on WSL
wsl pwsh -Command { uname -a }
# Linux danielsp16s 6.18.33.2-microsoft-standard-WSL2 #1 SMP PREEMPT_DYNAMIC Thu Jun 18 21:54:43 UTC 2026 x86_64 x86_64 x86_64 GNU/Linux
```

## Translate Paths

> The `wslpath` command is used to translate file paths between Windows and WSL (Linux) environments.

```plain
wslpath
Usage:
    -a
        Force result to absolute path format.
    -u
        Translate from a Windows path to a WSL path (default).
    -w
        Translate from a WSL path to a Windows path.
    -m
        Translate from a WSL path to a Windows path, with '/' instead of '\\'

Example: wslpath 'c:\\users'
```

### Example

```powershell
wsl bash -lc 'wslpath "C:\local\DevDrive.vhdx" | xargs ls -lah'
# -rwxrwxrwx 1 hdev hdev 2.0G Aug 29 13:53 /mnt/c/local/DevDrive.vhdx
```
