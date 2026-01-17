/**
 * Token counting and truncation utilities for context budget management.
 *
 * Uses conservative word-based heuristic for token estimation.
 */

/**
 * Estimate token count for text using conservative word-based heuristic.
 *
 * Actual tokenization varies by model, but this provides reasonable estimate:
 * - Split on whitespace to get words
 * - Multiply by 1.3 to account for subword tokens
 * - Round up for safety
 *
 * @param text - Text to count tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  if (!text || text.trim().length === 0) {
    return 0;
  }

  const words = text.trim().split(/\s+/);
  return Math.ceil(words.length * 1.3);
}

/**
 * Truncate text to approximate token limit while preserving structure.
 *
 * @param text - Text to truncate
 * @param maxTokens - Maximum token budget
 * @returns Truncated text ending with "..." if truncated
 */
export function truncateToTokenLimit(
  text: string,
  maxTokens: number
): string {
  // Handle empty or whitespace-only text
  if (!text || text.trim().length === 0) {
    return '';
  }

  const currentTokens = estimateTokens(text);

  if (currentTokens <= maxTokens) {
    return text;
  }

  // Calculate approximate character limit
  const words = text.trim().split(/\s+/);
  const targetWords = Math.floor(maxTokens / 1.3);

  if (targetWords <= 0) {
    return '...';
  }

  const truncatedWords = words.slice(0, targetWords);
  const truncatedText = truncatedWords.join(' ');

  return `${truncatedText}...`;
}

/**
 * Calculate total tokens for multiple text segments.
 *
 * @param texts - Array of text segments
 * @returns Total estimated token count
 */
export function sumTokens(texts: string[]): number {
  return texts.reduce((sum, text) => sum + estimateTokens(text), 0);
}
