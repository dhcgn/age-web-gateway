// Command gen collects prefix-key definitions from source comments and
// writes the generated glossary markdown. It is invoked via `go generate`
// from the glossary package; paths default to the go-generate working
// directory (the glossary package dir). Other projects reuse it with
// -prefix and their own topics/out paths.
package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/dhcgn/jxleet/internal/glossary"
)

func main() {
	var (
		root   = flag.String("root", "../..", "repo root to scan for definitions")
		topics = flag.String("topics", "../../docs/GLOSSARY.topics.yaml", "topic chapter config")
		out    = flag.String("out", "../../docs/GLOSSARY.md", "generated markdown output")
		prefix = flag.String("prefix", glossary.DefaultPrefix, "key prefix without colon")
	)
	flag.Parse()

	g := glossary.New(*prefix)
	defs, err := g.Collect(*root)
	if err != nil {
		fmt.Fprintln(os.Stderr, "gen:", err)
		os.Exit(1)
	}
	if len(defs) == 0 {
		fmt.Fprintln(os.Stderr, "gen: collected 0 definitions — refusing to write empty output")
		os.Exit(1)
	}
	if err := g.Generate(*root, *topics, *out); err != nil {
		fmt.Fprintln(os.Stderr, "gen:", err)
		os.Exit(1)
	}
	fmt.Printf("gen: wrote %s (%d keys)\n", *out, len(defs))
}
