/**
 * Keyword Search Provider for the PAI Memory System
 *
 * Implements keyword-based search using an inverted index.
 * Supports stop word filtering, multi-term OR logic, and match count tracking.
 */

import { SearchProvider, SearchOptions, SearchResult, SearchError } from './interface';
import { Result, HealthStatus } from '../../types/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { DEFAULT_STOP_WORDS } from '../../lib/stop-words';
import { getPaiDir } from '../../lib/utils';
import { debugLog } from '../../lib/debug-utils';

/**
 * Type definition for the inverted index
 * Maps keywords to arrays of segment IDs
 */
interface KeywordIndex {
  [keyword: string]: string[];
}

/**
 * Keyword search provider using inverted index
 */
export class KeywordSearch implements SearchProvider {
  readonly name = 'keyword-search';
  readonly version = '1.0.0';

  private indexPath: string;
  private indexCache: KeywordIndex | null = null;
  private initialized = false;
  private stopWords: Set<string>;

  constructor(options?: { paiDir?: string; customStopWords?: Set<string> }) {
    const paiDir = options?.paiDir || getPaiDir();
    this.indexPath = join(paiDir, 'mem-store', 'indexes', 'keyword', 'index.json');
    this.stopWords = options?.customStopWords || DEFAULT_STOP_WORDS;
  }

  /**
   * Initialize the provider by loading the keyword index
   */
  async initialize(): Promise<Result<void, SearchError>> {
    try {
      // Load index into memory
      const result = await this.loadIndex();
      if (!result.ok) {
        return result as Result<void, SearchError>;
      }

      this.indexCache = result.value;
      this.initialized = true;

      return { ok: true, value: undefined };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'SEARCH_INIT_FAILED',
          message: `Failed to initialize keyword search: ${(error as Error).message}`,
          cause: error as Error
        }
      };
    }
  }

  /**
   * Check provider health and operational status
   */
  async healthCheck(): Promise<HealthStatus> {
    return {
      healthy: this.initialized && this.indexCache !== null,
      message: this.initialized ? 'Keyword index loaded' : 'Not initialized',
      details: {
        indexSize: this.indexCache ? Object.keys(this.indexCache).length : 0,
        indexPath: this.indexPath
      }
    };
  }

  /**
   * Gracefully shutdown the provider
   */
  async shutdown(): Promise<void> {
    this.indexCache = null;
    this.initialized = false;
  }

  /**
   * Search for segments matching the given query
   *
   * @param query - User's search query text
   * @param options - Optional search configuration
   * @returns Result containing matching segments or error
   */
  async search(query: string, options?: SearchOptions): Promise<Result<SearchResult[], SearchError>> {
    try {
      // Ensure initialized
      if (!this.initialized || !this.indexCache) {
        const initResult = await this.initialize();
        if (!initResult.ok) {
          debugLog('KeywordSearch', `ERROR: Index initialization failed - ${initResult.error.message}`);
          return { ok: false, error: initResult.error };
        }
      }

      // Extract and filter search terms
      const terms = this.extractTerms(query);

      // Story 4.6.2: Log extracted terms
      const termsStr = terms.map(t => `"${t}"`).join(', ');
      debugLog('KeywordSearch', `Terms extracted: [${termsStr}]`);

      if (terms.length === 0) {
        // No valid search terms after filtering
        debugLog('KeywordSearch', 'Zero results - no valid search terms after filtering');
        return { ok: true, value: [] };
      }

      // Lookup terms in index and track match counts
      const segmentMatches = new Map<string, { count: number; terms: string[] }>();

      // Story 4.6.2: Track index hits for debug logging
      const indexHits: Record<string, number> = {};

      for (const term of terms) {
        const segmentIds = this.indexCache![term] || [];
        indexHits[term] = segmentIds.length;

        for (const segmentId of segmentIds) {
          const existing = segmentMatches.get(segmentId);
          if (existing) {
            existing.count++;
            existing.terms.push(term);
          } else {
            segmentMatches.set(segmentId, { count: 1, terms: [term] });
          }
        }
      }

      // Story 4.6.2: Log index hits per term
      const hitsStr = Object.entries(indexHits)
        .map(([term, count]) => `${term}=${count} hits`)
        .join(', ');
      debugLog('KeywordSearch', `Index lookup: ${hitsStr}`);

      // Convert to SearchResult array
      const results: SearchResult[] = Array.from(segmentMatches.entries()).map(
        ([segmentId, match]) => ({
          segmentId,
          matchCount: match.count,
          matchedTerms: match.terms,
          totalQueryTerms: terms.length
        })
      );

      // Story 4.6.2: Log candidate count (before filtering)
      debugLog('KeywordSearch', `Found ${results.length} candidate segments`);

      // Apply filters if specified
      let filteredResults = results;

      if (options?.minMatchCount) {
        filteredResults = filteredResults.filter(
          r => r.matchCount >= options.minMatchCount!
        );
      }

      // Sort by match count (descending) for best matches first
      filteredResults.sort((a, b) => b.matchCount - a.matchCount);

      // Apply result limit
      if (options?.maxResults) {
        filteredResults = filteredResults.slice(0, options.maxResults);
      }

      console.error(
        `[Memory:KeywordSearch] Found ${filteredResults.length} matches for ${terms.length} terms`
      );

      return { ok: true, value: filteredResults };

    } catch (error) {
      console.error(`[Memory:KeywordSearch] Search failed: ${(error as Error).message}`);
      return {
        ok: false,
        error: {
          code: 'SEARCH_FAILED',
          message: `Keyword search failed: ${(error as Error).message}`,
          cause: error as Error
        }
      };
    }
  }

  /**
   * Extract search terms from query
   * - Convert to lowercase
   * - Split on whitespace and punctuation
   * - Filter stop words
   * - Remove duplicates
   *
   * Note: This method is synchronous but may call async debugLog.
   * We don't await the debug logging to avoid making this method async,
   * which would require changes to callers. Debug logs are fire-and-forget.
   */
  private extractTerms(query: string): string[] {
    // Convert to lowercase
    const normalized = query.toLowerCase();

    // Split on whitespace and punctuation, but preserve programming terms
    // This regex splits but keeps alphanumeric and underscores
    const tokens = normalized.split(/[^\w]+/);

    // Track stopwords for debug logging
    const stopwordsRemoved: string[] = [];

    // Filter out empty strings and stop words
    const filtered = tokens.filter(token => {
      if (!token) return false;

      if (this.stopWords.has(token)) {
        stopwordsRemoved.push(token);
        return false;
      }

      return true;
    });

    // Story 4.6.2: Log stopword removal (fire-and-forget)
    if (stopwordsRemoved.length > 0) {
      const removedStr = stopwordsRemoved.map(w => `"${w}"`).join(', ');
      debugLog('KeywordSearch', `Stopwords removed: [${removedStr}]`);
    }

    // Remove duplicates
    return Array.from(new Set(filtered));
  }

  /**
   * Load keyword index from disk
   * - Missing file returns empty index (not an error)
   * - Corrupted file returns error
   */
  private async loadIndex(): Promise<Result<KeywordIndex, SearchError>> {
    try {
      const content = await readFile(this.indexPath, 'utf-8');
      const index = JSON.parse(content) as KeywordIndex;

      console.error(`[Memory:KeywordSearch] Loaded index with ${Object.keys(index).length} keywords`);

      return { ok: true, value: index };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;

      // Missing file is not an error - return empty index
      if (err.code === 'ENOENT') {
        console.error('[Memory:KeywordSearch] Index file not found, using empty index');
        return { ok: true, value: {} };
      }

      // Corrupted file: return EMPTY index, not error (AC: Story 3.6)
      // This allows search to continue gracefully with no results
      if (error instanceof SyntaxError) {
        console.error('[Memory:Search] Index corrupted, returning empty results');
        return { ok: true, value: {} }; // Empty index = no results
      }

      // Other errors
      return {
        ok: false,
        error: {
          code: 'SEARCH_INDEX_READ_FAILED',
          message: `Failed to read index: ${err.message}`,
          cause: err
        }
      };
    }
  }
}

export default KeywordSearch;
