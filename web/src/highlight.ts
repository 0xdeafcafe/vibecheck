import { useSyncExternalStore } from 'react';
import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';

// Syntax highlighting via Shiki (the TextMate grammars VS Code ships),
// loaded lazily on first diff render. We use the fine-grained core bundle
// with explicit lang/theme imports so only what we list ships — not all
// ~200 of Shiki's grammars. Tokenization is per line: multi-line
// constructs lose context, but it's cheap and good enough for diffs. Two
// themes load; theme.ts calls setSyntaxTheme() so a light/dark switch just
// re-renders.

type Theme = 'light' | 'dark';

const LIGHT_THEME = 'github-light';
const DARK_THEME = 'github-dark-default';

// Map a file extension to a Shiki language id. Every value here must have a
// matching import() in warmSyntax().
const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'jsx', mjs: 'javascript', cjs: 'javascript',
  go: 'go', py: 'python', rb: 'ruby', rs: 'rust', java: 'java',
  kt: 'kotlin', kts: 'kotlin', css: 'css', scss: 'scss', sass: 'scss',
  json: 'json', jsonc: 'json', md: 'markdown', markdown: 'markdown',
  sh: 'bash', bash: 'bash', zsh: 'bash', sql: 'sql', html: 'html',
  vue: 'html', xml: 'xml', svg: 'xml', yml: 'yaml', yaml: 'yaml',
  feature: 'gherkin',
};

let hl: HighlighterCore | null = null;
let loadStarted = false;
let theme: Theme = 'light';
const cache = new Map<string, string>(); // `${theme}|${lang}|${text}` -> html
const subs = new Set<() => void>();
let version = 0;

function notify() {
  version++;
  subs.forEach((f) => f());
}

// Kick off the (async, code-split) Shiki load. Safe to call repeatedly.
export function warmSyntax() {
  if (hl || loadStarted) return;
  loadStarted = true;
  createHighlighterCore({
    themes: [
      import('shiki/themes/github-light.mjs'),
      import('shiki/themes/github-dark-default.mjs'),
    ],
    langs: [
      import('shiki/langs/typescript.mjs'),
      import('shiki/langs/tsx.mjs'),
      import('shiki/langs/javascript.mjs'),
      import('shiki/langs/jsx.mjs'),
      import('shiki/langs/go.mjs'),
      import('shiki/langs/python.mjs'),
      import('shiki/langs/ruby.mjs'),
      import('shiki/langs/rust.mjs'),
      import('shiki/langs/java.mjs'),
      import('shiki/langs/kotlin.mjs'),
      import('shiki/langs/css.mjs'),
      import('shiki/langs/scss.mjs'),
      import('shiki/langs/json.mjs'),
      import('shiki/langs/markdown.mjs'),
      import('shiki/langs/bash.mjs'),
      import('shiki/langs/sql.mjs'),
      import('shiki/langs/html.mjs'),
      import('shiki/langs/xml.mjs'),
      import('shiki/langs/yaml.mjs'),
      import('shiki/langs/gherkin.mjs'),
    ],
    engine: createOnigurumaEngine(import('shiki/wasm')),
  })
    .then((h) => {
      hl = h;
      notify();
    })
    .catch((err) => console.error('shiki: failed to load', err));
}

export function setSyntaxTheme(t: Theme) {
  if (t === theme) return;
  theme = t;
  notify(); // cache is keyed by theme, so just re-render
}

export function languageFor(filename: string): string | undefined {
  const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
  return EXT_LANG[ext];
}

// Returns escaped (uncoloured) HTML until the highlighter has loaded, then
// themed token spans. Components subscribe via useSyntax() to re-render
// once it's ready.
export function highlightLine(text: string, language?: string): string {
  if (!language) return escapeHtml(text);
  warmSyntax();
  if (!hl) return escapeHtml(text);

  const key = `${theme}|${language}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let html: string;
  try {
    const { tokens } = hl.codeToTokens(text, {
      lang: language,
      theme: theme === 'dark' ? DARK_THEME : LIGHT_THEME,
    });
    html = (tokens[0] ?? [])
      .map((t) => `<span style="color:${t.color}">${escapeHtml(t.content)}</span>`)
      .join('');
  } catch {
    html = escapeHtml(text);
  }
  cache.set(key, html);
  return html;
}

// Hook: re-renders the caller when the highlighter loads or the theme flips.
export function useSyntax(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}

function subscribe(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
