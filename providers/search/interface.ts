/**
 * Search Provider Interface for the PAI Memory System
 *
 * Defines the contract for search providers that query the memory index.
 * This interface enables pluggable search strategies (keyword, semantic, hybrid).
 *
 * ## Version Stability Commitment
 *
 * This interface follows semantic versioning (SemVer):
 * - **Major version (X.0.0)**: Breaking changes (method signature changes, removed methods)
 * - **Minor version (1.X.0)**: Backward-compatible additions (new optional methods/parameters)
 * - **Patch version (1.0.X)**: Documentation improvements and clarifications
 *
 * **Current version: 1.0.0**
 *
 * We commit to:
 * 1. No breaking changes within a major version
 * 2. Deprecation warnings at least 1 minor version before removal
 * 3. Migration guides for all breaking changes
 * 4. Backward compatibility for all minor/patch versions
 *
 * @module providers/search/interface
 * @version 1.0.0
 */

import type { Provider, ProviderError, Result } from '../../types/common';

/**
 * Search provider interface for querying memory index.
 *
 * Implementations can use different search strategies:
 * - **keyword-search**: TF-IDF based keyword matching (current)
 * - **semantic-search**: Embedding-based similarity (future)
 * - **hybrid-search**: Combined keyword + semantic (future)
 *
 * @example
 * ```typescript
 * const search: SearchProvider = new KeywordSearch();
 * await search.initialize();
 *
 * // Basic search
 * const result = await search.search('typescript hooks');
 * if (result.ok) {
 *   console.log(`Found ${result.value.length} segments`);
 *   result.value.forEach(r => {
 *     console.log(`${r.segmentId}: ${r.matchCount}/${r.totalQueryTerms} terms matched`);
 *   });
 * }
 * ```
 */
export interface SearchProvider extends Provider {
  /**
   * Search for memories matching the given query.
   *
   * The search behavior depends on the implementation strategy:
   * - Keyword search: Extracts terms from query, finds segments with matching keywords
   * - Semantic search: Uses embeddings to find semantically similar segments
   * - Hybrid search: Combines both approaches with configurable weighting
   *
   * @param query - User's search query text (e.g., "typescript memory hooks")
   * @param options - Optional search configuration (maxResults, minMatchCount, debug)
   * @returns Result containing array of SearchResults ordered by relevance, or SearchError
   *
   * @example
   * ```typescript
   * // Search with options
   * const result = await search.search('memory system architecture', {
   *   maxResults: 5,        // Return top 5 results
   *   minMatchCount: 2,     // Require at least 2 matching terms
   *   debug: true           // Enable diagnostic logging
   * });
   *
   * if (result.ok) {
   *   for (const match of result.value) {
   *     console.log(`Segment: ${match.segmentId}`);
   *     console.log(`Matched: ${match.matchedTerms.join(', ')}`);
   *     console.log(`Score: ${match.matchCount}/${match.totalQueryTerms}`);
   *   }
   * }
   * ```
   */
  search(query: string, options?: SearchOptions): Promise<Result<SearchResult[], SearchError>>;
}

/**
 * Options for configuring search behavior.
 *
 * All options are optional - omitting an option uses the provider's default.
 *
 * @example
 * ```typescript
 * const options: SearchOptions = {
 *   maxResults: 10,      // Default: varies by provider (typically 10-20)
 *   minMatchCount: 1,    // Default: 1 (any match counts)
 *   debug: false         // Default: false (no debug logging)
 * };
 * ```
 */
export interface SearchOptions {
  /**
   * Maximum number of results to return.
   *
   * Default varies by provider (typically 10-20).
   * Results are ordered by relevance (best matches first).
   */
  maxResults?: number;

  /**
   * Minimum number of search terms that must match.
   *
   * For query "typescript memory hooks":
   * - minMatchCount: 1 = segments matching ANY term
   * - minMatchCount: 2 = segments matching AT LEAST 2 terms
   * - minMatchCount: 3 = segments matching ALL terms
   *
   * Default: 1 (any match counts)
   */
  minMatchCount?: number;

  /**
   * Enable verbose diagnostic logging.
   *
   * When true, provider logs detailed search statistics:
   * - Query parsing details
   * - Index lookup performance
   * - Match scoring calculations
   *
   * Default: false (Story 4.6 - Debug Mode)
   */
  debug?: boolean;
}

/**
 * Search result representing a matching memory segment.
 *
 * Results are ordered by relevance (typically by matchCount descending).
 *
 * @example
 * ```typescript
 * const result: SearchResult = {
 *   segmentId: 'seg_1704912345000_a1b2c3d4',
 *   matchCount: 3,
 *   matchedTerms: ['typescript', 'memory', 'hooks'],
 *   totalQueryTerms: 3
 * };
 *
 * // Calculate match percentage
 * const percentage = (result.matchCount / result.totalQueryTerms) * 100;
 * console.log(`${percentage}% match`); // "100% match"
 * ```
 */
export interface SearchResult {
  /**
   * Segment identifier.
   *
   * Use StorageProvider.retrieve(segmentId) to load the full segment.
   */
  segmentId: string;

  /**
   * Number of search terms that matched this segment.
   *
   * Used for relevance ranking - higher matchCount = more relevant.
   * For query "typescript memory hooks" with all terms matching: matchCount = 3
   */
  matchCount: number;

  /**
   * List of query terms that matched this segment.
   *
   * For query "typescript memory hooks":
   * - matchedTerms: ['typescript', 'hooks'] = 2 of 3 terms matched
   *
   * Useful for highlighting matched terms in UI.
   */
  matchedTerms: string[];

  /**
   * Total number of terms in the original query.
   *
   * Used to calculate match percentage: (matchCount / totalQueryTerms) * 100
   * For query "typescript memory hooks": totalQueryTerms = 3
   */
  totalQueryTerms: number;
}

/**
 * Error type for search failures.
 *
 * ## Error Codes
 *
 * - **SEARCH_INDEX_CORRUPT**: Keyword index file is corrupted or invalid JSON
 * - **SEARCH_FAILED**: General search failure (index read error, parsing error)
 * - **SEARCH_QUERY_INVALID**: Query string is invalid (empty, too long, invalid characters)
 * - **SEARCH_PROVIDER_NOT_INITIALIZED**: search() called before initialize()
 *
 * @example
 * ```typescript
 * const result = await search.search('typescript');
 * if (!result.ok) {
 *   switch (result.error.code) {
 *     case 'SEARCH_INDEX_CORRUPT':
 *       console.error('Index needs rebuild');
 *       break;
 *     case 'SEARCH_QUERY_INVALID':
 *       console.error('Invalid query string');
 *       break;
 *     default:
 *       console.error(`Search failed: ${result.error.message}`);
 *   }
 * }
 * ```
 */
export interface SearchError extends ProviderError {
  /**
   * Error code identifying the type of failure.
   *
   * See SearchError documentation for complete list of error codes.
   */
  code:
    | 'SEARCH_INDEX_CORRUPT'
    | 'SEARCH_FAILED'
    | 'SEARCH_QUERY_INVALID'
    | 'SEARCH_PROVIDER_NOT_INITIALIZED';

  /** Human-readable error message */
  message: string;

  /** Optional original error that caused this failure */
  cause?: Error;
}

/**
 * Search error code constants.
 *
 * Use these constants instead of hardcoding error strings to prevent typos.
 *
 * @example
 * ```typescript
 * import { SEARCH_ERROR_CODES } from './interface';
 *
 * return {
 *   ok: false,
 *   error: {
 *     code: SEARCH_ERROR_CODES.INDEX_CORRUPT,
 *     message: 'Keyword index is corrupted'
 *   }
 * };
 * ```
 */
export const SEARCH_ERROR_CODES = {
  INDEX_CORRUPT: 'SEARCH_INDEX_CORRUPT' as const,
  FAILED: 'SEARCH_FAILED' as const,
  QUERY_INVALID: 'SEARCH_QUERY_INVALID' as const,
  PROVIDER_NOT_INITIALIZED: 'SEARCH_PROVIDER_NOT_INITIALIZED' as const,
} as const;
