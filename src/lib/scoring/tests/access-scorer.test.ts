import { describe, test, expect } from 'bun:test';
import { calculateAccessScore } from '../access-scorer';

describe('Access Scorer', () => {
  describe('basic scoring', () => {
    test('should return 0.0 for never accessed (0)', () => {
      const score = calculateAccessScore(0);
      expect(score).toBe(0.0);
    });

    test('should return 0.05 for 1 access', () => {
      const score = calculateAccessScore(1);
      expect(score).toBe(0.05);
    });

    test('should return 0.25 for 5 accesses', () => {
      const score = calculateAccessScore(5);
      expect(score).toBe(0.25);
    });

    test('should return 0.50 for 10 accesses', () => {
      const score = calculateAccessScore(10);
      expect(score).toBe(0.5);
    });

    test('should return 0.75 for 15 accesses', () => {
      const score = calculateAccessScore(15);
      expect(score).toBe(0.75);
    });

    test('should return 1.0 for 20 accesses (saturation point)', () => {
      const score = calculateAccessScore(20);
      expect(score).toBe(1.0);
    });
  });

  describe('saturation behavior', () => {
    test('should saturate at 1.0 for 20+ accesses', () => {
      const score20 = calculateAccessScore(20);
      const score30 = calculateAccessScore(30);
      const score50 = calculateAccessScore(50);
      const score100 = calculateAccessScore(100);

      expect(score20).toBe(1.0);
      expect(score30).toBe(1.0);
      expect(score50).toBe(1.0);
      expect(score100).toBe(1.0);
    });

    test('should not exceed 1.0 for very large access counts', () => {
      const score = calculateAccessScore(99999);
      expect(score).toBe(1.0);
    });

    test('should be linear before saturation point', () => {
      const score5 = calculateAccessScore(5);
      const score10 = calculateAccessScore(10);

      expect(score10).toBe(score5 * 2);
    });
  });

  describe('edge cases', () => {
    test('should handle negative access count gracefully', () => {
      const score = calculateAccessScore(-5);
      expect(score).toBe(0);
    });

    test('should handle decimal access counts', () => {
      const score = calculateAccessScore(7.5);
      expect(score).toBe(0.375);
    });
  });

  describe('score distribution', () => {
    test('should maintain monotonic increase up to saturation', () => {
      const scores: number[] = [];
      for (let i = 0; i <= 20; i++) {
        scores.push(calculateAccessScore(i));
      }

      // Verify each score is >= previous
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
      }
    });

    test('should maintain constant after saturation', () => {
      const scores: number[] = [];
      for (let i = 20; i <= 40; i++) {
        scores.push(calculateAccessScore(i));
      }

      // All should be 1.0
      scores.forEach(score => {
        expect(score).toBe(1.0);
      });
    });

    test('should cover full 0-1 range', () => {
      const minScore = calculateAccessScore(0);
      const maxScore = calculateAccessScore(20);

      expect(minScore).toBe(0);
      expect(maxScore).toBe(1.0);
    });
  });

  describe('typical use cases', () => {
    test('should differentiate rarely vs frequently accessed', () => {
      const rare = calculateAccessScore(2);   // 0.10
      const common = calculateAccessScore(10); // 0.50

      expect(common).toBeGreaterThan(rare);
      expect(common / rare).toBeCloseTo(5, 0);
    });

    test('should not over-weight popular segments', () => {
      const popular = calculateAccessScore(20);    // 1.00 (saturated)
      const veryPopular = calculateAccessScore(100); // 1.00 (saturated)

      // Both saturated - no additional benefit
      expect(popular).toBe(veryPopular);
    });
  });
});
