import { useCallback, useState } from 'react';

// Per-PR viewed-file tracking, persisted in localStorage. GitHub has a
// matching markFileAsViewed GraphQL mutation — sync lands once real
// app auth does; local-first means it works in dev mode too.
export function useViewed(owner: string, repo: string, number: number) {
  const key = `vibecheck:viewed:${owner}/${repo}#${number}`;
  const [viewed, setViewed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });

  const update = useCallback(
    (mutate: (next: Set<string>) => void) => {
      setViewed((prev) => {
        const next = new Set(prev);
        mutate(next);
        try {
          localStorage.setItem(key, JSON.stringify([...next]));
        } catch {
          // storage full / private mode — viewed state stays in-memory
        }
        return next;
      });
    },
    [key],
  );

  const setFileViewed = useCallback(
    (filename: string, value: boolean) =>
      update((next) => {
        if (value) next.add(filename);
        else next.delete(filename);
      }),
    [update],
  );

  const setManyViewed = useCallback(
    (filenames: string[], value: boolean) =>
      update((next) => {
        for (const f of filenames) {
          if (value) next.add(f);
          else next.delete(f);
        }
      }),
    [update],
  );

  return { viewed, setFileViewed, setManyViewed };
}
