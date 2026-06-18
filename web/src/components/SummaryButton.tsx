import { useEffect, useState } from 'react';
import { cachedSummary, onModelProgress, summarize, type SummaryKind } from '../llm';
import { useModel } from '../model';

interface Props {
  cacheKey: string;
  kind: SummaryKind;
  getText: () => string;
  label?: string;
}

// On-device Gemma tl;dr. A button until summarised, then a full-width wrapping
// panel (never truncated). Reused for comments, files, slices and intent.
export function SummaryButton({ cacheKey, kind, getText, label = '✨ tl;dr' }: Props) {
  const model = useModel();
  const [summary, setSummary] = useState<string | null>(() => cachedSummary(cacheKey));
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  // re-read the cache when the model (hence the cache key) changes
  useEffect(() => {
    setSummary(cachedSummary(cacheKey));
  }, [cacheKey, model]);

  useEffect(() => {
    if (!working) return;
    return onModelProgress(setProgress);
  }, [working]);

  async function run(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setWorking(true);
    setFailed(false);
    try {
      setSummary(await summarize(cacheKey, getText(), kind));
    } catch (err) {
      console.error('tl;dr failed', err);
      setFailed(true);
    } finally {
      setWorking(false);
      setProgress(null);
    }
  }

  if (summary) {
    // Multi-clause summaries read far better as bullets than one 12px blob.
    const points = summary
      .split(/(?:\.\s+|;\s+|\n+)/)
      .map((s) => s.trim().replace(/[.;]+$/, ''))
      .filter((s) => s.length > 2);
    return (
      <div className="rounded-lg border border-line border-l-2 border-l-accent bg-surface p-3 shadow-sm">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
          ✨ AI summary
        </div>
        {points.length > 1 ? (
          <ul className="ml-4 list-disc space-y-1 text-sm leading-relaxed text-ink marker:text-accent/50">
            {points.map((pt, i) => (
              <li key={i}>{pt}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-relaxed text-ink">{summary}</p>
        )}
      </div>
    );
  }
  return (
    <button
      onClick={run}
      disabled={working}
      className="shrink-0 rounded-md border border-line px-2 py-0.5 text-[11px] font-medium text-muted hover:bg-accent-soft hover:text-accent disabled:opacity-60"
      title="Summarize on-device with Gemma — first use downloads the model; no data leaves your machine"
    >
      {working
        ? progress !== null && progress < 100
          ? `model ${progress}%`
          : 'thinking…'
        : failed
          ? '↻ tl;dr failed — retry'
          : label}
    </button>
  );
}
