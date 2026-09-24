---
name: glossary-init
description: Bootstrap a generated source-comment glossary in a repo that has none. Copies the reusable extractor, wires go:generate, topics, and the stale/broken-ref gates. Use when starting glossary coverage from zero; use glossary-create to add later terms.
---

# Glossary init

Installs a prefix-key glossary (definitions in source comments, generated
markdown, fail-on-stale/broken gates) into a Go repo. The reusable
implementation lives in `assets/glossary/` — a plain copy of a working
package (stdlib + `gopkg.in/yaml.v3` only).

## Steps

1. **Check prerequisites.** Go toolchain, a Go module (`go.mod`), and a
   `docs/` dir (or wherever generated docs live). The extractor scans
   `.go/.ts/.svelte/.css/.yaml/.yml/.ps1/.md` comment styles; other
   stacks reuse the parsing ideas but need their own walk.
2. **Copy the package.** Copy `assets/glossary/` to e.g.
   `internal/glossary/` (any dir works). Fix the one module-specific
   line: the `gen/main.go` import of the glossary package must point at
   the new module path. Run `go get gopkg.in/yaml.v3` if missing.
3. **Fix the directive paths.** `generate.go` holds the `//go:generate`
   line with `-topics/-out/-root` relative to the package dir (default
   assumes two levels below root, e.g. `../../docs/...`). Adjust to the
   real layout.
4. **Pick the prefix.** Keep `DefaultPrefix` (see the constant) or set
   your own (`New("acme")`, `gen -prefix acme`). The prefix is the
   namespace before the colon; topics, keys, and `ref:` mentions all use
   it. Prefer 2–4 letters.
5. **Write the topics file.** One chapter per facet, order = chapter
   order:
   ```yaml
   topics:
     - key: acme:domain
       title: Domain concepts
       description: User-visible domain language.
   ```
6. **Seed 3–5 definitions** at their code anchors (next to the owning
   type/func, one sentence, native comment syntax) and one `ref:` from
   prose or a neighboring comment. Then `go generate ./...` and confirm
   the generated file has the right chapters plus a nonzero ref-count.
7. **Wire the gates and extend the root `AGENTS.md`.** The copied
   `glossary_test.go` already fails on stale output, duplicate keys, and
   dangling references — just make sure the repo's check task runs
   `go test ./...`. Then add a normative block to the root `AGENTS.md`
   so agents and contributors share the vocabulary (adapt paths/prefix;
   `xx:` stands for the repo's key prefix):
   ```md
   - `docs/GLOSSARY.md` — normative project vocabulary (`xx:` keys,
     generated from source comments via `go generate ./...`; chapters in
     `docs/GLOSSARY.topics.yaml`). SHOULD use an `xx:` key in issues /
     PRs / discussions whenever a defined term exists, and point at one
     with `ref:<key>` from source comments or Markdown prose. A `ref:`
     with no definition fails generation — fix by defining the key or
     correcting the reference. New term? Define it once in code at the
     file that implements it, and use `ref:` everywhere else.
   ```
   (See `glossary-create` for the ongoing convention: define once in
   code, `ref:` everywhere else.)
8. **Add a glossary hint to the issue template.** Good practice: a
   minimal `.github/ISSUE_TEMPLATE/` form (e.g. `bug_or_task.yml`) that
   reminds reporters to use `xx:` keys where a defined term exists and
   links the generated file — hint plus link, no mandatory glossary
   field. Reporters who name the key get precise answers; enforcement
   stays out (prose wording is never a CI gate).

## Notes

- `assets/` is a snapshot — if the source repo evolved, diff and
  re-copy rather than patching the copy.
- Test fixtures (`*_test.go`) and the generated file itself are never
  harvested; keep it that way when adapting the walk.
- The generator writes the file even when references dangle, then exits
  nonzero — the committed Broken-references section tells the next
  author exactly what to fix.
