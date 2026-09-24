---
name: rtk
description: Prefix covered shell commands with rtk so output is filtered/compressed before it reaches LLM context — git, gh, cargo, pytest, go test, docker, kubectl, aws, ls, grep, and more. Applies whenever a covered command is about to be executed in a shell.
---

# RTK — filter command output before it hits context

rtk (Rust Token Killer, https://github.com/rtk-ai/rtk) wraps 100+ common CLI commands and cuts their output 60–99% before the LLM reads it. Single Rust binary, arguments pass through unchanged.

## Rule

When about to execute a shell command that appears in the coverage table below, run it as `rtk <command> [args...]` instead — same arguments, `rtk` prefix. If `rtk --version` fails, fall back to the raw command.

## Coverage table

| Instead of | Run | What you get |
|---|---|---|
| `git status` / `git log` / `git diff` / `git show` / `git stash list` | `rtk git ...` | compact status, one-line log, condensed diff |
| `git add` / `git commit` / `git push` / `git pull` | `rtk git ...` | single confirmation line |
| `gh pr view` / `gh pr checks` / `gh run list` / `gh issue view` / `gh pr list` / `gh issue list` | `rtk gh ...` | compact listings, no ASCII art |
| `cargo test` / `cargo nextest` / `cargo build` / `cargo check` / `cargo clippy` | `rtk cargo ...` | failures, errors, warnings only |
| `jest` / `vitest` / `playwright test` | `rtk jest`, `rtk vitest`, `rtk playwright test` | failures only |
| `pytest` | `rtk pytest` | failures only, trimmed traceback |
| `go test` / `go build` | `rtk go test`, `rtk go build` | failures / errors only |
| `tsc` / `eslint` / `next build` / `prettier --check` | `rtk tsc`, `rtk lint`, `rtk next build`, `rtk prettier --check .` | errors grouped by file/rule |
| `ruff check` / `mypy` | `rtk ruff check`, `rtk mypy` | violations grouped |
| `golangci-lint run` | `rtk golangci-lint run` | violations grouped |
| `rspec` / `rubocop` / `rake test` / `rake` | `rtk rspec`, `rtk rubocop`, `rtk rake test` | failures / offenses only |
| `dotnet build` / `dotnet test` / `dotnet format` | `rtk dotnet ...` | errors and failures only |
| `docker ps` / `docker images` / `docker logs` / `docker compose ps` | `rtk docker ...` | essential fields, deduped logs |
| `kubectl get pods` / `kubectl logs` / `kubectl services` | `rtk kubectl ...` | compact lists, deduped logs |
| `ls` / `find` / `diff` / `wc` | `rtk ls`, `rtk find`, `rtk diff`, `rtk wc` | tree format with counts |
| `cat` / `head` / `tail <file>` | `rtk read <file>` | smart reading; `-l aggressive` = signatures only |
| `grep` / `rg` | `rtk grep "<pattern>" .` | truncated lines, grouped by file |
| `pnpm list` / `pnpm outdated` / `pip list` / `pip install` / `pip outdated` | `rtk pnpm list`, `rtk pip ...` | compact trees, no progress bars |
| `aws ...` (ec2, lambda, logs, iam, s3, dynamodb, sts, cloudformation) | `rtk aws ...` | condensed JSON, secrets stripped |
| `curl <url>` | `rtk curl <url>` | truncated body, full output saved |
| `pulumi preview` / `pulumi up` / `pulumi destroy` / `pulumi refresh` | `rtk pulumi ...` | noise stripped |
| any command, errors only | `rtk err <cmd>` | filtered error lines |
| unsupported test runner | `rtk test <cmd>` | generic failures-only wrapper |

## Behavior notes

- **On failure, rtk tees the full raw output** to a log file and prints the path (e.g. `[full output: ~/.local/share/rtk/tee/...log]`). Read that file instead of re-running the command unfiltered.
- `--ultra-compact` squeezes output further; use the long form — git's `-u` means `--set-upstream`.
- Commands not in the table pass through unfiltered. `rtk proxy <cmd>` tracks them; `rtk discover` lists missed savings.
- Built-in agent file tools (Read/Grep/Glob) bypass rtk — only shell commands can be prefixed. When compact file output matters, use `rtk read` / `rtk grep` via shell.
- Install/setup only if asked: `rtk init -g` (hooks per agent, `--opencode` for OpenCode plugin), config at `~/.config/rtk/config.toml`.
