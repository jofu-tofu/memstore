/**
 * Access Count Scoring Component
 *
 * Calculates relevance based on how frequently a segment has been accessed.
 * Uses saturation to prevent heavily-accessed segments from dominating results.
 *
 * Part of Story 2.4: Result Ranking
 */

/**
 * Calculate access frequency score with saturation.
 *
 * Saturates at 20+ accesses to prevent heavily-accessed memories
 * from completely dominating the results. This provides a "wisdom of
 * the crowd" signal without over-weighting popular segments.
 *
 * @param accessCount - Number of times segment has been accessed
 * @returns Normalized score 0-1 (where 1.0 = 20+ accesses)
 *
 * @example
 * ```typescript
 * calculateAccessScore(0);   // Returns 0.00 (never accessed)
 * calculateAccessScore(10);  // Returns 0.50 (half of saturation)
 * calculateAccessScore(20);  // Returns 1.00 (saturated)
 * calculateAccessScore(50);  // Returns 1.00 (saturated)
 * ```
 *
 * Saturation curve:
 * | Access Count | Score |
 * |--------------|-------|
 * | 0            | 0.00  |
 * | 1            | 0.05  |
 * | 5            | 0.25  |
 * | 10           | 0.50  |
 * | 15           | 0.75  |
 * | 20           | 1.00  | <- saturation point
 * | 50           | 1.00  | (saturated)
 * | 100          | 1.00  | (saturated)
 */
export function calculateAccessScore(accessCount: number): number {
  const SATURATION_POINT = 20;

  if (accessCount < 0) {
    console.error(
      `[Memory:AccessScorer] Negative access count (${accessCount}), using 0`
    );
    return 0;
  }

  // Linear up to saturation point, then capped at 1.0
  return Math.min(accessCount / SATURATION_POINT, 1.0);
}
