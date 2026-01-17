/**
 * Formatting Utilities for Memory System
 *
 * Provides helper functions for formatting values in human-readable form.
 */

/**
 * Format age in human-readable form
 *
 * Converts milliseconds to human-friendly age string:
 * - today: for same day
 * - 1d, 7d, etc: for days < 30
 * - 1mo, 2mo, etc: for months
 *
 * @param ageMs - Age in milliseconds
 * @returns Human-readable age string
 *
 * @example
 * ```typescript
 * formatAge(0)                    // => "today"
 * formatAge(86400000)             // => "1d"
 * formatAge(86400000 * 7)         // => "7d"
 * formatAge(86400000 * 30)        // => "1mo"
 * formatAge(86400000 * 60)        // => "2mo"
 * ```
 */
export function formatAge(ageMs: number): string {
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

  if (ageDays === 0) return 'today';
  if (ageDays === 1) return '1d';
  if (ageDays < 30) return `${ageDays}d`;

  const ageMonths = Math.floor(ageDays / 30);
  return `${ageMonths}mo`;
}

/**
 * Format tags array as comma-separated string
 *
 * @param tags - Array of tag strings
 * @returns Comma-separated tag list or empty string
 *
 * @example
 * ```typescript
 * formatTags(['typescript', 'hooks', 'error'])  // => "typescript,hooks,error"
 * formatTags([])                                 // => ""
 * ```
 */
export function formatTags(tags: string[]): string {
  return tags.join(',');
}
