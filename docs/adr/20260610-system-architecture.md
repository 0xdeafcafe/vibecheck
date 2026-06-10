---
status: accepted
date: 2026-06-10
decision-makers: [afr]
---

# System architecture: Go API + React/Vite SPA, stateless GitHub App passthrough

## Context and Problem Statement

vibecheck is a web-based GitHub PR review client for the AI-coding era:
huge diffs, generated artifacts, intent docs (ADRs, .feature specs), and
noisy bot comments make GitHub's own review UX a poor fit. vibecheck lets
a reviewer read a stratified diff and submit a review, with GitHub
remaining the canonical system of record.

We need to pick the stack, topology, auth model, and persistence posture
for v1. See [specs/review-a-pull-request.feature](../../specs/review-a-pull-request.feature)
for the behavioural contract this decision supports.

## Decision Drivers

- Review-write access requires a server-held secret (GitHub App private
  key); a pure SPA cannot do this safely.
- GitHub must stay canonical — vibecheck should never become a second
  source of truth for review state.
- Side project: minimise operational surface (no DB to run, migrate, back up).
- Org admins must be able to grant scoped access via a familiar flow.

## Considered Options

1. Go API + React/Vite SPA, stateless passthrough (no database)
2. Full-stack Next.js (single deployable, server components)
3. Go API + SPA with a database from day one (cache diffs, store annotations)

## Decision Outcome

Chosen option: **1 — Go API + React/Vite SPA, stateless passthrough.**

- **Auth**: GitHub App. Users sign in via the app's OAuth flow
  ("user access tokens"); orgs grant access by installing the app with
  scoped permissions (Pull requests: read/write, Contents: read,
  Metadata: read). The Go API holds the app private key, mints/refreshes
  tokens, and keeps them in encrypted server-side session state
  (cookie-backed) — no token ever reaches the browser as plaintext
  beyond the session cookie.
- **Data**: nothing persisted. All PR, diff, file, and comment data is
  fetched live from the GitHub API per request. In-memory, per-process
  caching with short TTLs is permitted as an optimisation; it must be
  safe to lose at any moment.
- **Writes**: line comments, PR comments, and review verdicts
  (approve / request changes / comment) go straight to the GitHub API.
  vibecheck stores no copy.

### Consequences

- Good: zero data-layer ops; trivially horizontally scalable; nothing
  to leak if the server is compromised beyond live sessions.
- Good: GitHub canonical by construction — there is no second store to drift.
- Bad: every page load pays GitHub API latency and rate limits; large
  PRs (>300 files) need the paginated files API and careful budgeting.
- Bad: pillar 3 (session tray / stance annotations) will need
  client-side persistence (localStorage) or a future revisit of this
  decision; that revisit is expected and will be a new ADR.
- Neutral: two deployables (API binary, static SPA) instead of one.

### Confirmation

The repo contains no database driver or migration tooling; the API has
no write path except to api.github.com; killing and restarting the API
loses nothing but active sessions.

## Pros and Cons of the Options

### Full-stack Next.js

- Good: one deployable, fastest path to a working app.
- Bad: author's preference and fluency is Go for backend work; the API
  layer (GitHub App JWT signing, token exchange, webhook surface later)
  is the substantial part of this system and is better served by Go.

### Database from day one

- Good: ready for pillars 2–3 (annotation storage, bot-comment dedup state).
- Bad: pays ops cost now for features that are deliberately out of v1
  scope; risks vibecheck becoming a shadow review store, violating the
  GitHub-canonical constraint.
