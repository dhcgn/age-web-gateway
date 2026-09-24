---
name: glossary-create-issue
description: >
   Draft a GitHub issue for a generated-glossary repo (jl:-style keys) that reuses defined terms, proposes new ones with code anchors, and linkifies every key mention to repo-scoped code search. Use when asked to create, draft, or polish an issue in a repo whose vocabulary lives in jl: source comments.
---

# Glossary create issue

An issue is **prose with pointers**: reuse `jl:` keys where a defined term
exists, propose new keys with their one-line definition + code anchor file,
and make every key mention clickable. Complements `glossary-create` (defines
the term in code) and `glossary-search` (finds defs/refs).

## Steps

1. **Read the glossary first.** Open the generated file (usually
   `docs/GLOSSARY.md`) plus the topics config (e.g.
   `docs/GLOSSARY.topics.yaml`). Note the key prefix, the facets, and
   which keys the issue touches.
2. **Draft with keys, not paraphrases.** Name each involved concept with
   its full key in inline code (`` `jl:domain.route` ``). New concepts
   get a mini-table: key, one-line definition (existing style:
   semicolon-separated, one sentence), anchor file where the
   `glossary-create` definition will live (next to the owning type /
   view / runner — never in docs prose or test fixtures).
3. **Linkify every key (the URL hack).** GitHub renders no tooltip for
   `jl:` keys, so wrap each mention as a repo-scoped code-search link —
   readers click through to definitions and usages:
   `[`jl:view.queue`](https://github.com/search?q=repo%3Adhcgn%2Fjxleet+%22jl%3Aview.queue%22&type=code)`
   Shape: `https://github.com/search?q=repo%3A<owner>%2F<repo>+%22<prefix>%3A<rest>%22&type=code`
   (`:` → `%3A`; dots stay literal; quotes → `%22`).
4. **Keep the machine-readable refs.** Start the body with one HTML
   comment listing all used keys so the glossary generator / checker
   still sees them (it fails on dangling `ref:` — a typo surfaces
   instead of rotting):
   `<!-- ref:jl:view.main ref:jl:view.queue ... -->`
5. **Close the loop.** End the Context section with a key index
   (existing + new, all linkified) and the anchors for new keys.
   After implementation, each new key must be defined once in code and
   the glossary regenerated (`go generate ./...`).

## Don't

- Don't invent a facet — it must already be a chapter in the topics
  config.
- Don't linkify inside the `ref:` HTML comment (invisible anyway).
- Don't quote a dangling `ref:` example into a scanned file while
  demonstrating the error; describe it instead, or generation fails.
