export interface FraudContext {
  amount: number;
  duplicateCount: number;
  velocityCount: number;
  lastCardTsn?: number | null;
  cardTsn?: number | null;
  distanceKm?: number | null;
}

export interface FraudRule {
  id: string;
  kind: 'DUPLICATE' | 'VELOCITY' | 'AMOUNT' | 'TSN' | 'GEO' | 'CUSTOM';
  score: number;
  severity: string;
  config: Record<string, unknown>;
  name: string;
}

export interface RuleResult {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  score: number;
  reason: string;
  severity: string;
}

const asNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export function evaluateRule(rule: FraudRule, context: FraudContext): RuleResult {
  let matched = false;
  let reason = 'Regra não acionada';

  if (rule.kind === 'DUPLICATE') {
    const threshold = asNumber(rule.config.threshold, 2);
    matched = context.duplicateCount >= threshold;
    reason = `${context.duplicateCount} ocorrência(s) para a mesma chave; limite ${threshold}`;
  }

  if (rule.kind === 'VELOCITY') {
    const threshold = asNumber(rule.config.maxCount, 3);
    matched = context.velocityCount >= threshold;
    reason = `${context.velocityCount} uso(s) na janela; limite ${threshold}`;
  }

  if (rule.kind === 'AMOUNT') {
    const threshold = asNumber(rule.config.maxAmount, 1000);
    matched = context.amount >= threshold;
    reason = `Valor ${context.amount.toFixed(2)}; limite ${threshold.toFixed(2)}`;
  }

  if (rule.kind === 'TSN') {
    const delta =
      context.lastCardTsn == null || context.cardTsn == null
        ? 0
        : context.cardTsn - context.lastCardTsn;
    const maxDelta = asNumber(rule.config.maxDelta, 10);
    matched = delta < 0 || delta > maxDelta;
    reason = `Variação TSN ${delta}; intervalo permitido 0..${maxDelta}`;
  }

  if (rule.kind === 'GEO') {
    const maxKm = asNumber(rule.config.maxDistanceKm, 50);
    matched = (context.distanceKm ?? 0) > maxKm;
    reason = `Distância estimada ${(context.distanceKm ?? 0).toFixed(1)} km; limite ${maxKm} km`;
  }

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    matched,
    score: matched ? rule.score : 0,
    reason,
    severity: rule.severity
  };
}

export function summarizeRisk(results: RuleResult[]): {
  score: number;
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reasons: string[];
} {
  const score = Math.min(100, results.reduce((sum, result) => sum + result.score, 0));
  const level =
    score >= 80 ? 'CRITICAL' : score >= 55 ? 'HIGH' : score >= 25 ? 'MEDIUM' : 'LOW';

  return {
    score,
    level,
    reasons: results.filter((result) => result.matched).map((result) => result.reason)
  };
}
