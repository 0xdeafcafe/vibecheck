// Package diffshape detects "mechanical" diffs: a single import or
// identifier rename applied identically across every changed line. The
// signature it returns (e.g. "evaluators.generated → evaluators") lets the
// UI collapse such churn so reviewers spend attention on real logic.
//
// Detection is purely structural and advisory — a false negative just means
// a diff is shown in full, never that a change is hidden.
package diffshape

import (
	"fmt"
	"strings"
)

// Analyze reports whether patch is a single repeated substring edit and, if
// so, its human-readable signature. An empty signature side renders as "∅".
// Returns (false, "") for anything that isn't a clean one-token rename:
// unequal +/- counts in any hunk, whole-line rewrites, multi-edit changes,
// or a patch with no hunks.
func Analyze(patch string) (mechanical bool, signature string) {
	if patch == "" || !strings.Contains(patch, "@@") {
		return false, ""
	}

	var (
		oldMid, newMid string
		seen           bool // a pair has fixed the expected (oldMid, newMid)
	)

	// Pairing is per hunk; a hunk with changed lines but unequal +/- counts
	// disqualifies the whole file.
	var removed, added []string
	flush := func() bool {
		if len(removed) == 0 && len(added) == 0 {
			return true
		}
		if len(removed) != len(added) {
			return false
		}
		for i := range removed {
			om, nm, ok := edit(removed[i], added[i])
			if !ok {
				return false
			}
			if !seen {
				oldMid, newMid, seen = om, nm, true
			} else if om != oldMid || nm != newMid {
				return false
			}
		}
		removed, added = nil, nil
		return true
	}

	inHunk := false
	for _, line := range strings.Split(patch, "\n") {
		line = strings.TrimSuffix(line, "\r")
		switch {
		case strings.HasPrefix(line, "@@"):
			if !flush() {
				return false, ""
			}
			inHunk = true
		case !inHunk:
			// File headers / preamble before the first hunk.
			continue
		case strings.HasPrefix(line, "---") || strings.HasPrefix(line, "+++"):
			continue
		case line == `\ No newline at end of file`:
			continue
		case strings.HasPrefix(line, "-"):
			removed = append(removed, line[1:])
		case strings.HasPrefix(line, "+"):
			added = append(added, line[1:])
		default:
			// Context lines (" ...") and blank lines are ignored.
			continue
		}
	}
	if !flush() {
		return false, ""
	}
	if !seen {
		return false, ""
	}
	return true, fmt.Sprintf("%s → %s", orEmpty(oldMid), orEmpty(newMid))
}

// edit reduces (old, new) to the single differing substring, expanded out to
// token boundaries. ok is false when the change isn't a clean one-token edit.
func edit(old, new string) (oldMid, newMid string, ok bool) {
	// Minimal common prefix / suffix; the suffix must not cross the prefix.
	p := 0
	for p < len(old) && p < len(new) && old[p] == new[p] {
		p++
	}
	s := 0
	for s < len(old)-p && s < len(new)-p &&
		old[len(old)-1-s] == new[len(new)-1-s] {
		s++
	}
	// Grow the window outward to identifier boundaries so the signature is a
	// readable token (e.g. ".generated" → "evaluators.generated").
	for p > 0 && isIdentChar(old[p-1]) {
		p--
	}
	for s > 0 && isIdentChar(old[len(old)-s]) {
		s--
	}

	oldMid = old[p : len(old)-s]
	newMid = new[p : len(new)-s]

	switch {
	case p == 0 && s == 0: // whole-line rewrite, not a token swap
		return "", "", false
	case oldMid == newMid:
		return "", "", false
	case strings.ContainsRune(oldMid, ' ') || strings.ContainsRune(newMid, ' '):
		return "", "", false
	case len(oldMid) > 60 || len(newMid) > 60:
		return "", "", false
	}
	return oldMid, newMid, true
}

// isIdentChar reports whether b can sit inside a rename token. "/" is a token
// boundary (not an ident char) so the signature stays the trailing path
// component rather than the whole import path.
func isIdentChar(b byte) bool {
	switch {
	case b >= 'A' && b <= 'Z':
		return true
	case b >= 'a' && b <= 'z':
		return true
	case b >= '0' && b <= '9':
		return true
	case b == '_' || b == '.' || b == '$' || b == '-':
		return true
	}
	return false
}

func orEmpty(s string) string {
	if s == "" {
		return "∅"
	}
	return s
}
