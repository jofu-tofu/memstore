/**
 * Decay Calculation Module
 *
 * Calculates time-based decay factors for memory relevance scoring.
 * Uses exponential decay with half-life approach.
 *
 * Story 6.3: Decay Signal Tracking
 * @module core/decay
 */

/**
 * Calculate decay factor for a segment based on time elapsed.
 *
 * Uses exponential decay: decay = 0.5^(elapsed / halfLife)
 *
 * The decay factor represents how much relevance remains:
 * - 1.0 = no decay (just created or accessed)
 * - 0.5 = half-life reached
 * - 0.0 = completely decayed (approaches but never reaches 0)
 *
 * @param timestampMs - Segment timestamp in milliseconds
 * @param currentTimeMs - Current time in milliseconds
 * @param halfLifeDays - Days for decay to reach 50% (default: 14)
 * @returns Decay factor between 0 and 1 (clamped)
 *
 * @example
 * ```typescript
 * const now = Date.now();
 * const twoDaysAgo = now - (2 * 24 * 60 * 60 * 1000);
 *
 * const decay = calculateDecay(twoDaysAgo, now, 14);
 * // Returns ~0.906 (90.6% relevance remaining)
 * ```
 */
export function calculateDecay(
  timestampMs: number,
  currentTimeMs: number,
  halfLifeDays: number = 14
): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const elapsedDays = (currentTimeMs - timestampMs) / MS_PER_DAY;

  // Handle negative time differences (future timestamps due to clock skew)
  if (elapsedDays < 0) {
    // Clamp to 1 - no decay for future timestamps
    return 1;
  }

  // Exponential decay: 0.5^(elapsed / half_life)
  const calculatedDecay = Math.pow(0.5, elapsedDays / halfLifeDays);

  // Clamp result to ensure it never exceeds 1 due to floating-point precision
  return Math.min(1, calculatedDecay);
}
