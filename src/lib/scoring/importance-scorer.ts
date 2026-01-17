/**
 * Importance Scoring Component
 *
 * Calculates relevance based on segment importance rating.
 * Higher importance segments (better quality, more valuable) score higher.
 *
 * Part of Story 2.4: Result Ranking
 */

/**
 * Calculate importance score from segment importance rating.
 *
 * Segments have importance ratings from 0-100 that indicate their quality
 * and value. This function normalizes the rating to a 0-1 score for ranking.
 *
 * @param importanceValue - Importance rating 0-100
 * @returns Normalized score 0-1 (where 1.0 = maximum importance)
 *
 * @example
 * ```typescript
 * calculateImportanceScore(80);  // Returns 0.80
 * calculateImportanceScore(50);  // Returns 0.50
 * calculateImportanceScore(0);   // Returns 0.00
 * ```
 */
export function calculateImportanceScore(importanceValue: number): number {
  // Handle missing or invalid values
  if (importanceValue < 0) {
    console.error(
      `[Memory:ImportanceScorer] Negative importance (${importanceValue}), using 0`
    );
    return 0;
  }

  if (importanceValue > 100) {
    console.error(
      `[Memory:ImportanceScorer] Importance > 100 (${importanceValue}), capping at 1.0`
    );
    return 1.0;
  }

  // Normalize 0-100 scale to 0-1 range
  return importanceValue / 100;
}
