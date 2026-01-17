/**
 * Age formatting utilities for memory context injection.
 *
 * Converts timestamps to human-readable compact age strings.
 */

/**
 * Format timestamp as human-readable age string.
 *
 * Examples:
 * - 30 seconds ago → "30s"
 * - 5 minutes ago → "5m"
 * - 2 hours ago → "2h"
 * - 3 days ago → "3d"
 * - 2 weeks ago → "2w"
 * - 4 months ago → "4mo"
 *
 * @param timestampMs - Segment creation timestamp
 * @param currentTimeMs - Current time (defaults to Date.now())
 * @returns Human-readable age string
 */
export function formatAge(
  timestampMs: number,
  currentTimeMs: number = Date.now()
): string {
  const elapsedMs = currentTimeMs - timestampMs;

  // Handle future timestamps (clock skew)
  if (elapsedMs < 0) {
    console.error(
      `[Memory:AgeFormatter] Future timestamp: ${timestampMs}, using "0s"`
    );
    return '0s';
  }

  const seconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (months > 0) return `${months}mo`;
  if (weeks > 0) return `${weeks}w`;
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}
