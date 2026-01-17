import { describe, test, expect } from 'bun:test';
import { calculateRecencyScore } from '../recency-scorer';

describe('Recency Scorer', () => {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  describe('basic decay', () => {
    test('should return 1.0 for newly created segment', () => {
      const now = Date.now();
      const score = calculateRecencyScore(now, now, 14);
      expect(score).toBe(1.0);
    });

    test('should return ~0.5 at exactly half-life (14 days)', () => {
      const now = Date.now();
      const fourteenDaysAgo = now - (14 * MS_PER_DAY);
      const score = calculateRecencyScore(fourteenDaysAgo, now, 14);
      expect(score).toBeCloseTo(0.5, 3);
    });

    test('should return ~0.25 at two half-lives (28 days)', () => {
      const now = Date.now();
      const twentyEightDaysAgo = now - (28 * MS_PER_DAY);
      const score = calculateRecencyScore(twentyEightDaysAgo, now, 14);
      expect(score).toBeCloseTo(0.25, 3);
    });

    test('should return ~0.906 for 2-day-old segment (14-day half-life)', () => {
      const now = Date.now();
      const twoDaysAgo = now - (2 * MS_PER_DAY);
      const score = calculateRecencyScore(twoDaysAgo, now, 14);
      expect(score).toBeCloseTo(0.906, 2);
    });

    test('should return ~0.707 for 7-day-old segment (14-day half-life)', () => {
      const now = Date.now();
      const sevenDaysAgo = now - (7 * MS_PER_DAY);
      const score = calculateRecencyScore(sevenDaysAgo, now, 14);
      expect(score).toBeCloseTo(0.707, 2);
    });

    test('should return ~0.051 for 60-day-old segment (14-day half-life)', () => {
      const now = Date.now();
      const sixtyDaysAgo = now - (60 * MS_PER_DAY);
      const score = calculateRecencyScore(sixtyDaysAgo, now, 14);
      expect(score).toBeCloseTo(0.051, 2);
    });

    test('should return ~0.012 for 90-day-old segment (14-day half-life)', () => {
      const now = Date.now();
      const ninetyDaysAgo = now - (90 * MS_PER_DAY);
      const score = calculateRecencyScore(ninetyDaysAgo, now, 14);
      expect(score).toBeCloseTo(0.012, 2);
    });
  });

  describe('custom half-life', () => {
    test('should respect custom 7-day half-life', () => {
      const now = Date.now();
      const sevenDaysAgo = now - (7 * MS_PER_DAY);
      const score = calculateRecencyScore(sevenDaysAgo, now, 7);
      expect(score).toBeCloseTo(0.5, 3);
    });

    test('should respect custom 30-day half-life', () => {
      const now = Date.now();
      const thirtyDaysAgo = now - (30 * MS_PER_DAY);
      const score = calculateRecencyScore(thirtyDaysAgo, now, 30);
      expect(score).toBeCloseTo(0.5, 3);
    });

    test('should decay slower with longer half-life', () => {
      const now = Date.now();
      const tenDaysAgo = now - (10 * MS_PER_DAY);

      const score14 = calculateRecencyScore(tenDaysAgo, now, 14);
      const score30 = calculateRecencyScore(tenDaysAgo, now, 30);

      // With 30-day half-life, 10 days should score higher than 14-day half-life
      expect(score30).toBeGreaterThan(score14);
    });
  });

  describe('edge cases', () => {
    test('should handle future timestamp gracefully (clock skew)', () => {
      const now = Date.now();
      const futureTime = now + (5 * MS_PER_DAY);
      const score = calculateRecencyScore(futureTime, now, 14);
      expect(score).toBe(1.0); // Treat as newest
    });

    test('should handle very old segments (approach 0 but never negative)', () => {
      const now = Date.now();
      const veryOld = now - (365 * MS_PER_DAY); // 1 year ago
      const score = calculateRecencyScore(veryOld, now, 14);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(0.01);
    });

    test('should handle same timestamp (0 elapsed)', () => {
      const now = Date.now();
      const score = calculateRecencyScore(now, now, 14);
      expect(score).toBe(1.0);
    });
  });

  // Story 6.3: Dual-Recency Tests
  describe('dual recency (creation + access)', () => {
    test('should use dual-recency when lastAccessed is provided', () => {
      const now = Date.now();
      const createdAt = now - (30 * MS_PER_DAY); // Created 30 days ago
      const lastAccessed = now - (2 * MS_PER_DAY); // Accessed 2 days ago

      const score = calculateRecencyScore(createdAt, now, 14, lastAccessed);

      // With dual-recency: 40% creation + 60% access
      const creationRecency = Math.pow(0.5, 30 / 14); // ~0.225
      const accessRecency = Math.pow(0.5, 2 / 14); // ~0.906
      const expectedScore = 0.4 * creationRecency + 0.6 * accessRecency; // ~0.634

      expect(score).toBeCloseTo(expectedScore, 2);
    });

    test('should apply penalty when lastAccessed is null (never-accessed)', () => {
      const now = Date.now();
      const createdAt = now - (14 * MS_PER_DAY);

      const score = calculateRecencyScore(createdAt, now, 14, null);

      // Never-accessed segments get 50% penalty on creation recency
      // Creation recency at 14 days = 0.5
      // With 50% penalty: 0.5 * 0.5 = 0.25
      expect(score).toBeCloseTo(0.25, 3);
    });

    test('should apply penalty for never-accessed segments', () => {
      const now = Date.now();
      const createdAt = now - (7 * MS_PER_DAY);

      const scoreWithoutAccess = calculateRecencyScore(createdAt, now, 14, null);
      const scoreWithAccess = calculateRecencyScore(createdAt, now, 14, now - (1 * MS_PER_DAY));

      // Never-accessed should score lower than recently accessed
      expect(scoreWithoutAccess).toBeLessThan(scoreWithAccess);
    });

    test('should prioritize recently accessed over old creations', () => {
      const now = Date.now();

      // Old segment, recently accessed
      const oldCreated = now - (90 * MS_PER_DAY);
      const recentlyAccessed = now - (1 * MS_PER_DAY);

      const scoreOldButActive = calculateRecencyScore(oldCreated, now, 14, recentlyAccessed);

      // New segment, never accessed
      const recentlyCreated = now - (7 * MS_PER_DAY);
      const scoreNewButUnused = calculateRecencyScore(recentlyCreated, now, 14, null);

      // Recently accessed old segment should score higher than never-accessed new segment
      expect(scoreOldButActive).toBeGreaterThan(scoreNewButUnused);
    });

    test('should handle lastAccessed older than creation gracefully', () => {
      const now = Date.now();
      const createdAt = now - (10 * MS_PER_DAY);
      const invalidLastAccessed = now - (20 * MS_PER_DAY); // Before creation (invalid)

      // When lastAccessed is invalid (before creation), should fall back to pure creation recency
      // (no penalty, since we're just ignoring bad data rather than treating as "never accessed")
      const score = calculateRecencyScore(createdAt, now, 14, invalidLastAccessed);
      const pureCreationScore = calculateRecencyScore(createdAt, now, 14); // No 4th parameter = pure creation recency

      expect(score).toBeCloseTo(pureCreationScore, 3);
    });
  });

  describe('backwards compatibility', () => {
    test('should handle same timestamp (0 elapsed)', () => {
      const timestamp = Date.now();
      const score = calculateRecencyScore(timestamp, timestamp, 14);
      expect(score).toBe(1.0);
    });

    test('should handle millisecond precision', () => {
      const now = Date.now();
      const oneMinuteAgo = now - (60 * 1000);
      const score = calculateRecencyScore(oneMinuteAgo, now, 14);
      // Should be very close to 1.0 (nearly no decay)
      expect(score).toBeGreaterThan(0.999);
    });
  });

  describe('decay curve properties', () => {
    test('should monotonically decrease as time increases', () => {
      const now = Date.now();
      const scores: number[] = [];

      // Sample at various time points
      for (let days = 0; days <= 60; days += 10) {
        const timestamp = now - (days * MS_PER_DAY);
        scores.push(calculateRecencyScore(timestamp, now, 14));
      }

      // Verify each score is less than or equal to the previous
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
      }
    });

    test('should never return negative scores', () => {
      const now = Date.now();
      const extremelyOld = now - (1000 * MS_PER_DAY);
      const score = calculateRecencyScore(extremelyOld, now, 14);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    test('should never exceed 1.0 for valid past timestamps', () => {
      const now = Date.now();
      const oneDayAgo = now - MS_PER_DAY;
      const score = calculateRecencyScore(oneDayAgo, now, 14);
      expect(score).toBeLessThanOrEqual(1.0);
    });
  });
});
