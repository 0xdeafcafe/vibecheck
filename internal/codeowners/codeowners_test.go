package codeowners

import (
	"reflect"
	"testing"
)

// A realistic CODEOWNERS exercising every supported pattern shape, plus
// comments, blank lines, and a last-match-wins override.
const sample = `
# Default owners for everything in the repo
* @a

# Docs directory (anchored to root) belongs to the docs team
/docs/ @docs

# Every Go file, anywhere
*.go @go

# Everything under internal, at any depth
/internal/** @core

# Later rule overrides the glob above for this specific file
/internal/secret.go @security
`

func TestOwners(t *testing.T) {
	rs := Parse(sample)

	cases := []struct {
		path string
		want []string
	}{
		// "* @a" — the catch-all owns any path...
		{"some/random/file.txt", []string{"@a"}},
		// "/docs/ @docs" — a rooted trailing-slash dir owns its contents...
		{"docs/x.md", []string{"@docs"}},
		// ...but not a docs/ nested elsewhere (anchored to root).
		{"src/docs/x.md", []string{"@a"}},
		// "*.go @go" — a bare suffix glob matches at any depth.
		{"cmd/api/main.go", []string{"@go"}},
		// "/internal/** @core" — ** spans segments under a rooted prefix.
		{"internal/x/y.go", []string{"@core"}},
		// Last match wins: the later, more specific rule overrides @core.
		{"internal/secret.go", []string{"@security"}},
	}

	for _, c := range cases {
		if got := rs.Owners(c.path); !reflect.DeepEqual(got, c.want) {
			t.Errorf("Owners(%q) = %v, want %v", c.path, got, c.want)
		}
	}
}

func TestOwnersNoMatch(t *testing.T) {
	// No catch-all, so a path matching nothing returns nil.
	rs := Parse("/docs/ @docs\n")
	if got := rs.Owners("src/main.go"); got != nil {
		t.Errorf("Owners on unmatched path = %v, want nil", got)
	}
}

func TestParseSkipsCommentsAndBlanks(t *testing.T) {
	rs := Parse("# just a comment\n\n   \n# another\n")
	if len(rs.rules) != 0 {
		t.Fatalf("expected no rules from comments/blanks, got %d", len(rs.rules))
	}
	if got := rs.Owners("anything"); got != nil {
		t.Errorf("Owners on empty ruleset = %v, want nil", got)
	}
}

func TestMultipleOwnersPerRule(t *testing.T) {
	rs := Parse("*.go @go @org/team owner@example.com\n")
	want := []string{"@go", "@org/team", "owner@example.com"}
	if got := rs.Owners("main.go"); !reflect.DeepEqual(got, want) {
		t.Errorf("Owners = %v, want %v", got, want)
	}
}

func TestNilRulesetOwners(t *testing.T) {
	var rs *Ruleset
	if got := rs.Owners("any/path.go"); got != nil {
		t.Errorf("(*Ruleset)(nil).Owners = %v, want nil", got)
	}
}
