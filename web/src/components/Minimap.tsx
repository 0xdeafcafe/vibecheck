import { useEffect, useState } from 'react';

// A code-editor minimap, but contextual: instead of rendering text it
// shows the page's sections as colored regions (intent blue, core slate,
// tests teal, docs amber, generated muted, review orange) with ticks at
// file boundaries and a draggable viewport indicator. On hover it widens
// and reveals a clickable section legend.

interface Segment {
  key: string;
  top: number; // fraction of document height
  height: number;
  color: string;
  label: string;
}

interface Tick {
  top: number;
}

const SECTION: Record<string, { color: string; dot: string; label: string }> = {
  overview: { color: 'bg-muted/50', dot: 'bg-muted', label: 'Overview' },
  intent: { color: 'bg-st-intent/60', dot: 'bg-st-intent', label: 'Intent' },
  core: { color: 'bg-st-core/55', dot: 'bg-st-core', label: 'Core logic' },
  tests: { color: 'bg-st-tests/55', dot: 'bg-st-tests', label: 'Tests' },
  docs: { color: 'bg-st-docs/55', dot: 'bg-st-docs', label: 'Docs' },
  generated: { color: 'bg-st-generated/45', dot: 'bg-st-generated', label: 'Generated' },
  review: { color: 'bg-spark/55', dot: 'bg-spark', label: 'Your review' },
};

export function Minimap({ depsKey }: { depsKey: unknown }) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [viewport, setViewport] = useState({ top: 0, height: 0.1 });

  useEffect(() => {
    function measure() {
      const docH = document.documentElement.scrollHeight;
      if (docH === 0) return;
      const segs: Segment[] = [];
      document.querySelectorAll<HTMLElement>('[data-minimap]').forEach((el) => {
        const key = el.dataset.minimap!;
        const meta = SECTION[key];
        if (!meta) return;
        const rect = el.getBoundingClientRect();
        const top = rect.top + window.scrollY;
        segs.push({
          key,
          top: top / docH,
          height: rect.height / docH,
          color: meta.color,
          label: meta.label,
        });
      });
      setSegments(segs);

      const tks: Tick[] = [];
      document.querySelectorAll<HTMLElement>('details[data-file]').forEach((el) => {
        const top = el.getBoundingClientRect().top + window.scrollY;
        tks.push({ top: top / docH });
      });
      setTicks(tks);
      onScroll();
    }

    function onScroll() {
      const docH = document.documentElement.scrollHeight;
      setViewport({
        top: window.scrollY / docH,
        height: window.innerHeight / docH,
      });
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [depsKey]);

  function jump(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientY - rect.top) / rect.height;
    const docH = document.documentElement.scrollHeight;
    window.scrollTo({ top: frac * docH - window.innerHeight / 2 });
  }

  function jumpToSection(key: string) {
    document
      .querySelector(`[data-minimap="${key}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (segments.length === 0) return null;

  // Unique sections in document order for the hover legend.
  const sections: Segment[] = [];
  const seen = new Set<string>();
  for (const s of segments) {
    if (!seen.has(s.key)) {
      seen.add(s.key);
      sections.push(s);
    }
  }
  // De-cluster the labels so close sections don't overlap into an
  // unreadable, unclickable pile.
  const placed: { key: string; label: string; labelTop: number }[] = [];
  let lastTop = -Infinity;
  for (const s of sections) {
    const labelTop = Math.min(Math.max(s.top, lastTop + 0.045), 0.97);
    placed.push({ key: s.key, label: s.label, labelTop });
    lastTop = labelTop;
  }

  return (
    // Inset past the scrollbar (right-4) so it isn't clipped. `group` drives
    // the hover-expand of both the bar and the legend.
    <div className="group fixed right-4 top-1/2 z-40 hidden h-[82vh] -translate-y-1/2 lg:block">
      {/* Legend: labelled, clickable sections, aligned to their region.
          Hidden until you hover the minimap. */}
      {/* Labelled section index — persistent (not hover-only) and always
          clickable, de-clustered so close sections stay readable. */}
      <div className="absolute right-full top-0 mr-2 h-full w-44 opacity-70 transition-opacity duration-150 group-hover:opacity-100">
        {placed.map((s) => (
          <button
            key={s.key}
            onClick={() => jumpToSection(s.key)}
            style={{ top: `${s.labelTop * 100}%` }}
            className="absolute right-0 flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-surface/95 px-2 py-0.5 text-[11px] text-muted shadow-sm backdrop-blur hover:bg-raised hover:text-ink"
          >
            <span className={`size-1.5 rounded-full ${SECTION[s.key].dot}`} />
            {s.label}
          </button>
        ))}
      </div>

      {/* The bar itself — widens slightly on hover. */}
      <div
        className="relative h-full w-2 cursor-pointer rounded-full bg-surface/80 ring-1 ring-line transition-all duration-200 group-hover:w-3"
        onMouseDown={jump}
        onMouseMove={(e) => e.buttons === 1 && jump(e)}
        title="Minimap — click to jump, hover for sections"
      >
        {segments.map((s, i) => (
          <div
            key={`${s.key}:${i}`}
            className={`absolute inset-x-0.5 rounded-sm ${s.color}`}
            style={{ top: `${s.top * 100}%`, height: `${Math.max(s.height * 100, 0.6)}%` }}
            title={s.label}
          />
        ))}
        {ticks.map((t, i) => (
          <div
            key={i}
            className="absolute inset-x-0 h-px bg-ink/20"
            style={{ top: `${t.top * 100}%` }}
          />
        ))}
        <div
          className="absolute inset-x-0 rounded-full border border-ink/25 bg-ink/10"
          style={{
            top: `${viewport.top * 100}%`,
            height: `${Math.max(viewport.height * 100, 1.5)}%`,
          }}
        />
      </div>
    </div>
  );
}
