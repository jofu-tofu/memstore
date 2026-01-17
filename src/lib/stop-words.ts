/**
 * Stop Words Utility for Search Term Filtering
 *
 * Provides common English stop words and filtering functionality
 * for search query processing.
 */

/**
 * Default English stop words to filter from search queries
 */
export const DEFAULT_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'will', 'with', 'how', 'did', 'i', 'you', 'we'
]);

/**
 * Filter stop words from an array of tokens
 *
 * @param tokens - Array of search term tokens
 * @param customStopWords - Optional custom stop words set (defaults to DEFAULT_STOP_WORDS)
 * @returns Filtered array with stop words removed
 *
 * @example
 * ```typescript
 * const terms = ['how', 'to', 'fix', 'typescript', 'error'];
 * const filtered = filterStopWords(terms);
 * // Result: ['fix', 'typescript', 'error']
 * ```
 */
export function filterStopWords(
  tokens: string[],
  customStopWords?: Set<string>
): string[] {
  const stopWords = customStopWords || DEFAULT_STOP_WORDS;
  return tokens.filter(token => !stopWords.has(token.toLowerCase()));
}

/**
 * Create a custom stop words set by extending defaults
 *
 * @param additionalWords - Additional words to treat as stop words
 * @returns Combined stop words set
 *
 * @example
 * ```typescript
 * const stopWords = extendStopWords(['please', 'help', 'thanks']);
 * // Includes all DEFAULT_STOP_WORDS plus custom additions
 * ```
 */
export function extendStopWords(additionalWords: string[]): Set<string> {
  const extended = new Set(DEFAULT_STOP_WORDS);
  additionalWords.forEach(word => extended.add(word.toLowerCase()));
  return extended;
}
