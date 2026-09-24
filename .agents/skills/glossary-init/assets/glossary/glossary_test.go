package glossary

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func parseOne(t *testing.T, path, content string) []Definition {
	t.Helper()
	defs, err := ParseContent(path, []byte(content))
	if err != nil {
		t.Fatalf("ParseContent(%s): %v", path, err)
	}
	return defs
}

func TestParseSingleLine(t *testing.T) {
	defs := parseOne(t, "x.go", "// jl:domain.route.encode=Encoded from pixels.\n")
	if len(defs) != 1 || defs[0].Key != "jl:domain.route.encode" || defs[0].Description != "Encoded from pixels." {
		t.Fatalf("unexpected defs: %+v", defs)
	}
}

func TestParseIgnoresStringLiterals(t *testing.T) {
	defs := parseOne(t, "x.go", "s := \"jl:domain.fake=not a comment\"\n")
	if len(defs) != 0 {
		t.Fatalf("string literal harvested: %+v", defs)
	}
}

func TestParseCommentStyles(t *testing.T) {
	cases := []struct{ path, line string }{
		{"x.ts", "// jl:domain.a.b=TS slash."},
		{"x.yaml", "# jl:domain.a.c=YAML hash."},
		{"x.ps1", "# jl:domain.a.d=PS hash."},
		{"x.css", "/* jl:domain.a.e=CSS block. */"},
		{"x.svelte", "<!-- jl:domain.a.f=Svelte html. -->"},
		{"x.svelte", "// jl:domain.a.g=Svelte script."},
		{"x.md", "<!-- jl:domain.a.h=Markdown html. -->"},
	}
	for _, c := range cases {
		defs := parseOne(t, c.path, c.line+"\n")
		if len(defs) != 1 {
			t.Fatalf("%s: got %+v", c.path, defs)
		}
	}
}

func TestParseMarkdownProseIgnored(t *testing.T) {
	defs := parseOne(t, "x.md", "See jl:domain.a.b for details.\n| `jl:domain.a.b` | Desc |\n")
	if len(defs) != 0 {
		t.Fatalf("markdown prose harvested: %+v", defs)
	}
}

func TestParseMultilineBlock(t *testing.T) {
	content := "// ---\n// jl:Key: jl:domain.output.replace\n// jl:Description: >\n//   Write temp, verify,\n//   rename, recycle.\n// ---\n"
	defs := parseOne(t, "x.go", content)
	if len(defs) != 1 {
		t.Fatalf("got %+v", defs)
	}
	if defs[0].Description != "Write temp, verify, rename, recycle." {
		t.Fatalf("bad description: %q", defs[0].Description)
	}
}

func TestParseInvalidKey(t *testing.T) {
	// Uppercase lookalikes are not comments definitions at all: ignored.
	if defs := parseOne(t, "x.go", "// jl:BADKEY=oops\n"); len(defs) != 0 {
		t.Fatalf("uppercase harvested: %+v", defs)
	}
	// A --- block naming a bad key is an error.
	bad := "// ---\n// jl:Key: jl:BAD\n// jl:Description: >\n//   Oops.\n// ---\n"
	if _, err := ParseContent("x.go", []byte(bad)); err == nil {
		t.Fatal("expected error for invalid block key")
	}
}

func TestParseUnclosedBlock(t *testing.T) {
	if _, err := ParseContent("x.go", []byte("// ---\n// jl:Key: jl:domain.a.b\n")); err == nil {
		t.Fatal("expected error for unclosed block")
	}
}

func TestRenderGroupsAndWarns(t *testing.T) {
	topics := []Topic{{Key: "jl:domain", Title: "Domain", Description: "D."}}
	defs := []Definition{
		{Key: "jl:other.stray", Description: "No topic."},
		{Key: "jl:domain.b", Description: "B."},
		{Key: "jl:domain.a", Description: "A."},
	}
	out := Render(topics, defs, nil, map[string]int{"jl:domain.a": 2})
	if !strings.Contains(out, "<!-- generated - do not edit -->") {
		t.Fatal("missing generated header")
	}
	ia, ib := strings.Index(out, "jl:domain.a"), strings.Index(out, "jl:domain.b")
	if ia < 0 || ib < 0 || ia > ib {
		t.Fatal("keys not sorted within chapter")
	}
	if !strings.Contains(out, "> [!WARNING]") || !strings.Contains(out, "GLOSSARY.topics.yaml") {
		t.Fatal("missing uncategorized warning")
	}
	if !strings.Contains(out, "| Key | ref-count | Description |") ||
		!strings.Contains(out, "| `jl:domain.a` | 2 | A. |") ||
		!strings.Contains(out, "| `jl:domain.b` | 0 | B. |") {
		t.Fatal("missing ref-count column")
	}
}

func parseRefsOne(t *testing.T, path, content string) []Reference {
	t.Helper()
	refs, err := ParseRefs(path, []byte(content))
	if err != nil {
		t.Fatalf("ParseRefs(%s): %v", path, err)
	}
	return refs
}

func TestParseRefsComment(t *testing.T) {
	refs := parseRefsOne(t, "x.go", "// See ref:jl:domain.preset for the format.\n")
	if len(refs) != 1 || refs[0].Target != "jl:domain.preset" || refs[0].Line != 1 {
		t.Fatalf("unexpected refs: %+v", refs)
	}
}

func TestParseRefsIgnoresStringLiterals(t *testing.T) {
	refs := parseRefsOne(t, "x.go", "s := \"ref:jl:domain.preset\"\n")
	if len(refs) != 0 {
		t.Fatalf("string literal harvested: %+v", refs)
	}
}

func TestParseRefsMarkdownProse(t *testing.T) {
	refs := parseRefsOne(t, "x.md", "Every file takes one `ref:jl:domain.route`, never a bare name.\n")
	if len(refs) != 1 || refs[0].Target != "jl:domain.route" {
		t.Fatalf("unexpected refs: %+v", refs)
	}
}

func TestParseRefsPunctuation(t *testing.T) {
	refs := parseRefsOne(t, "x.go", "// ref:jl:domain.a, ref:jl:domain.b. (ref:jl:domain.c)\n")
	if len(refs) != 3 || refs[0].Target != "jl:domain.a" || refs[1].Target != "jl:domain.b" || refs[2].Target != "jl:domain.c" {
		t.Fatalf("unexpected refs: %+v", refs)
	}
}

func TestParseRefsBlockDescription(t *testing.T) {
	content := "// ---\n// jl:Key: jl:domain.a\n// jl:Description: >\n//   Like ref:jl:domain.b but stricter.\n// ---\n"
	refs := parseRefsOne(t, "x.go", content)
	if len(refs) != 1 || refs[0].Target != "jl:domain.b" || refs[0].Line != 4 {
		t.Fatalf("unexpected refs: %+v", refs)
	}
}

func TestParseRefsMalformed(t *testing.T) {
	if _, err := ParseRefs("x.go", []byte("// see ref:jl:BAD!\n")); err == nil {
		t.Fatal("expected error for malformed reference")
	}
}

func TestBrokenRefs(t *testing.T) {
	defs := []Definition{{Key: "jl:domain.a"}}
	refs := []Reference{
		{Target: "jl:domain.a", File: "x.go", Line: 1},
		{Target: "jl:domain.missing", File: "y.go", Line: 2},
		{Target: "jl:domain", File: "z.go", Line: 3},
	}
	broken := BrokenRefs(defs, refs)
	if len(broken) != 2 || len(broken["jl:domain.missing"]) != 1 || len(broken["jl:domain"]) != 1 {
		t.Fatalf("unexpected broken: %+v", broken)
	}
	out := Render(nil, defs, broken, RefCounts(refs))
	if !strings.Contains(out, "## Broken references") || !strings.Contains(out, "> [!CAUTION]") ||
		!strings.Contains(out, "`jl:domain.missing` | y.go:2") {
		t.Fatalf("missing broken section:\n%s", out)
	}
}

func TestGenerateFailsOnBrokenRef(t *testing.T) {
	root := t.TempDir()
	topics := "topics:\n  - key: jl:domain\n    title: Domain\n    description: D.\n"
	if err := os.WriteFile(filepath.Join(root, "topics.yaml"), []byte(topics), 0o644); err != nil {
		t.Fatal(err)
	}
	src := "// jl:domain.a=Defined.\n// See ref:jl:domain.ghost.\n"
	if err := os.WriteFile(filepath.Join(root, "a.go"), []byte(src), 0o644); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(root, "GLOSSARY.md")
	if err := Generate(root, filepath.Join(root, "topics.yaml"), out); err == nil {
		t.Fatal("expected error for broken reference")
	} else if !strings.Contains(err.Error(), "jl:domain.ghost") {
		t.Fatalf("error names no target: %v", err)
	}
	got, readErr := os.ReadFile(out)
	if readErr != nil {
		t.Fatalf("broken run must still write the file: %v", readErr)
	}
	if !strings.Contains(string(got), "## Broken references") {
		t.Fatal("written file lacks the broken section")
	}
}

func TestCustomPrefix(t *testing.T) {
	g := New("acme")
	defs, err := g.ParseContent("x.go", []byte("// acme:team.term=Our term.\n// jl:domain.a=Not ours.\n"))
	if err != nil {
		t.Fatalf("ParseContent: %v", err)
	}
	if len(defs) != 1 || defs[0].Key != "acme:team.term" {
		t.Fatalf("unexpected defs: %+v", defs)
	}
	refs, err := g.ParseRefs("x.go", []byte("// See ref:acme:team.term and ref:jl:domain.a.\n"))
	if err != nil {
		t.Fatalf("ParseRefs: %v", err)
	}
	if len(refs) != 1 || refs[0].Target != "acme:team.term" {
		t.Fatalf("unexpected refs: %+v", refs)
	}
	topics := []Topic{{Key: "acme:team", Title: "Team", Description: "T."}}
	out := g.Render(topics, defs, BrokenRefs(defs, refs), RefCounts(refs))
	if !strings.Contains(out, "## Team (acme:team)") ||
		!strings.Contains(out, "| `acme:team.term` | 1 | Our term. |") {
		t.Fatalf("bad custom render:\n%s", out)
	}
}

func TestGlossaryUpToDate(t *testing.T) {
	root := filepath.Join("..", "..")
	topicsPath := filepath.Join(root, "docs", "GLOSSARY.topics.yaml")
	glossaryPath := filepath.Join(root, "docs", "GLOSSARY.md")
	topics, err := LoadTopics(topicsPath)
	if err != nil {
		t.Fatalf("LoadTopics: %v", err)
	}
	defs, err := Collect(root)
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}
	if len(defs) == 0 {
		t.Fatal("collected 0 definitions")
	}
	refs, err := CollectRefs(root)
	if err != nil {
		t.Fatalf("CollectRefs: %v", err)
	}
	if broken := BrokenRefs(defs, refs); len(broken) > 0 {
		t.Fatalf("broken glossary references: run go generate ./... for the list, then define or fix them")
	}
	want := Render(topics, defs, BrokenRefs(defs, refs), RefCounts(refs))
	got, err := os.ReadFile(glossaryPath)
	if err != nil {
		t.Fatalf("read %s: %v (run go generate ./...)", glossaryPath, err)
	}
	if string(got) != want {
		t.Fatalf("%s is stale: run go generate ./... and commit the result", glossaryPath)
	}
}
