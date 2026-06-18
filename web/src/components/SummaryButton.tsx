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
    try {
      setSummary(await summarize(cacheKey, getText(), kind));
    } catch (err) {
      console.error('tl;dr failed', err);
    } finally {
      setWorking(false);
      setProgress(null);
    }
  }

  if (summary) {
    return (
      <div className="rounded-md border border-accent/20 bg-accent-soft px-2.5 py-1.5 text-xs leading-relaxed text-ink">
        <span className="font-semibold text-accent">✨ tl;dr</span> {summary}
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
        : label}
    </button>
  );
}
