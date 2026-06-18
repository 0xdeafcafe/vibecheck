import { ReviewGroup } from './groups';

export type RiskLevel = 'high' | 'med' | 'low';
export interface Risk {
  level: RiskLevel;
  reasons: string[];
}

// Heuristic risk for a review group, grounded in the research: sensitive
// paths (auth/crypto/privacy/migrations), the >400-LOC danger band, churn,
// unowned code, AI-authored core logic, and new code shipped without tests.
const SENSITIVE =
  /(auth|oauth|login|session|token|secret|password|crypt|security|privacy|redact|permission|rbac|authz|payment|billing|migration|webhook|cookie)/i;

export function groupRisk(g: ReviewGroup, aiAuthored: boolean): Risk {
  if (g.kind === 'cluster' || g.dominant === 'generated') {
    return { level: 'low', reasons: [] };
  }
  const reasons: string[] = [];
  let score = 0;
  const churn = g.additions + g.deletions;

  if (g.files.some((f) => SENSITIVE.test(f.filename))) {
    score += 3;
    reasons.push('sensitive paths');
  }
  if (churn > 1500) {
    score += 3;
    reasons.push('very large');
  } else if (churn > 400) {
    score += 2;
    reasons.push('over the 400-line band');
  }
  if (g.dominant === 'core') score += 1;
  if (g.files.some((f) => f.unowned)) {
    score += 1;
    reasons.push('unowned');
  }
  if (aiAuthored && g.dominant === 'core') {
    score += 1;
    reasons.push('AI-authored');
  }
  const addsCode = g.files.some((f) => f.status === 'added' && f.stratum === 'core');
  if (addsCode && !(g.strata.tests ?? 0)) {
    score += 1;
    reasons.push('new code, no tests');
  }

  const level: RiskLevel = score >= 5 ? 'high' : score >= 3 ? 'med' : 'low';
  return { level, reasons };
}
