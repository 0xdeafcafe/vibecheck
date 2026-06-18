import { useSyncExternalStore } from 'react';
import { MODELS, getModel, setModel, subscribe } from '../model';

// Pick the on-device tl;dr model. A bigger model summarises better but is a
// larger one-time download.
export function ModelPicker() {
  const id = useSyncExternalStore(subscribe, getModel, getModel);
  return (
    <label
      className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-muted"
      title="On-device summariser model — bigger summarises better but is a larger one-time download"
    >
      <span aria-hidden>✨</span>
      <select
        value={id}
        onChange={(e) => setModel(e.target.value)}
        className="cursor-pointer bg-transparent font-medium text-muted outline-none hover:text-ink"
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id} className="bg-surface text-ink">
            {m.label} · {m.size}
          </option>
        ))}
      </select>
    </label>
  );
}
