import { useEffect, useState } from 'react';

// A code-editor minimap, but contextual: instead of rendering text it
// shows the page's sections as colored regions (intent violet, core sky,
// tests emerald, generated zinc, review amber) with ticks at file
// boundaries and a draggable viewport indicator.

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

const SECTION_COLOR: Record<string, { color: string; label: string }> = {
  overview: { color: 'bg-zinc-600/60', label: 'Overview' },
  intent: { color: 'bg-violet-500/50', label: 'Intent' },
  core: { color: 'bg-sky-500/45', label: 'Core logic' },
  tests: { color: 'bg-emerald-500/45', label: 'Tests' },
  generated: { color: 'bg-zinc-500/35', label: 'Generated' },
  review: { color: 'bg-amber-500/45', label: 'Your review' },
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
        const meta = SECTION_COLOR[key];
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

  if (segments.length === 0) return null;

  return (
    <div
      className="fixed right-1.5 top-1/2 z-40 hidden h-[88vh] w-3 -translate-y-1/2 cursor-pointer rounded-full bg-zinc-900/80 ring-1 ring-zinc-800 lg:block"
      onMouseDown={jump}
      onMouseMove={(e) => e.buttons === 1 && jump(e)}
      title="Minimap — click to jump"
    >
      {segments.map((s) => (
        <div
          key={s.key}
          className={`absolute inset-x-0.5 rounded-sm ${s.color}`}
          style={{ top: `${s.top * 100}%`, height: `${Math.max(s.height * 100, 0.6)}%` }}
          title={s.label}
        />
      ))}
      {ticks.map((t, i) => (
        <div
          key={i}
          className="absolute inset-x-0 h-px bg-zinc-950/70"
          style={{ top: `${t.top * 100}%` }}
        />
      ))}
      <div
        className="absolute inset-x-0 rounded-full border border-zinc-300/40 bg-zinc-300/10"
        style={{
          top: `${viewport.top * 100}%`,
          height: `${Math.max(viewport.height * 100, 1.5)}%`,
        }}
      />
    </div>
  );
}
