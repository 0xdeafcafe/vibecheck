// theme.ts — system-aware light/dark with a manual override.
//
// `pref` is what the user picked ('system' | 'light' | 'dark'); `resolved`
// is the actual theme after consulting the OS when pref==='system'. We
// always reflect the *resolved* value onto <html data-theme> so the CSS
// only has to reason about two states, and tell the syntax highlighter to
// re-tokenize. An inline script in index.html applies the same value
// before first paint to avoid a flash.

import { setSyntaxTheme } from './highlight';

export type ThemePref = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const KEY = 'vibecheck-theme';
const subs = new Set<() => void>();

export function getPref(): ThemePref {
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolvedTheme(): Theme {
  const p = getPref();
  return p === 'system' ? systemTheme() : p;
}

function apply() {
  const t = resolvedTheme();
  document.documentElement.dataset.theme = t;
  setSyntaxTheme(t);
  subs.forEach((f) => f());
}

export function setPref(pref: ThemePref) {
  if (pref === 'system') localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, pref);
  apply();
}

export function initTheme() {
  apply();
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (getPref() === 'system') apply();
    });
}

// useSyncExternalStore plumbing for the toggle.
export function subscribe(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
