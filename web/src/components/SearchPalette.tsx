import { useEffect, useMemo, useRef, useState } from 'react';
import { ClassifiedFile, Stratum } from '../api';
import { parsePatch } from '../diff';

interface Result {
  file: string;
  stratum: Stratum;
  rowIdx?: number; // undefined = filename match
  line?: number;
  text: string;
}

const STRATUM_TEXT: Record<Stratum, string> = {
  intent: 'text-violet-400',
  core: 'text-sky-400',
  tests: 'text-emerald-400',
  generated: 'text-zinc-500',
};

const MAX_RESULTS = 60;

// Native ⌘F can't see into collapsed files or reason about the page
// structure — this searches the PR's data model instead, then drives
// the DOM to the match.
function search(files: ClassifiedFile[], query: string): Result[] {
  const q = query.toLowerCase();
  const out: Result[] = [];
  for (const f of files) {
    if (out.length >= MAX_RESULTS) break;
    if (f.filename.toLowerCase().includes(q)) {
      out.push({ file: f.filename, stratum: f.stratum, text: f.filename });
    }
    if (!f.patch) continue;
    const rows = parsePatch(f.patch);
    for (let i = 0; i < rows.length && out.length < MAX_RESULTS; i++) {
      const row = rows[i];
      if (row.kind === 'hunk') continue;
      if (row.text.toLowerCase().includes(q)) {
        out.push({
          file: f.filename,
          stratum: f.stratum,
          rowIdx: i,
          line: row.newLine ?? row.oldLine,
          text: row.text.trim(),
        });
      }
    }
  }
  return out;
}

function jumpTo(r: Result) {
  const details = document.querySelector<HTMLDetailsElement>(
    `details[data-file="${CSS.escape(r.file)}"]`,
  );
  if (!details) return;
  details.open = true;
  const target =
    r.rowIdx !== undefined
      ? details.querySelector(`[data-row="${r.rowIdx}"]`)
      : details;
  target?.scrollIntoView({ block: 'center' });
  target?.classList.remove('flash');
  // restart the animation if the same row is hit twice
  void (target as HTMLElement | null)?.offsetWidth;
  target?.classList.add('flash');
}

interface Props {
  files: ClassifiedFile[];
  open: boolean;
  onClose: () => void;
}

export function SearchPalette({ files, open, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => (query.length >= 2 ? search(files, query) : []),
    [files, query],
  );

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      // focus after the overlay mounts
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setSelected(0), [results.length]);

  if (!open) return null;

  function pick(r: Result) {
    onClose();
    // close the overlay first so scrollIntoView isn't fighting it
    requestAnimationFrame(() => jumpTo(r));
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
      pick(results[selected]);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="mx-auto mt-[12vh] w-full max-w-xl overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search files and diff lines…"
          className="w-full border-b border-zinc-800 bg-transparent px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
        />
        <ul className="max-h-[50vh] overflow-y-auto">
          {results.map((r, i) => (
            <li key={`${r.file}:${r.rowIdx ?? 'f'}:${i}`}>
              <button
                className={`flex w-full items-baseline gap-2 px-4 py-1.5 text-left text-xs ${
                  i === selected ? 'bg-violet-600/20' : 'hover:bg-zinc-800/60'
                }`}
                onMouseEnter={() => setSelected(i)}
                onClick={() => pick(r)}
              >
                <span className={`shrink-0 font-mono ${STRATUM_TEXT[r.stratum]}`}>
                  {r.rowIdx === undefined ? r.file : `${shortPath(r.file)}:${r.line ?? '?'}`}
                </span>
                {r.rowIdx !== undefined && (
                  <span className="truncate font-mono text-zinc-400">{r.text}</span>
                )}
              </button>
            </li>
          ))}
          {query.length >= 2 && results.length === 0 && (
            <li className="px-4 py-3 text-xs text-zinc-500">No matches.</li>
          )}
          {query.length < 2 && (
            <li className="px-4 py-3 text-xs text-zinc-600">
              Type 2+ characters — searches every changed file, including collapsed ones.
            </li>
          )}
        </ul>
        {results.length >= MAX_RESULTS && (
          <p className="border-t border-zinc-800 px-4 py-1.5 text-[10px] text-zinc-600">
            Showing first {MAX_RESULTS} matches — refine the query.
          </p>
        )}
      </div>
    </div>
  );
}

function shortPath(p: string): string {
  const parts = p.split('/');
  return parts.length <= 2 ? p : `…/${parts.slice(-2).join('/')}`;
}
