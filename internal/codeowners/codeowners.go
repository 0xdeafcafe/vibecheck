// Package codeowners parses a GitHub CODEOWNERS file and resolves the
// owners of a repo-relative path. Paths are matched with the gitignore
// subset GitHub supports; the last matching rule wins.
package codeowners

import (
	"regexp"
	"strings"
)

// rule is one CODEOWNERS line: a compiled pattern and its owners.
type rule struct {
	re     *regexp.Regexp
	owners []string
}

// Ruleset is the parsed CODEOWNERS file, rules in file order.
type Ruleset struct {
	rules []rule
}

// Parse reads CODEOWNERS content. Blank lines and `#` comments are
// skipped; each remaining line is `pattern owner1 owner2 ...` with
// whitespace-separated owners (@user, @org/team, or an email).
func Parse(content string) *Ruleset {
	rs := &Ruleset{}
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue // a pattern with no owners is not actionable
		}
		re := compile(fields[0])
		if re == nil {
			continue
		}
		rs.rules = append(rs.rules, rule{re: re, owners: fields[1:]})
	}
	return rs
}

// Owners returns the owners of path per the last matching rule, or nil.
func (r *Ruleset) Owners(path string) []string {
	if r == nil {
		return nil
	}
	path = strings.TrimPrefix(path, "/")
	// Last-match-wins (gitignore semantics): walk in reverse, first hit.
	for i := len(r.rules) - 1; i >= 0; i-- {
		if r.rules[i].re.MatchString(path) {
			return r.rules[i].owners
		}
	}
	return nil
}

// compile translates a CODEOWNERS pattern into an anchored regexp over
// repo-relative paths. Rules of the gitignore subset GitHub supports:
//   - a leading "/" anchors the pattern to the repo root;
//   - a trailing "/" matches a directory and everything beneath it;
//   - "*" matches within a single path segment (never "/");
//   - "**" matches across segments;
//   - a bare token (no leading "/") matches at any depth.
func compile(pattern string) *regexp.Regexp {
	anchored := strings.HasPrefix(pattern, "/")
	dirOnly := strings.HasSuffix(pattern, "/")
	trimmed := strings.Trim(pattern, "/")
	if trimmed == "" {
		return nil
	}

	// Escape regex metachars first, then re-introduce glob semantics on
	// the placeholder tokens (which escaping leaves intact).
	var b strings.Builder
	for i := 0; i < len(trimmed); i++ {
		switch c := trimmed[i]; c {
		case '*':
			if i+1 < len(trimmed) && trimmed[i+1] == '*' {
				b.WriteString(".*") // ** spans segments
				i++
			} else {
				b.WriteString("[^/]*") // * stays within a segment
			}
		default:
			b.WriteString(regexp.QuoteMeta(string(c)))
		}
	}
	body := b.String()

	// Anchor the head: rooted patterns start at the path's start; bare
	// tokens may begin after any "/" (i.e. at any depth).
	head := `^`
	if !anchored {
		head = `^(?:.*/)?`
	}
	// Anchor the tail: a directory pattern matches the dir and its
	// contents; otherwise the path may continue (file or subtree).
	tail := `(?:/.*)?$`
	if dirOnly {
		tail = `/.*$`
	}
	return regexp.MustCompile(head + body + tail)
}
