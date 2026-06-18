---
status: accepted
date: 2026-06-10
decision-makers: [afr]
---

# Diff stratification via built-in heuristics, with per-repo config planned

## Context and Problem Statement

vibecheck's core reading experience classifies every file in a PR into
one of four strata: **intent** (ADRs, .feature specs), **core logic**,
**tests**, and **generated** artifacts. Intent is surfaced first as the
lens to read the rest against; generated files are collapsed by default.

How should classification work in v1 — built-in heuristics, per-repo
configuration, or both? See
[specs/review-a-pull-request.feature](../../specs/review-a-pull-request.feature)
for the behavioural contract.

## Decision Drivers

- Zero-setup: the tool must be useful on a repo that has never heard of it.
- Repos differ wildly (monorepos, generated SDK dirs, unusual layouts);
  heuristics will misclassify some of them.
- Misclassification must be cheap to recover from in the UI (a collapsed
  generated file can be expanded; a misfiled test still renders).

## Considered Options

1. Built-in heuristics only
2. Per-repo config file only (`.vibecheck.yml`)
3. Heuristics now, per-repo config as a planned layer on top

## Decision Outcome

Chosen option: **3 — heuristics now, config later.** v1 ships pure
automatic classification; a `.vibecheck.yml` read from the PR's head
ref is the planned override mechanism (own ADR when designed).

v1 heuristic order (first match wins):

1. **Generated**: `linguist-generated` via `.gitattributes`; lockfiles
   (`package-lock.json`, `go.sum`, `Cargo.lock`, `yarn.lock`,
   `pnpm-lock.yaml`, …); well-known generated paths/suffixes
   (`*.pb.go`, `*_gen.go`, `*.generated.*`, `dist/`, `__snapshots__/`,
   `openapi`-output dirs, vendored deps).
2. **Intent**: `docs/adr/**`, `docs/decisions/**`, `*.feature`,
   `docs/rfc/**`, plus the PR title/description (always shown in the
   intent panel even when no intent files changed).
3. **Tests**: `*_test.go`, `*.test.*`, `*.spec.*`, `tests/`, `test/`,
   `__tests__/`, `spec/` path segments.
4. **Core logic**: everything else (the fallback stratum).

Classification is advisory presentation, never destructive: every
stratum is visible and expandable; nothing is hidden irrecoverably.

### Consequences

- Good: works on any repo with no setup; heuristics cover the
  overwhelmingly common cases.
- Bad: exotic layouts will misclassify until config lands; mitigated by
  the advisory-only rule.
- Neutral: heuristic list will grow; it lives in one Go package with
  table-driven tests so additions are one-line changes.

## Pros and Cons of the Options

### Built-in heuristics only

- Good: simplest.
- Bad: no escape hatch ever for weird repos.

### Per-repo config only

- Good: always correct where present.
- Bad: useless on the vast majority of repos with no config — fails the
  zero-setup driver.

## Amendment (2026-06-18): docs stratum + mechanical clustering

Two heuristic additions, consistent with the "advisory, never
destructive" rule and the expectation that the heuristic list would grow.

1. **`docs` stratum.** Generic prose (`.md`/`.mdx`/`.markdown`/`.rst`/
   `.adoc` anywhere; any `docs/` segment; top-level README/CHANGELOG/
   CONTRIBUTING) previously fell through to **core**, polluting the reading
   surface. It now classifies as **docs**, slotted after tests and before
   generated in reading order. ADRs and `*.feature` still win as **intent**
   (the docs step runs after intent). One-line additions to `classify.go`
   with table-driven test rows.

2. **Mechanical clustering — a new, cross-stratum dimension.** Path-based
   stratification can't see that 31 one-line files are all the *same* edit
   (e.g. an import rename). A new `internal/diffshape` pass reads each
   file's patch and reports `(mechanical, signature)`: a file is
   *mechanical* when its entire patch reduces to one repeated token swap,
   and `signature` is the canonical `old → new` edit. The frontend groups
   files sharing a signature (≥4) into a single collapsed "cluster" group
   that sinks below every stratum — noise you scan once, not review
   file-by-file. GitHub's `previous_filename` is also surfaced so true
   renames read as `A → B`. Detection is language-agnostic string work on
   the server; clustering is presentation on the client.

   See [20260618-visual-design-system.md](20260618-visual-design-system.md)
   for how clusters render.
