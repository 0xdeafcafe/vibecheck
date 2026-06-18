import { useSyncExternalStore } from 'react';
import { getPref, setPref, subscribe, ThemePref } from '../theme';

const NEXT: Record<ThemePref, ThemePref> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};
const ICON: Record<ThemePref, string> = { system: '🖥', light: '☀', dark: '🌙' };
const LABEL: Record<ThemePref, string> = { system: 'System', light: 'Light', dark: 'Dark' };

// Cycles system → light → dark. Reflects the user's preference, not the
// resolved theme (the OS drives that when on "system").
export function ThemeToggle() {
  const pref = useSyncExternalStore(subscribe, getPref, getPref);
  return (
    <button
      onClick={() => setPref(NEXT[pref])}
      title={`Theme: ${LABEL[pref]} — click to change`}
      className="rounded-md border border-line px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:bg-raised hover:text-ink"
    >
      <span aria-hidden>{ICON[pref]}</span> {LABEL[pref]}
    </button>
  );
}
