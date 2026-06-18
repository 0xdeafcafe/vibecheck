---
status: accepted
date: 2026-06-18
decision-makers: [afr]
---

# The review plan: rank attention by intent × provenance × ownership

## Context and Problem Statement

A research review of the code-review literature (see
[docs/research/code-review-in-the-ai-era.md](../research/code-review-in-the-ai-era.md))
surfaced three findings that converge on one idea:

1. Review's real product is **understanding**, not defect-catching
   (defects are ~14–15% of review comments across three independent
   datasets); its #1 unmet need is the **rationale** — *why* a change was
   made — which no diff tool supplies.
2. AI-generated code moves the bottleneck from writing to **verifying**:
   volume explodes, trust falls, and the new failure mode is code that
   *nobody* — author or reviewer — can explain.
3. Reviewer effectiveness is dominated by **file familiarity/ownership**,
   not seniority; the same PR should be prioritised differently for
   different reviewers.

Three "blue-sky" rethinks each answer the same question from one axis —
*where should scarce human attention go, and with what context?* — and the
risk is shipping them as three disconnected features. How do they cohere?

## Decision Outcome

Treat them as **three signals into one attention-allocation engine**. For a
given reviewer on a given PR, rank each hunk/group and render a personalised
**review plan**:

> **priority = (distance from intent) × (lack of proof / AI-provenance risk) × (reviewer ownership/fit)**, capped by the empirical size/pace limits, then **rendered through the existing stratification UI** (strata, clusters, collapse, minimap).

- **Intent (A)** is the yardstick — what "correct" means here.
- **Provenance (B)** is the risk — which hunks are least proven/explained.
- **Ownership (C)** is the fit — who *you* are relative to this code.

Crucially, nothing already built is discarded: stratification, mechanical
clustering, heavy-group collapse, the minimap, viewed-tracking, export and
the closed loop become the **expression layer** of the ranking. The rethinks
give the existing UI a brain rather than bolting on new surfaces.

### v1 scope (this ADR ships)

- **Ownership (C) via CODEOWNERS** — a new `internal/codeowners` heuristic
  (parse + gitignore-style match) fetched from the PR base ref; per file
  the server returns `owners`, `ownedByViewer` (direct `@login` match;
  team membership not resolved), `unowned`. This is the keystone: it gives
  an *instant* expertise map with no review history (solving the cockpit
  cold-start) and is public repo data, so the server stays stateless.
- **Ownership-aware ranking** — `groups.ts` floats the viewer's owned areas
  to the top of the stratified order (clusters still sink). The 200-file PR
  becomes "here are *your* areas first."
- **Provenance (B), first cut** — a per-PR `aiAuthored` signal from commit
  authorship/trailers; surfaced as a "verify, don't skim" cue.
- **Cockpit surfacing** — a banner ("you own N of M files; K unowned"),
  per-file/group ownership badges, and an "only my areas" filter.

### Roadmap (next bricks, not in v1)

- Per-hunk provenance (churn/clone smells à la GitClear; commit→file
  mapping) and the provenance × ownership cross ("AI-written, untested, in
  *your* area" = the top of the plan).
- Intent-clause mapping (A): on-device LLM maps hunks to intent clauses and
  flags "no stated purpose" / "requirement with no code or test".
- Cockpit memory (C): client-only (IndexedDB) history of your notes per
  file; content-anchored viewed-state + "changes since I last looked"
  (survives force-push — the most-requested missing GitHub primitive).
- Attestation on the closed loop (B): per-region "I ran this / verified
  against spec" travelling back to GitHub.

## Decision Drivers

- **Zero-setup**: must degrade gracefully — no CODEOWNERS, no intent, or a
  brand-new reviewer all still work; absent signals just drop out of the
  product, they don't block.
- **Advisory, never destructive** (inherited rule): the engine reorders and
  collapses; everything stays one click away.
- **Stateless + private**: ranking inputs are public repo data + request-time
  heuristics; all *personalisation* lives client-side. The Go server learns
  nothing about the reviewer.
- **Heuristics over AI for structure**; the AI stays the user's own (export)
  or on-device (summaries), never a server-side judge.

### Consequences

- Good: the three rethinks land as one coherent spine; each new signal is a
  pluggable ranking input, shippable independently.
- Good: CODEOWNERS alone is high-leverage and self-contained.
- Bad: ranking quality depends on signal availability; mitigated by graceful
  degradation and the advisory rule.
- Neutral: team-ownership resolution and per-hunk provenance are deferred;
  flagged above so the gaps are explicit.

## Considered Options

1. Ship the three rethinks as independent features.
2. **One attention engine; the rethinks are ranking signals; existing UI is
   the renderer.** (chosen)
3. Build an AI reviewer that does the ranking judgement itself — rejected:
   the literature shows AI reviewers drown teams in false positives (up to
   ~40% of alerts ignored), which is why vibecheck has no built-in reviewer.
