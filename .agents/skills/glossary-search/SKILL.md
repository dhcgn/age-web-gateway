---
name: glossary-search
description: Search a repo for generated-glossary key definitions (jl:-style prefix keys in source comments) and usages from bash or PowerShell. Use when asked to find, list, or audit glossary keys, their definitions, or where a key is referenced.
---

# Glossary search

Finds glossary-key definitions and usages with the bundled scripts (same
behavior in both shells). Read-only: the scripts never edit files. To add a
new term instead, see the `glossary-create` skill (define once in code,
reference with `ref:`).

## Step 0 — read the repo's glossary first

1. Open the generated glossary (usually `docs/GLOSSARY.md`) and note:
   - the key **prefix** (e.g. `jl:`) — substitute it for `jl:` in every
     command below, or pass `--prefix` / `-Prefix`;
   - the **generated file path** — hits there are the index, not sources;
     the scripts already exclude `GLOSSARY.md`;
   - the facet/chapter structure, so you know which area a key belongs to.
2. If there is a topics config (e.g. `docs/GLOSSARY.topics.yaml`), unknown
   facets usually mean a missing chapter entry, not a typo.

## Scripts

- bash: `scripts/glossary-search.sh`
- PowerShell: `scripts/glossary-search.ps1`

| Goal | bash | PowerShell |
|---|---|---|
| All definitions (`key=` lines + `Key:` blocks) | `scripts/glossary-search.sh defs` | `scripts/glossary-search.ps1 defs` |
| All `ref:` mentions (targets may dangle — the generator fails on those) | `scripts/glossary-search.sh refs` | `scripts/glossary-search.ps1 refs` |
| Everything about one key | `scripts/glossary-search.sh usages jl:domain.output.replace` | `scripts/glossary-search.ps1 usages jl:domain.output.replace` |
| Unique key-like tokens (diff against the `.md` table for unknown/orphan gaps) | `scripts/glossary-search.sh keys` | `scripts/glossary-search.ps1 keys` |
| Different prefix or subtree | `... defs --prefix acme: subdir` | `... defs -Prefix acme: -Path subdir` |
| Narrow file types | `... defs -- -g '*.go'` | `... defs -RgArgs '-g','*.go'` |

Output is plain `file:line:text` lines. `usages` escapes the key for you —
pass it literally, dots and all.

## Notes

- Test fixtures (`*_test.go`, `*.test.ts`, `*.spec.ts`), `node_modules`,
  and generated/binding dirs are excluded from `defs` (the `bindings/`
  default fits this repo — adjust per repo); pass `--` args (bash) or
  `-RgArgs` (PowerShell) to adjust (see script headers).
- Needs `rg` (preferred) or `git` on `PATH`; the scripts say which one
  they used and fail loudly if neither exists.
- Shell quoting: single-quote patterns in bash, double-quote in
  PowerShell. PowerShell has no bare `--` passthrough (it binds as a
  parameter name) — extra rg args go via `-RgArgs 'flag','value'`.
  There is intentionally no `Select-String` path — `rg.exe`
  takes identical flags in both shells.
- Regex cannot tell comments from string literals: a glossary extractor's
  own parser source (e.g. lines matching `"jl:Key:"`) may self-match in
  `defs` output. Recognize `TrimPrefix(t, "jl:Key:")`-shaped hits as
  self-matches, not definitions.
