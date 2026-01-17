/**
 * Term Match Scoring Component
 *
 * Calculates relevance based on how many search terms matched the segment.
 * Part of Story 2.4: Result Ranking
 */

/**
 * Calculate term match score based on percentage of query terms matched.
 *
 * Per AC (Story 2.4): "Given a segment matching 3 of 4 search terms,
 * When termMatchCount is calculated, Then it scores 75% (3/4 = 0.75)"
 *
 * The term match score represents how well a segment matches the user's search query
 * as a percentage of total search terms.
 *
 * @param matchCount - Number of search terms that matched this segment
 * @param totalTerms - Total number of search terms in query
 * @returns Normalized score 0-1 (where 1.0 = all terms matched)
 *
 * @example
 * ```typescript
 * // Segment matched 3 of 4 terms
 * calculateTermMatchScore(3, 4); // Returns 0.75 (75%)
 * // Segment matched all 5 terms
 * calculateTermMatchScore(5, 5); // Returns 1.0 (100%)
 * // Segment matched 2 of 3 terms
 * calculateTermMatchScore(2, 3); // Returns 0.67 (67%)
 * ```
 */
export function calculateTermMatchScore(
  matchCount: number,
  totalTerms: number
): number {
  // Handle edge case: no search terms
  if (totalTerms === 0) {
    console.error('[Memory:TermMatchScorer] No search terms provided, returning 0');
    return 0;
  }

  // Handle negative values
  if (matchCount < 0) {
    console.error(
      `[Memory:TermMatchScorer] Negative matchCount (${matchCount}), using 0`
    );
    return 0;
  }

  // Per AC: score = matchCount / totalTerms (e.g., 3/4 = 0.75)
  // Cap at 1.0 in case matchCount somehow exceeds totalTerms
  return Math.min(matchCount / totalTerms, 1.0);
}
