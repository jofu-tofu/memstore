/**
 * Recency Scoring Component
 *
 * Calculates relevance based on segment age using exponential decay.
 * Uses half-life approach to model how memory relevance decreases over time.
 *
 * Part of Story 2.4: Result Ranking
 * Part of Story 6.3: Decay Signal Tracking (dual-recency)
 */

/**
 * Weight distribution for dual-recency scoring.
 * Story 6.3: Balances creation freshness with access freshness.
 */
const CREATION_WEIGHT = 0.4; // 40% weight on when memory was created
const ACCESS_WEIGHT = 0.6;   // 60% weight on when memory was last accessed

/**
 * Penalty factor for never-accessed segments.
 * Story 6.3: Segments that have never been retrieved get penalized.
 */
const NEVER_ACCESSED_PENALTY = 0.5; // 50% penalty

/**
 * Calculate recency score using half-life exponential decay.
 *
 * **Story 6.3 Enhancement: Dual-Recency**
 *
 * When `lastAccessedMs` is provided, uses dual-recency scoring:
 * - 40% weight on creation recency (how long since created)
 * - 60% weight on access recency (how long since last accessed)
 *
 * This implements the "use it or lose it" pattern:
 * - Frequently accessed memories stay relevant (high access recency)
 * - Stale memories decay (low access recency)
 * - Never-accessed memories get a 50% penalty
 *
 * Half-life approach is more intuitive than raw exponential decay:
 * - After 1 half-life: score = 50%
 * - After 2 half-lives: score = 25%
 * - After 3 half-lives: score = 12.5%
 *
 * Formula: score = 0.5^(time_elapsed / half_life)
 *
 * This models human memory decay patterns observed in cognitive science.
 * Segments from recent sessions score higher than older ones.
 *
 * @param timestampMs - Segment creation timestamp in milliseconds
 * @param currentTimeMs - Current time in milliseconds
 * @param halfLifeDays - Days for score to drop to 50% (default: 14)
 * @param lastAccessedMs - Last access timestamp (Story 6.3, optional)
 * @returns Normalized score 0-1 (where 1.0 = just created/accessed)
 *
 * @example
 * ```typescript
 * const now = Date.now();
 * const twoDaysAgo = now - (2 * 24 * 60 * 60 * 1000);
 *
 * // Single recency (backwards compatible):
 * calculateRecencyScore(twoDaysAgo, now, 14); // Returns ~0.906 (90.6%)
 *
 * // Dual recency (Story 6.3):
 * const createdAt = now - (30 * 24 * 60 * 60 * 1000); // 30 days old
 * const lastAccessed = now - (2 * 24 * 60 * 60 * 1000); // Accessed 2 days ago
 * calculateRecencyScore(createdAt, now, 14, lastAccessed); // Returns ~0.634
 * // (40% creation recency + 60% access recency)
 * ```
 *
 * Decay curve with 14-day half-life:
 * | Age (days) | Score  |
 * |------------|--------|
 * | 0          | 1.000  |
 * | 2          | 0.906  |
 * | 7          | 0.707  |
 * | 14         | 0.500  | <- half-life
 * | 28         | 0.250  |
 * | 60         | 0.061  |
 * | 90         | 0.022  |
 */
export function calculateRecencyScore(
  timestampMs: number,
  currentTimeMs: number,
  halfLifeDays: number = 14,
  lastAccessedMs?: number | null
): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  /**
   * Calculate single recency score with exponential decay.
   * Helper function used for both creation and access recency.
   */
  const calculateSingleRecency = (fromTimeMs: number): number => {
    const elapsedDays = (currentTimeMs - fromTimeMs) / MS_PER_DAY;

    // Handle future timestamps (clock skew)
    if (elapsedDays < 0) {
      console.error(
        `[Memory:RecencyScorer] Future timestamp detected: ${elapsedDays.toFixed(2)} days. Using score 1.0`
      );
      return 1.0;
    }

    // Exponential decay: 0.5^(elapsed / half_life)
    return Math.pow(0.5, elapsedDays / halfLifeDays);
  };

  // Story 6.3: Dual-recency scoring (when lastAccessedMs parameter is explicitly provided)
  // Note: Distinguishes between "not provided" (undefined) and "null" (never accessed)
  if (lastAccessedMs === undefined) {
    // Backwards compatibility: no lastAccessed parameter provided at all
    // Use simple creation recency (original behavior from Story 2.4)
    return calculateSingleRecency(timestampMs);
  }

  if (lastAccessedMs === null) {
    // Story 6.3: Never-accessed segment (lastAccessed explicitly set to null)
    // Apply penalty to creation recency to deprioritize unused memories
    const creationRecency = calculateSingleRecency(timestampMs);
    const penalizedScore = creationRecency * NEVER_ACCESSED_PENALTY;
    return penalizedScore;
  }

  // lastAccessedMs is a valid timestamp - use dual-recency
  // Validate lastAccessed isn't before creation (data integrity check)
  if (lastAccessedMs < timestampMs) {
    console.error(
      `[Memory:RecencyScorer] lastAccessed (${lastAccessedMs}) < timestamp (${timestampMs}). Using creation recency only.`
    );
    // Fall back to creation recency if data is invalid
    return calculateSingleRecency(timestampMs);
  }

  // Calculate both components
  const creationRecency = calculateSingleRecency(timestampMs);
  const accessRecency = calculateSingleRecency(lastAccessedMs);

  // Weighted combination: 40% creation + 60% access
  const dualRecency = CREATION_WEIGHT * creationRecency + ACCESS_WEIGHT * accessRecency;

  return dualRecency;
}
