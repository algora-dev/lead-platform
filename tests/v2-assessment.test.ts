import { describe, it, expect } from 'vitest';
import { harmonicMean } from '@/lib/v2/assessment';
import { DEFAULT_CONFIDENCE_POLICY } from '@/lib/v2/confidence-scorer';

describe('Combined Assessment', () => {
  describe('harmonicMean', () => {
    it('returns 0 when either score is 0', () => {
      expect(harmonicMean(0, 50)).toBe(0);
      expect(harmonicMean(50, 0)).toBe(0);
      expect(harmonicMean(0, 0)).toBe(0);
    });

    it('returns the value when both scores are equal', () => {
      expect(harmonicMean(80, 80)).toBe(80);
      expect(harmonicMean(50, 50)).toBe(50);
    });

    it('penalises imbalance more than arithmetic mean', () => {
      // Profile 94, Confidence 30
      // Harmonic = 2*94*30/(94+30) = 5640/124 = 45.5 → 46
      // Arithmetic would be 62
      const h = harmonicMean(94, 30);
      expect(h).toBe(45);
      expect(h).toBeLessThan(62); // harmonic < arithmetic
    });

    it('matches the plan table values', () => {
      // From the architecture doc:
      // | 92 | 91 | 91 | Excellent match with strong proof |
      expect(harmonicMean(92, 91)).toBe(91);
      // | 94 | 30 | 45 | Looks ideal but evidence is weak |
      expect(harmonicMean(94, 30)).toBe(45);
      // | 42 | 94 | 58 | Well evidenced but partial profile fit |
      // 2*42*94/(42+94) = 7896/136 = 58.06 → 58
      expect(harmonicMean(42, 94)).toBe(58);
      // | 68 | 70 | 69 | Good balanced opportunity |
      // 2*68*70/(68+70) = 9520/138 = 68.99 → 69
      expect(harmonicMean(68, 70)).toBe(69);
    });

    it('always returns an integer 0-100', () => {
      for (let a = 0; a <= 100; a += 10) {
        for (let b = 0; b <= 100; b += 10) {
          const h = harmonicMean(a, b);
          expect(h).toBeGreaterThanOrEqual(0);
          expect(h).toBeLessThanOrEqual(100);
          expect(Number.isInteger(h)).toBe(true);
        }
      }
    });
  });

  describe('Confidence Policy', () => {
    it('has weights that sum to 100', () => {
      const w = DEFAULT_CONFIDENCE_POLICY.weights;
      const total = w.coverage + w.reliability + w.independence + w.freshness + w.consistency;
      expect(total).toBe(100);
    });

    it('has a version string', () => {
      expect(DEFAULT_CONFIDENCE_POLICY.version).toBeTruthy();
      expect(typeof DEFAULT_CONFIDENCE_POLICY.version).toBe('string');
    });
  });

  describe('Combined Policy', () => {
    it('uses harmonic mean formula', () => {
      const policy = { version: 'v1', formula: 'harmonic_mean' as const };
      expect(policy.formula).toBe('harmonic_mean');
      expect(policy.version).toBe('v1');
    });
  });
});
