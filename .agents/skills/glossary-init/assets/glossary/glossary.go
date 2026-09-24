// Package glossary extracts the versioned project vocabulary from jl:
// comments in source files and renders docs/GLOSSARY.md.
//
// The source of truth is one-line or ---fenced definitions written in each
// file type's native comment syntax; the markdown file is a generated,
// alphabetically grouped view. Run `go generate ./...` to refresh it.
//
// Point at a defined term with ref:<key> from comments or Markdown prose. A
// ref: with no matching definition lands in a Broken references section and
// fails generation — fix by defining the key or correcting the reference.
package glossary

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

// Definition is one glossary entry harvested from a source comment.
type Definition struct {
	Key         string // e.g. jl:domain.route.transcode
	Description string
	File        string // repo-relative path of the defining comment
	Line        int    // 1-based line number
}

// Reference is one ref:jl:<key> mention of a defined term.
type Reference struct {
	Target string // e.g. jl:domain.quality.effort
	File   string // repo-relative path of the referring comment or prose
	Line   int    // 1-based line number
}

// Topic is one chapter of the generated glossary, configured in
// docs/GLOSSARY.topics.yaml. Order in that file is chapter order.
type Topic struct {
	Key         string `yaml:"key"`
	Title       string `yaml:"title"`
	Description string `yaml:"description"`
}

// DefaultPrefix is this project's glossary key prefix. Other projects reuse
// the package via New with their own prefix.
const DefaultPrefix = "jl"

const segment = `[a-z0-9]+(?:-[a-z0-9]+)*`

// Glossary is a parameterized prefix-key vocabulary extractor and renderer
// (e.g. jl:domain.route for prefix "jl"). Use Default for this project.
type Glossary struct {
	// Prefix is the key namespace without colon, e.g. "jl".
	Prefix string
	// Generated is the repo-relative slash path of the rendered file, which
	// is never harvested (e.g. "docs/GLOSSARY.md"). Empty disables the skip.
	Generated string
	// SkipPaths lists repo-relative slash path prefixes never walked
	// (e.g. vendored or generated dirs).
	SkipPaths []string

	validKey     *regexp.Regexp
	validTopic   *regexp.Regexp
	singleLine   *regexp.Regexp
	refCandidate *regexp.Regexp
}

// New returns a Glossary for prefix (without colon).
func New(prefix string) *Glossary {
	p := regexp.QuoteMeta(prefix)
	return &Glossary{
		Prefix:       prefix,
		validKey:     regexp.MustCompile(`^` + p + `:` + segment + `(?:\.` + segment + `)+$`),
		validTopic:   regexp.MustCompile(`^` + p + `:` + segment + `$`),
		singleLine:   regexp.MustCompile(p + `:((?:` + segment + `\.)+` + segment + `)\s*=\s*(\S.*)`),
		refCandidate: regexp.MustCompile(`ref:(` + p + `:[A-Za-z0-9.~-]+)`),
	}
}

// Default is the Glossary for this project's jl: prefix.
var Default = func() *Glossary {
	g := New(DefaultPrefix)
	g.Generated = "docs/GLOSSARY.md"
	g.SkipPaths = []string{"frontend/bindings"}
	return g
}()

// ValidKey reports whether key follows the <prefix>:<facet>.<path...>
// convention.
func (g *Glossary) ValidKey(key string) bool { return g.validKey.MatchString(key) }

// ValidKey reports whether key follows the jl:<facet>.<path...> convention.
func ValidKey(key string) bool { return Default.ValidKey(key) }

// refHaystack is one searchable line with its 1-based line number.
type refHaystack struct {
	text   string
	lineno int
}

// ParseRefs extracts ref:<prefix>:<key> mentions from path. Code files are
// scanned in comment payloads only; Markdown is scanned as full prose
// (docs reference keys in sentences, not comments).
func (g *Glossary) ParseRefs(path string, content []byte) ([]Reference, error) {
	rel := filepath.ToSlash(path)
	var haystacks []refHaystack
	lines := strings.Split(string(content), "\n")
	if strings.ToLower(filepath.Ext(path)) == ".md" {
		for i, raw := range lines {
			haystacks = append(haystacks, refHaystack{text: raw, lineno: i + 1})
		}
	} else {
		for i, raw := range lines {
			for _, payload := range commentPayloads(rel, raw) {
				haystacks = append(haystacks, refHaystack{text: payload, lineno: i + 1})
			}
		}
	}
	var refs []Reference
	for _, h := range haystacks {
		for _, m := range g.refCandidate.FindAllStringSubmatch(h.text, -1) {
			target := strings.TrimRight(m[1], ".")
			if !g.ValidKey(target) && !g.validTopic.MatchString(target) {
				return nil, fmt.Errorf("%s:%d: malformed glossary reference %q", rel, h.lineno, m[0])
			}
			refs = append(refs, Reference{Target: target, File: rel, Line: h.lineno})
		}
	}
	return refs, nil
}

// ParseRefs extracts ref:jl:<key> mentions from path (see Glossary.ParseRefs).
func ParseRefs(path string, content []byte) ([]Reference, error) {
	return Default.ParseRefs(path, content)
}

// ParseContent extracts definitions from the content of path, scanning only
// comment payloads for that file type (never string literals or prose).
func (g *Glossary) ParseContent(path string, content []byte) ([]Definition, error) {
	rel := filepath.ToSlash(path)
	lines := strings.Split(string(content), "\n")
	var defs []Definition
	var block []payloadLine // open ---fenced block, nil when outside
	flush := func(endLine int) error {
		if block == nil {
			return nil
		}
		d, ok, err := g.parseBlock(rel, block)
		if err != nil {
			return fmt.Errorf("%s:%d: %w", rel, endLine, err)
		}
		if ok {
			defs = append(defs, d)
		}
		block = nil
		return nil
	}
	for i, raw := range lines {
		lineno := i + 1
		for _, payload := range commentPayloads(rel, raw) {
			trimmed := strings.TrimSpace(payload)
			if trimmed == "---" {
				if block == nil {
					block = []payloadLine{}
				} else {
					if err := flush(lineno); err != nil {
						return nil, err
					}
				}
				break
			}
			if block != nil {
				block = append(block, payloadLine{text: payload, lineno: lineno})
				break
			}
			if m := g.singleLine.FindStringSubmatch(payload); m != nil {
				key, desc := g.Prefix+":"+m[1], strings.TrimSpace(m[2])
				if !g.ValidKey(key) {
					return nil, fmt.Errorf("%s:%d: invalid glossary key %q", rel, lineno, key)
				}
				defs = append(defs, Definition{Key: key, Description: desc, File: rel, Line: lineno})
				break
			}
		}
	}
	if block != nil {
		return nil, fmt.Errorf("%s: unclosed --- glossary block", rel)
	}
	return defs, nil
}

// ParseContent extracts definitions from the content of path (see
// Glossary.ParseContent).
func ParseContent(path string, content []byte) ([]Definition, error) {
	return Default.ParseContent(path, content)
}

type payloadLine struct {
	text   string
	lineno int
}

// parseBlock reads a ---fenced comment block: <prefix>:Key plus
// <prefix>:Description, whose continuation lines form the description.
func (g *Glossary) parseBlock(rel string, block []payloadLine) (Definition, bool, error) {
	var d Definition
	d.File = rel
	var descLines []string
	inDesc := false
	keyMark, descMark := g.Prefix+":Key:", g.Prefix+":Description:"
	for _, pl := range block {
		t := strings.TrimSpace(pl.text)
		if strings.HasPrefix(t, keyMark) {
			d.Key = strings.TrimSpace(strings.TrimPrefix(t, keyMark))
			d.Line = pl.lineno
			inDesc = false
			continue
		}
		if strings.HasPrefix(t, descMark) {
			rest := strings.TrimSpace(strings.TrimPrefix(t, descMark))
			rest = strings.TrimPrefix(rest, ">")
			rest = strings.TrimSpace(rest)
			if rest != "" {
				descLines = append(descLines, rest)
			}
			inDesc = true
			continue
		}
		if inDesc && t != "" {
			descLines = append(descLines, t)
		}
	}
	if d.Key == "" && len(descLines) == 0 {
		return Definition{}, false, nil // not a glossary block
	}
	if d.Key == "" || len(descLines) == 0 {
		return Definition{}, false, fmt.Errorf("incomplete glossary block (need %s and %s)", keyMark, descMark)
	}
	if !g.ValidKey(d.Key) {
		return Definition{}, false, fmt.Errorf("invalid glossary key %q", d.Key)
	}
	d.Description = strings.Join(descLines, " ")
	return d, true, nil
}

// commentPayloads returns the comment text of raw for each comment style the
// file type supports, or nil when the line carries no comment.
func commentPayloads(path, raw string) []string {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".go", ".ts":
		return slashPayloads(raw)
	case ".svelte":
		return append(append(slashPayloads(raw), htmlPayloads(raw)...), cBlockPayloads(raw)...)
	case ".css":
		return cBlockPayloads(raw)
	case ".yaml", ".yml", ".ps1":
		return hashPayloads(raw)
	case ".md":
		return htmlPayloads(raw)
	default:
		return nil
	}
}

func slashPayloads(raw string) []string {
	i := strings.Index(raw, "//")
	if i < 0 {
		return nil
	}
	return []string{raw[i+2:]}
}

func hashPayloads(raw string) []string {
	i := strings.Index(raw, "#")
	if i < 0 {
		return nil
	}
	return []string{raw[i+1:]}
}

func htmlPayloads(raw string) []string {
	i := strings.Index(raw, "<!--")
	if i < 0 {
		return nil
	}
	rest := raw[i+4:]
	if j := strings.Index(rest, "-->"); j >= 0 {
		rest = rest[:j]
	}
	return []string{rest}
}

func cBlockPayloads(raw string) []string {
	i := strings.Index(raw, "/*")
	if i < 0 {
		return nil
	}
	rest := raw[i+2:]
	if j := strings.Index(rest, "*/"); j >= 0 {
		rest = rest[:j]
	}
	return []string{rest}
}

var skipDirs = map[string]bool{
	".git": true, "bin": true, "node_modules": true,
	"apm_modules": true, ".task": true, "test-bins": true, "test-data": true,
}

var allowedExts = map[string]bool{
	".go": true, ".ts": true, ".svelte": true, ".css": true,
	".yaml": true, ".yml": true, ".ps1": true, ".md": true,
}

// walkSources calls fn for every harvestable file under root with its
// repo-relative slash path and content. The generated file, test fixtures,
// vendored and binary-heavy dirs are skipped.
func (g *Glossary) walkSources(root string, fn func(rel string, content []byte) error) error {
	return filepath.WalkDir(root, func(path string, e fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel := filepath.ToSlash(path)
		if e.IsDir() {
			if skipDirs[e.Name()] {
				return filepath.SkipDir
			}
			for _, skip := range g.SkipPaths {
				if rel == skip || strings.HasPrefix(rel, skip+"/") {
					return filepath.SkipDir
				}
			}
			return nil
		}
		if !allowedExts[strings.ToLower(filepath.Ext(path))] || (g.Generated != "" && rel == g.Generated) {
			return nil
		}
		if base := e.Name(); strings.HasSuffix(base, "_test.go") || strings.HasSuffix(base, ".test.ts") || strings.HasSuffix(base, ".spec.ts") {
			return nil // fixtures, never glossary sources
		}
		content, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return fn(rel, content)
	})
}

// Collect walks root and merges every definition. A repeated key with
// identical text is ignored; differing texts are an error.
func (g *Glossary) Collect(root string) ([]Definition, error) {
	byKey := map[string]Definition{}
	var origins []string // for deterministic errors
	err := g.walkSources(root, func(rel string, content []byte) error {
		defs, err := g.ParseContent(rel, content)
		if err != nil {
			return err
		}
		for _, d := range defs {
			if prev, ok := byKey[d.Key]; ok {
				if prev.Description != d.Description {
					return fmt.Errorf("duplicate glossary key %s with differing text:\n  %s:%d: %s\n  %s:%d: %s",
						d.Key, prev.File, prev.Line, prev.Description, d.File, d.Line, d.Description)
				}
				continue
			}
			byKey[d.Key] = d
			origins = append(origins, d.Key)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(origins)
	defs := make([]Definition, 0, len(origins))
	for _, k := range origins {
		defs = append(defs, byKey[k])
	}
	return defs, nil
}

// Collect walks root and merges every definition (see Glossary.Collect).
func Collect(root string) ([]Definition, error) { return Default.Collect(root) }

// CollectRefs walks root and returns every ref: mention, sorted by target,
// then file, then line.
func (g *Glossary) CollectRefs(root string) ([]Reference, error) {
	var refs []Reference
	err := g.walkSources(root, func(rel string, content []byte) error {
		got, err := g.ParseRefs(rel, content)
		if err != nil {
			return err
		}
		refs = append(refs, got...)
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(refs, func(i, j int) bool {
		if refs[i].Target != refs[j].Target {
			return refs[i].Target < refs[j].Target
		}
		if refs[i].File != refs[j].File {
			return refs[i].File < refs[j].File
		}
		return refs[i].Line < refs[j].Line
	})
	return refs, nil
}

// CollectRefs walks root and returns every ref: mention (see
// Glossary.CollectRefs).
func CollectRefs(root string) ([]Reference, error) { return Default.CollectRefs(root) }

// RefCounts tallies ref: mentions per target key.
func RefCounts(refs []Reference) map[string]int {
	counts := map[string]int{}
	for _, r := range refs {
		counts[r.Target]++
	}
	return counts
}

// BrokenRefs returns the references with no matching definition, grouped by
// target in sorted order. Refs to bare facets (jl:domain) are always broken:
// only full defined keys resolve.
func BrokenRefs(defs []Definition, refs []Reference) map[string][]Reference {
	defined := map[string]bool{}
	for _, d := range defs {
		defined[d.Key] = true
	}
	broken := map[string][]Reference{}
	for _, r := range refs {
		if !defined[r.Target] {
			broken[r.Target] = append(broken[r.Target], r)
		}
	}
	return broken
}

// LoadTopics reads the chapter config; file order is chapter order.
func (g *Glossary) LoadTopics(path string) ([]Topic, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var file struct {
		Topics []Topic `yaml:"topics"`
	}
	if err := yaml.Unmarshal(raw, &file); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	seen := map[string]bool{}
	for _, t := range file.Topics {
		if !g.validTopic.MatchString(t.Key) || strings.Contains(t.Key[len(g.Prefix)+1:], ".") {
			return nil, fmt.Errorf("invalid topic key %q (want %s:<facet>)", t.Key, g.Prefix)
		}
		if seen[t.Key] {
			return nil, fmt.Errorf("duplicate topic %q", t.Key)
		}
		seen[t.Key] = true
		if strings.TrimSpace(t.Title) == "" || strings.TrimSpace(t.Description) == "" {
			return nil, fmt.Errorf("topic %q needs a title and description", t.Key)
		}
	}
	return file.Topics, nil
}

// LoadTopics reads the chapter config (see Glossary.LoadTopics).
func LoadTopics(path string) ([]Topic, error) { return Default.LoadTopics(path) }

// facet returns the <prefix>:<facet> chapter a key belongs to.
func (g *Glossary) facet(key string) string {
	rest := strings.TrimPrefix(key, g.Prefix+":")
	if i := strings.Index(rest, "."); i >= 0 {
		return g.Prefix + ":" + rest[:i]
	}
	return key
}

// Render builds the generated markdown: one chapter per topic in file order,
// an Uncategorized section (warning-only) for keys without a topic, and a
// Broken references section for ref: mentions with no definition.
// refCounts holds the number of ref: mentions per defined key.
func (g *Glossary) Render(topics []Topic, defs []Definition, broken map[string][]Reference, refCounts map[string]int) string {
	byFacet := map[string][]Definition{}
	for _, d := range defs {
		f := g.facet(d.Key)
		byFacet[f] = append(byFacet[f], d)
	}
	for _, v := range byFacet {
		sort.Slice(v, func(i, j int) bool { return v[i].Key < v[j].Key })
	}
	var b strings.Builder
	b.WriteString("<!-- generated - do not edit -->\n")
	b.WriteString("# Glossary\n\n")
	b.WriteString("Versioned project vocabulary for humans and coding agents. ")
	fmt.Fprintf(&b, "Definitions live in `%s:` source comments; this file is generated by ", g.Prefix)
	b.WriteString("`go generate ./...` (see `internal/glossary`, topics in `docs/GLOSSARY.topics.yaml`). ")
	b.WriteString("Keys are stable once merged — renames update all references in the same change.\n")
	known := map[string]bool{}
	for _, t := range topics {
		known[t.Key] = true
		b.WriteString("\n## " + t.Title + " (" + t.Key + ")\n\n")
		b.WriteString(t.Description + "\n\n")
		b.WriteString("| Key | ref-count | Description |\n|---|---|---|\n")
		for _, d := range byFacet[t.Key] {
			fmt.Fprintf(&b, "| `%s` | %d | %s |\n", d.Key, refCounts[d.Key], d.Description)
		}
	}
	var orphaned []Definition
	for f, ds := range byFacet {
		if !known[f] {
			orphaned = append(orphaned, ds...)
		}
	}
	if len(orphaned) > 0 {
		sort.Slice(orphaned, func(i, j int) bool { return orphaned[i].Key < orphaned[j].Key })
		b.WriteString("\n## Uncategorized\n\n")
		b.WriteString("> [!WARNING]\n")
		b.WriteString("> These keys have no facet entry in `docs/GLOSSARY.topics.yaml` — add one. ")
		b.WriteString("Keys are still listed so nothing is silently dropped.\n\n")
		b.WriteString("| Key | ref-count | Description |\n|---|---|---|\n")
		for _, d := range orphaned {
			fmt.Fprintf(&b, "| `%s` | %d | %s |\n", d.Key, refCounts[d.Key], d.Description)
		}
	}
	if len(broken) > 0 {
		targets := make([]string, 0, len(broken))
		for t := range broken {
			targets = append(targets, t)
		}
		sort.Strings(targets)
		b.WriteString("\n## Broken references\n\n")
		b.WriteString("> [!CAUTION]\n")
		b.WriteString("> These `ref:` mentions point at keys with no definition. ")
		b.WriteString("Fix by defining the key at its anchor file or correcting the reference, then regenerate.\n\n")
		b.WriteString("| Reference | Location |\n|---|---|\n")
		for _, t := range targets {
			var locs []string
			for _, r := range broken[t] {
				locs = append(locs, fmt.Sprintf("%s:%d", r.File, r.Line))
			}
			b.WriteString("| `" + t + "` | " + strings.Join(locs, ", ") + " |\n")
		}
	}
	return b.String()
}

// Generate collects definitions and references from root and writes the
// glossary to outPath. The file is always written — even with broken refs,
// so the Broken references section shows what to fix — but broken refs are
// returned as an error so the check gate fails.
func (g *Glossary) Generate(root, topicsPath, outPath string) error {
	topics, err := g.LoadTopics(topicsPath)
	if err != nil {
		return err
	}
	defs, err := g.Collect(root)
	if err != nil {
		return err
	}
	refs, err := g.CollectRefs(root)
	if err != nil {
		return err
	}
	broken := BrokenRefs(defs, refs)
	counts := RefCounts(refs)
	if err := os.WriteFile(outPath, []byte(g.Render(topics, defs, broken, counts)), 0o644); err != nil {
		return err
	}
	if len(broken) > 0 {
		targets := make([]string, 0, len(broken))
		for t := range broken {
			targets = append(targets, t)
		}
		sort.Strings(targets)
		var lines []string
		for _, t := range targets {
			var locs []string
			for _, r := range broken[t] {
				locs = append(locs, fmt.Sprintf("%s:%d", r.File, r.Line))
			}
			lines = append(lines, fmt.Sprintf("  %s at %s", t, strings.Join(locs, ", ")))
		}
		return fmt.Errorf("broken glossary references (no definition):\n%s", strings.Join(lines, "\n"))
	}
	return nil
}

// Render builds the generated markdown (see Glossary.Render).
func Render(topics []Topic, defs []Definition, broken map[string][]Reference, refCounts map[string]int) string {
	return Default.Render(topics, defs, broken, refCounts)
}

// Generate collects definitions and references from root and writes the
// glossary to outPath (see Glossary.Generate).
func Generate(root, topicsPath, outPath string) error {
	return Default.Generate(root, topicsPath, outPath)
}
