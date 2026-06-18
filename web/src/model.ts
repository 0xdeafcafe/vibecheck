import { useSyncExternalStore } from 'react';

// Which on-device summarizer model to pull. Bigger = better summaries but a
// larger one-time download (cached by the browser after first use). The
// choice is the user's — persisted in localStorage.
export interface ModelOption {
  id: string;
  label: string;
  size: string;
  note: string;
}

export const MODELS: ModelOption[] = [
  { id: 'onnx-community/gemma-3-270m-it-ONNX', label: 'Gemma 270M', size: '~250 MB', note: 'fastest, roughest' },
  { id: 'onnx-community/gemma-3-1b-it-ONNX', label: 'Gemma 1B', size: '~1 GB', note: 'balanced' },
  { id: 'onnx-community/gemma-3-4b-it-ONNX', label: 'Gemma 4B', size: '~3 GB', note: 'best, heaviest' },
];

const KEY = 'vibecheck:tldr-model';
const DEFAULT = MODELS[1].id; // 1B
const subs = new Set<() => void>();

export function getModel(): string {
  const v = localStorage.getItem(KEY);
  return MODELS.some((m) => m.id === v) ? (v as string) : DEFAULT;
}

export function setModel(id: string): void {
  localStorage.setItem(KEY, id);
  subs.forEach((f) => f());
}

export function subscribe(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function useModel(): string {
  return useSyncExternalStore(subscribe, getModel, getModel);
}

// Short tag (270m / 1b / 4b) used to namespace the summary cache per model.
export function modelTag(id: string): string {
  return id.match(/gemma-3-([^-]+)-it/)?.[1] ?? 'm';
}
