---
name: glossary-create
description: Add a new term to a generated-glossary repo (jl:-style keys). Defines the term once in code at its anchor file, references it elsewhere with ref:. Use when introducing a new user-visible concept, policy, view, or route that needs a stable name.
---

# Glossary create

One term = **one definition in code**, `ref:` pointers everywhere else.
Read-only searching lives in the `glossary-search` skill (`defs` / `refs` /
`keys` modes) — use it for steps 1–2. No glossary in the repo yet? Start
with the `glossary-init` skill, then come back here.

## Steps

1. **Read the glossary first.** Open the generated file (usually
   `docs/GLOSSARY.md`) plus the topics config (e.g.
   `docs/GLOSSARY.topics.yaml`). Note the key prefix, the facet chapters,
   and the comment syntaxes that carry definitions.
2. **Check the term doesn't exist.** Run `keys` / `defs` from
   `glossary-search` for synonyms and near-misses. Reuse beats rename:
   keys are stable once merged.
3. **Pick the key.** `<prefix>:<facet>.<path>`, lowercase dotted,
   kebab-case within a segment. The facet must already be a chapter in
   the topics config — if not, add the chapter there first.
   The first segment after the facet usually mirrors the domain area,
   e.g. existing keys group `route.*`, `output.*`, `preset.*` under
   their facet.
4. **Define it once, in code, at the anchor** — the file that implements
   the concept: next to the type, const block, or function that owns it
   (package doc for broad concepts). Native comment syntax, single line
   when it fits in one sentence:
   `// jl:domain.output.replace=Result takes the …`
   Long descriptions use the fenced block form (`---` + `jl:Key:` /
   `jl:Description:`); see an existing multi-line entry for the shape.
   Never define the same key twice; never define it in docs prose when
   a code anchor exists.
5. **Reference, don't repeat.** Everywhere else the term appears —
   other code comments, Markdown prose, issues, PRs — point at it with
   `ref:` plus the full key (as in `ref:jl:domain.route`). Paraphrases
   rot; pointers don't. A `ref:` with no definition fails generation,
   so a typo surfaces immediately instead of silently.
6. **Regenerate and verify.** Run `go generate ./...` (or the repo's
   documented refresh), confirm the new row lands in the right chapter
   of the generated file, and run the check gate — it fails on
   duplicates, dangling references, and stale output.

## Don't

- One definition per key repository-wide — differing texts are an error.
- Don't invent a facet; add the chapter to the topics config first.
- Don't put the definition in a test fixture or the generated file —
  neither is harvested.
- Don't quote a dangling `ref:` example into a scanned file while
  demonstrating the error; describe it instead, or generation fails.
