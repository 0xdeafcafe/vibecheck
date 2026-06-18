---
status: accepted
date: 2026-06-18
decision-makers: [afr]
---

# Visual design system: warm editorial palette, tri-typeface, token-driven theming

## Context and Problem Statement

v1 shipped a dark-only UI with hardcoded `zinc`/`violet` Tailwind
utilities scattered across every component. We want a deliberate brand:
system-theme aware (light/dark), a serif display face, a sans face for the
dense working surface, mono for code, and a "light, happy" palette
(oranges, blues, greens) in the spirit of the Orchid landing pages.

The tension: those references are *marketing* pages (huge type, oceans of
whitespace). vibecheck is an information-dense diff-triage tool. The system
has to keep the warmth and type hierarchy while staying tight enough to
read a 200-file PR. And in a diff tool, colour already carries meaning —
green/red are add/remove — so a "happy palette" can't be applied naively.

## Decision Drivers

- System-theme aware, with a manual override that survives reload.
- Type hierarchy: serif = display, sans = dense UI/body, mono = code/paths.
- Warm, friendly palette — but legibility first (deep-navy ink on warm
  white; warm-navy charcoal, not black, in dark).
- A restyle should be a one-file edit, not a sweep across every component.
- Zero new heavy runtime: no component framework, no CSS-in-JS.

## Considered Options

1. Extend the existing dark-only zinc theme with `dark:`/`light:` variants.
2. A semantic design-token layer in Tailwind v4 `@theme`, themed by
   swapping `--color-*` values under `[data-theme]`.
3. Adopt a component library (shadcn/Radix) and its theming.

## Decision Outcome

Chosen option: **2 — a semantic design-token layer.**

- **Tokens, not raw colours.** `styles.css` defines semantic tokens
  (`--color-canvas`, `--color-ink`, `--color-surface`, `--color-accent`,
  `--color-add`, `--color-st-*`, …) in `@theme`; components reference the
  generated utilities (`bg-canvas`, `text-ink`, `bg-st-intent`). Light is
  the default; dark overrides the same `--color-*` names under
  `:root[data-theme='dark']`. Switching theme is a value swap — no `dark:`
  variants anywhere.
- **Theme control.** `theme.ts` resolves `system | light | dark` against
  `matchMedia`, reflects the resolved value onto `<html data-theme>`, and
  persists the preference. An inline script in `index.html` applies it
  before first paint (no FOUC). The resolved theme is also pushed to the
  syntax highlighter.
- **Type.** Serif **Fraunces** (variable, warm `SOFT` axis, expressive
  italic) for display moments only — the wordmark, PR title, section and
  empty-state headings; **Inter** for the dense working surface and body;
  **JetBrains Mono** for code and file paths. Self-hosted via Fontsource
  (no CDN — matches the stateless, on-device-Gemma, no-tracking posture).
- **Colour, split by job.** Brand accents are **blue (primary)** and
  **orange (the spark)**. **Green and red are reserved** for diff
  add/remove and the conventional open/approve, request/reject states —
  never decorative. This is why the `tests` stratum is **teal**, not
  green: green stays "added".
- **Syntax highlighting** moved from highlight.js (per-line, dark-only,
  weak on TSX) to **Shiki** with `github-light` + `github-dark-default`,
  fine-grained bundle (only the ~19 languages we use), lazy-loaded and
  re-rendered on theme flip. (Own concern, recorded here because it shares
  the theme plumbing.)

### Consequences

- Good: a restyle (or tuning the exact orange) is a one-file token edit;
  light/dark is free; the brand-vs-semantic colour split keeps the action
  colour from competing with red=danger.
- Good: serif/sans/mono reinforce the stratified-reading model — display
  for orientation, sans for working, mono for code.
- Bad: a one-time refactor of every component off raw `zinc/violet`
  utilities onto tokens (~200 call sites).
- Neutral: Shiki ships a wasm engine + per-language grammar chunks
  (lazy). The `ruby` grammar in particular is large; acceptable since it
  only loads when a `.rb` file is highlighted. Per-line tokenization still
  loses multi-line constructs — a future per-hunk pass can fix that.

## Pros and Cons of the Options

### Extend the dark-only zinc theme

- Good: least up-front work.
- Bad: every component needs `dark:` variants; raw colours don't theme;
  the "one-file restyle" goal is impossible.

### Component library (shadcn/Radix)

- Good: batteries-included theming + a11y primitives.
- Bad: heavy for a focused tool; imposes its own visual language; large
  dependency surface against the "minimal, no framework" architecture.
