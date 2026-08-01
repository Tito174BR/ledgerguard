import { describe, expect, it } from 'vitest';
import { evaluateRule, summarizeRisk } from './index.js';

describe('fraud engine', () => {
  it('flags duplicate activity', () => {
    const result = evaluateRule(
      {
        id: '1',
        name: 'Duplicidade',
        kind: 'DUPLICATE',
        score: 60,
        severity: 'HIGH',
        config: { threshold: 2 }
      },
      {
        amount: 10,
        duplicateCount: 2,
        velocityCount: 1
      }
    );

    expect(result.matched).toBe(true);
    expect(summarizeRisk([result]).level).toBe('HIGH');
  });
});
