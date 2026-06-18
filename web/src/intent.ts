import { ClassifiedFile } from './api';
import { parsePatch } from './diff';

// Heuristic one-line summary of an intent doc (ADR / Gherkin .feature) from
// its patch — no AI. Prefers the first markdown heading or `Feature:`/`Rule:`
// line among the added lines (that's the decision title / feature name),
// then falls back to the first real added prose line.
export function summarizeIntent(file: ClassifiedFile): string {
  if (!file.patch) return '';
  const added = parsePatch(file.patch)
    .filter((r) => r.kind === 'add')
    .map((r) => r.text.trim())
    .filter(Boolean);

  const heading = added.find((l) => /^#{1,3}\s+\S/.test(l));
  if (heading) return heading.replace(/^#{1,3}\s+/, '');

  const feature = added.find((l) => /^(Feature|Rule|Scenario):\s*\S/i.test(l));
  if (feature) return feature.replace(/^\w+:\s*/, '');

  // First substantive prose line: skip frontmatter, list markers, tables.
  const prose = added.find(
    (l) => l.length > 12 && !l.startsWith('---') && !/^[-*|>`#]/.test(l),
  );
  return prose ?? '';
}
