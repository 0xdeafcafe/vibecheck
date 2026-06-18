import { useEffect, useMemo, useRef, useState } from 'react';

export interface Command {
  id: string;
  label: string;
  group?: string; // short category shown on the left
  hint?: string; // right-aligned (shortcut or current value)
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}

// ⌘K command bar — actions, not content (that's ⌘F's job). Same modal
// shape as the search palette: type to filter, arrows to move, enter runs.
export function CommandPalette({ open, onClose, commands }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      `${c.group ?? ''} ${c.label} ${c.hint ?? ''}`.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setSelected(0), [results.length]);

  if (!open) return null;

  function run(c: Command) {
    onClose();
    c.run();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && results[selected]) {
      e.preventDefault();
      run(results[selected]);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[1px]" onClick={onClose}>
      <div
        className="mx-auto mt-[12vh] w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a command…"
          className="w-full border-b border-line bg-transparent px-4 py-3 text-sm text-ink outline-none placeholder:text-faint"
        />
        <ul className="max-h-[50vh] overflow-y-auto py-1">
          {results.map((c, i) => (
            <li key={c.id}>
              <button
                className={`flex w-full items-center gap-2 px-4 py-1.5 text-left text-sm ${
                  i === selected ? 'bg-accent-soft' : 'hover:bg-raised'
                }`}
                onMouseEnter={() => setSelected(i)}
                onClick={() => run(c)}
              >
                {c.group && (
                  <span className="w-14 shrink-0 text-[10px] uppercase tracking-wide text-faint">
                    {c.group}
                  </span>
                )}
                <span className="text-ink">{c.label}</span>
                {c.hint && (
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-faint">{c.hint}</span>
                )}
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-4 py-3 text-xs text-muted">No matching command.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
