---
name: markdown-from-website
description: Fetch clean, AI-ready Markdown from any public website using markdown.new. Use whenever you need a web page's content for reading, summarizing, RAG, or documentation extraction — instead of fetching raw HTML.
---

# markdown.new — URL to Markdown

Converts any public URL to clean Markdown (80% fewer tokens than HTML).
Free, no signup. Rate limit: 500 requests/day per IP (HTTP 429 when exceeded;
check the `x-rate-limit-remaining` response header).

## Usage

**Wrapper scripts** (preferred — handle URL encoding and options):

```sh
# PowerShell
scripts/get-markdown.ps1 -Url 'https://example.com' [-OutFile page.md] [-Method auto|ai|browser] [-RetainImages]

# Bash
scripts/get-markdown.sh 'https://example.com' [-m auto|ai|browser] [-i] [-o page.md]
```

**Simplest — GET, prepend the service to any URL:**

```
https://markdown.new/https://example.com/page
```

Example with curl:

```sh
curl -sL 'https://markdown.new/https://example.com'
```

**POST with options (JSON body):**

```sh
curl -s 'https://markdown.new/' \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com", "method": "browser", "retain_images": true}'
```

Options work as query params too:
`https://markdown.new/https://example.com?method=browser&retain_images=true`

| Parameter       | Values                | Default |
|-----------------|-----------------------|---------|
| `method`        | `auto` `ai` `browser` | `auto`  |
| `retain_images` | `true` `false`        | `false` |

- `auto`: tries native `Accept: text/markdown` content negotiation first,
  falls back to Cloudflare Workers AI `toMarkdown()`, then headless browser
  rendering for JS-heavy pages. Just use this unless a page comes back empty.
- `browser`: forces headless render (~1–2s extra latency). Use for
  client-side-rendered SPAs that return empty/truncated content via `auto`.
- `retain_images=true`: keeps image URLs (default strips them).

## Response

`content-type: text/markdown; charset=utf-8` with a YAML frontmatter block
(`title`, etc.) and an `x-markdown-tokens` header giving the estimated token
count.

## Limits and caveats

- Public URLs only — paywalled or authenticated pages fail.
- Very large pages may be truncated.
- Respect site ToS / robots.txt; don't mass-scrape (the bot identifies as
  `markdown.new/1.0`).

## Multi-page crawling

For whole site sections, https://markdown.new/crawl runs an async job
(up to ~100–500 pages, configurable depth, single `.md` download). Only use
when a single page fetch isn't enough — it's slow, so prefer per-URL GETs.
