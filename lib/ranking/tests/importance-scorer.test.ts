import { describe, test, expect } from 'bun:test';
import { calculateImportanceScore } from '../importance-scorer';

describe('Importance Scorer', () => {
  describe('basic scoring', () => {
    test('should return 1.0 for maximum importance (100)', () => {
      const score = calculateImportanceScore(100);
      expect(score).toBe(1.0);
    });

    test('should return 0.8 for importance 80', () => {
      const score = calculateImportanceScore(80);
      expect(score).toBe(0.8);
    });

    test('should return 0.5 for importance 50', () => {
      const score = calculateImportanceScore(50);
      expect(score).toBe(0.5);
    });

    test('should return 0.2 for importance 20', () => {
      const score = calculateImportanceScore(20);
      expect(score).toBe(0.2);
    });

    test('should return 0.0 for minimum importance (0)', () => {
      const score = calculateImportanceScore(0);
      expect(score).toBe(0.0);
    });
  });

  describe('edge cases', () => {
    test('should cap at 1.0 for importance > 100', () => {
      const score = calculateImportanceScore(150);
      expect(score).toBe(1.0);
    });

    test('should handle negative importance gracefully', () => {
      const score = calculateImportanceScore(-10);
      expect(score).toBe(0);
    });

    test('should handle very large importance values', () => {
      const score = calculateImportanceScore(99999);
      expect(score).toBe(1.0);
    });
  });

  describe('fractional values', () => {
    test('should handle decimal importance values', () => {
      const score = calculateImportanceScore(75.5);
      expect(score).toBe(0.755);
    });

    test('should handle small decimal values', () => {
      const score = calculateImportanceScore(5.25);
      expect(score).toBe(0.0525);
    });
  });

  describe('normalization', () => {
    test('should maintain linear relationship', () => {
      const score1 = calculateImportanceScore(25);
      const score2 = calculateImportanceScore(50);
      const score3 = calculateImportanceScore(75);

      expect(score2).toBe(score1 * 2);
      expect(score3).toBe(score1 * 3);
    });

    test('should preserve ordering', () => {
      const scores: number[] = [];
      for (let i = 0; i <= 100; i += 10) {
        scores.push(calculateImportanceScore(i));
      }

      // Verify monotonically increasing
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
      }
    });
  });
});
