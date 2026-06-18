// Package classify implements diff stratification per
// docs/adr/20260610-diff-stratification-heuristics.md.
//
// Every changed file is assigned exactly one stratum. Order is
// first-match-wins: generated, intent, docs, tests, then core as the fallback.
// Classification is advisory presentation only — callers must never hide
// a file irrecoverably based on its stratum.
package classify

import (
	"path"
	"strings"
)

type Stratum string

const (
	Generated Stratum = "generated"
	Intent    Stratum = "intent"
	Docs      Stratum = "docs"
	Tests     Stratum = "tests"
	Core      Stratum = "core"
)

var lockfiles = map[string]bool{
	"package-lock.json": true,
	"yarn.lock":         true,
	"pnpm-lock.yaml":    true,
	"go.sum":            true,
	"cargo.lock":        true,
	"gemfile.lock":      true,
	"composer.lock":     true,
	"poetry.lock":       true,
	"uv.lock":           true,
	"flake.lock":        true,
}

var generatedSuffixes = []string{
	".pb.go", "_gen.go", ".gen.go", ".pb.ts", ".d.ts.map",
	".min.js", ".min.css", ".snap",
}

var generatedSegments = []string{
	"dist", "build", "vendor", "node_modules", "__snapshots__",
	"generated", ".gen", "gen",
}

var intentDirPrefixes = []string{
	"docs/adr/", "docs/decisions/", "docs/architecture/decisions/",
	"docs/rfc/", "adr/", "decisions/",
}

var docSuffixes = []string{".md", ".mdx", ".markdown", ".rst", ".adoc"}

var docRootNames = []string{"readme", "changelog", "contributing"}

var testSegments = []string{"tests", "test", "__tests__", "spec", "testdata"}

// File classifies a changed file by its repo-relative path.
// generatedAttr should be true when .gitattributes marks the path
// linguist-generated (callers that don't resolve attributes pass false).
func File(p string, generatedAttr bool) Stratum {
	p = strings.TrimPrefix(p, "/")
	lower := strings.ToLower(p)
	base := path.Base(lower)
	segments := strings.Split(path.Dir(lower), "/")

	// 1. Generated
	if generatedAttr || lockfiles[base] {
		return Generated
	}
	for _, s := range generatedSuffixes {
		if strings.HasSuffix(lower, s) {
			return Generated
		}
	}
	if strings.Contains(base, ".generated.") {
		return Generated
	}
	for _, seg := range segments {
		for _, g := range generatedSegments {
			if seg == g {
				return Generated
			}
		}
	}

	// 2. Intent
	if strings.HasSuffix(lower, ".feature") {
		return Intent
	}
	for _, prefix := range intentDirPrefixes {
		if strings.HasPrefix(lower, prefix) || strings.Contains(lower, "/"+prefix) {
			return Intent
		}
	}

	// 3. Docs
	for _, seg := range segments {
		if seg == "docs" {
			return Docs
		}
	}
	for _, s := range docSuffixes {
		if strings.HasSuffix(lower, s) {
			return Docs
		}
	}
	// Top-level README/CHANGELOG/CONTRIBUTING in any extension/case.
	if len(segments) == 1 && segments[0] == "." {
		for _, n := range docRootNames {
			if base == n || strings.HasPrefix(base, n+".") {
				return Docs
			}
		}
	}
	// *.txt is prose only under a docs/ segment (handled above); a root
	// requirements.txt stays Core.

	// 4. Tests
	if strings.HasSuffix(lower, "_test.go") {
		return Tests
	}
	if strings.Contains(base, ".test.") || strings.Contains(base, ".spec.") ||
		strings.HasSuffix(base, "_test.py") || strings.HasSuffix(base, "_spec.rb") {
		return Tests
	}
	for _, seg := range segments {
		for _, t := range testSegments {
			if seg == t {
				return Tests
			}
		}
	}

	// 5. Core (fallback)
	return Core
}
