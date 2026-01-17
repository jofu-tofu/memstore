import { describe, test, expect } from 'bun:test';
import { calculateDecay } from './decay';

describe('Decay Calculation', () => {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  describe('basic decay', () => {
    test('should return 1.0 for newly created segment', () => {
      const now = Date.now();
      const decay = calculateDecay(now, now, 14);
      expect(decay).toBe(1.0);
    });

    test('should return ~0.5 at exactly half-life (14 days)', () => {
      const now = Date.now();
      const fourteenDaysAgo = now - (14 * MS_PER_DAY);
      const decay = calculateDecay(fourteenDaysAgo, now, 14);
      expect(decay).toBeCloseTo(0.5, 3);
    });

    test('should return ~0.25 at two half-lives (28 days)', () => {
      const now = Date.now();
      const twentyEightDaysAgo = now - (28 * MS_PER_DAY);
      const decay = calculateDecay(twentyEightDaysAgo, now, 14);
      expect(decay).toBeCloseTo(0.25, 3);
    });

    test('should return ~0.906 for 2-day-old segment (14-day half-life)', () => {
      const now = Date.now();
      const twoDaysAgo = now - (2 * MS_PER_DAY);
      const decay = calculateDecay(twoDaysAgo, now, 14);
      expect(decay).toBeCloseTo(0.906, 2);
    });
  });

  describe('edge cases', () => {
    test('should handle negative time differences gracefully', () => {
      const now = Date.now();
      const futureTime = now + (5 * MS_PER_DAY);
      const decay = calculateDecay(futureTime, now, 14);
      // Should clamp to exactly 1, not exceed due to floating-point precision
      expect(decay).toBe(1);
    });

    test('should handle very small negative time differences', () => {
      const now = Date.now();
      const slightlyFuture = now + 1; // 1 millisecond in future
      const decay = calculateDecay(slightlyFuture, now, 14);
      expect(decay).toBe(1);
    });

    test('should never exceed 1.0', () => {
      const now = Date.now();
      // Test various edge cases that might cause floating-point issues
      const testCases = [
        now + 1,      // 1ms future
        now + 100,    // 100ms future
        now + 1000,   // 1s future
        now + MS_PER_DAY, // 1 day future
      ];

      for (const timestamp of testCases) {
        const decay = calculateDecay(timestamp, now, 14);
        expect(decay).toBeLessThanOrEqual(1);
        expect(decay).toBe(1);
      }
    });

    test('should handle very old segments (approach 0 but never negative)', () => {
      const now = Date.now();
      const veryOld = now - (365 * MS_PER_DAY); // 1 year ago
      const decay = calculateDecay(veryOld, now, 14);
      expect(decay).toBeGreaterThan(0);
      expect(decay).toBeLessThan(0.01);
    });

    test('should handle same timestamp (0 elapsed)', () => {
      const now = Date.now();
      const decay = calculateDecay(now, now, 14);
      expect(decay).toBe(1.0);
    });
  });

  describe('custom half-life', () => {
    test('should respect custom 7-day half-life', () => {
      const now = Date.now();
      const sevenDaysAgo = now - (7 * MS_PER_DAY);
      const decay = calculateDecay(sevenDaysAgo, now, 7);
      expect(decay).toBeCloseTo(0.5, 3);
    });

    test('should respect custom 30-day half-life', () => {
      const now = Date.now();
      const thirtyDaysAgo = now - (30 * MS_PER_DAY);
      const decay = calculateDecay(thirtyDaysAgo, now, 30);
      expect(decay).toBeCloseTo(0.5, 3);
    });
  });

  describe('decay curve properties', () => {
    test('should monotonically decrease as time increases', () => {
      const now = Date.now();
      const decays: number[] = [];

      for (let days = 0; days <= 60; days += 10) {
        const timestamp = now - (days * MS_PER_DAY);
        decays.push(calculateDecay(timestamp, now, 14));
      }

      for (let i = 1; i < decays.length; i++) {
        expect(decays[i]).toBeLessThanOrEqual(decays[i - 1]);
      }
    });

    test('should never return negative values', () => {
      const now = Date.now();
      const extremelyOld = now - (1000 * MS_PER_DAY);
      const decay = calculateDecay(extremelyOld, now, 14);
      expect(decay).toBeGreaterThanOrEqual(0);
    });
  });
});
