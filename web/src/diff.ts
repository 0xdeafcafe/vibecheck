export interface DiffRow {
  kind: 'hunk' | 'context' | 'add' | 'del';
  oldLine?: number;
  newLine?: number;
  text: string;
}

// Parses a GitHub unified-diff patch string into rows with line numbers.
export function parsePatch(patch: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of patch.split('\n')) {
    if (line.startsWith('@@')) {
      const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldLine = Number(m[1]);
        newLine = Number(m[2]);
      }
      rows.push({ kind: 'hunk', text: line });
    } else if (line.startsWith('+')) {
      rows.push({ kind: 'add', newLine, text: line.slice(1) });
      newLine++;
    } else if (line.startsWith('-')) {
      rows.push({ kind: 'del', oldLine, text: line.slice(1) });
      oldLine++;
    } else if (line.startsWith('\\')) {
      rows.push({ kind: 'context', text: line });
    } else {
      rows.push({ kind: 'context', oldLine, newLine, text: line.slice(1) });
      oldLine++;
      newLine++;
    }
  }
  return rows;
}
