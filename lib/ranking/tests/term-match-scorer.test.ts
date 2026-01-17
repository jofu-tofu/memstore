import { describe, test, expect } from 'bun:test';
import { calculateTermMatchScore } from '../term-match-scorer';

describe('Term Match Scorer', () => {
  describe('basic scoring', () => {
    test('should return 1.0 when all terms match (5 of 5)', () => {
      const score = calculateTermMatchScore(5, 5);
      expect(score).toBe(1.0);
    });

    test('should return 0.75 when 3 of 4 terms match (AC requirement)', () => {
      const score = calculateTermMatchScore(3, 4);
      expect(score).toBe(0.75);
    });

    test('should return 1.0 when all 3 terms match', () => {
      const score = calculateTermMatchScore(3, 3);
      expect(score).toBe(1.0);
    });

    test('should return 0.5 when 1 of 2 terms match', () => {
      const score = calculateTermMatchScore(1, 2);
      expect(score).toBe(0.5);
    });

    test('should return 1.0 when single term matches (1 of 1)', () => {
      const score = calculateTermMatchScore(1, 1);
      expect(score).toBe(1.0);
    });

    test('should return 0.0 when no terms match', () => {
      const score = calculateTermMatchScore(0, 5);
      expect(score).toBe(0.0);
    });
  });

  describe('edge cases', () => {
    test('should return 0 when totalTerms is 0', () => {
      const score = calculateTermMatchScore(0, 0);
      expect(score).toBe(0);
    });

    test('should cap at 1.0 when all terms match (10 of 10)', () => {
      const score = calculateTermMatchScore(10, 10);
      expect(score).toBe(1.0);
    });

    test('should handle negative matchCount gracefully', () => {
      const score = calculateTermMatchScore(-1, 1);
      expect(score).toBe(0);
    });

    test('should handle single term query correctly (1 of 1 = 100%)', () => {
      const score = calculateTermMatchScore(1, 1);
      expect(score).toBe(1.0); // 1/1 = 1.0 (100%)
    });

    test('should handle partial match in multi-term query (2 of 5 = 40%)', () => {
      const score = calculateTermMatchScore(2, 5);
      expect(score).toBe(0.4); // 2/5 = 0.4 (40%)
    });
  });

  describe('percentage-based scoring', () => {
    test('should score based on percentage of matched terms', () => {
      const score50 = calculateTermMatchScore(1, 2);  // 50%
      const score67 = calculateTermMatchScore(2, 3);  // 67%
      const score75 = calculateTermMatchScore(3, 4);  // 75%
      const score100 = calculateTermMatchScore(4, 4); // 100%

      expect(score50).toBe(0.5);
      expect(score67).toBeCloseTo(0.67, 2);
      expect(score75).toBe(0.75);
      expect(score100).toBe(1.0);
    });

    test('should differentiate between match percentages correctly', () => {
      const score50 = calculateTermMatchScore(1, 2);  // 50%
      const score100 = calculateTermMatchScore(2, 2); // 100%
      expect(score100).toBeGreaterThan(score50);
      expect(score100 / score50).toBe(2); // 100% is 2x the score of 50%
    });
  });
});
