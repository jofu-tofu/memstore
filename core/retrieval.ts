import { Result } from '../types/common';
import { applyFilters } from './filters';
import { rankResults } from './ranking';
import { FilterOptions } from '../types/filters';
import { RankingOptions, RankedResult } from '../types/ranking';
import { globalProviderRegistry, Provider } from './provider-registry';
import { getMemoryConfig } from './config';
import { debugLog, isDebugEnabled } from '../lib/debug-utils';
import { formatAge, formatTags } from '../lib/formatters';
import { getActiveExperiment, selectVariant, hashCode } from './experiment';
import { validateExperimentProvider } from './experiment-validation';
import { logExperimentResult } from '../lib/logging/experiment-logger';
import {
  logRetrievalOperation,
  type RetrievalOperationMetadata,
  type LayerTiming,
  type SearchLayerTiming,
} from '../lib/operations-logger';
import { extractKeywords } from '../lib/keyword-extractor';
import { updateUsageSignals } from '../lib/usage-tracker';
import './register-providers'; // Ensure providers are registered

/**
 * Memory context item returned by retrieval pipeline
 */
export interface MemoryContext {
  id: string;
  relevance: number;
  age: string;
  tags: string[];
  content: string;
}

/**
 * Options for configuring retrieval behavior
 */
export interface RetrievalOptions {
  maxResults?: number;      // Maximum number of memories to return
  maxTokens?: number;        // Maximum total tokens in results
  minRelevance?: number;     // Minimum relevance score (0-100)
  filters?: FilterOptions;   // Filter options (Story 2.3)
  ranking?: RankingOptions;  // Ranking options (Story 2.4)
  debug?: boolean;           // Enable verbose diagnostics (Story 4.6)
}

/**
 * Error type for retrieval failures
 */
export interface RetrievalError {
  code: string;
  message: string;
  cause?: Error;
}

/**
 * Search provider interface
 */
export interface SearchProvider extends Provider {
  search(
    query: string,
    options?: { maxResults?: number; minMatchCount?: number }
  ): Promise<Result<any[], any>>;
}

// MVP default fallback
const MVP_SEARCH_PROVIDER = 'keyword-search';

// Cached provider instance (per-process)
// NOTE: Not thread-safe - concurrent hook invocations could create multiple instances.
// This is acceptable since: (1) hooks typically run sequentially, (2) globalProviderRegistry
// has its own caching, so worst case is we create 2 instances that both work correctly.
let searchProvider: SearchProvider | null = null;
let providerLoadInProgress = false;

/**
 * Reset the cached search provider.
 * Used for testing when PAI_DIR changes between tests.
 * Also clears the provider registry cache to ensure fresh provider initialization.
 */
export function resetSearchProvider(): void {
  searchProvider = null;
  providerLoadInProgress = false;
  globalProviderRegistry.clearCache();
}

/**
 * Hash query for privacy-preserving experiment logging
 *
 * Creates deterministic hash of query text for experiment data.
 * Same query always produces same hash (useful for identifying duplicate queries).
 *
 * @param query - Query text to hash
 * @returns Hex string hash
 */
function hashQuery(query: string): string {
  const hash = hashCode(query);
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Estimate token count for experiment logging
 *
 * Simple estimation: ~4 characters per token on average.
 *
 * @param results - Array of results to estimate tokens for
 * @returns Estimated token count
 */
function estimateTokens(results: any[]): number {
  let totalChars = 0;

  for (const result of results) {
    // Sum up content length from all results
    if (result.content) {
      totalChars += result.content.length;
    } else if (result.text) {
      totalChars += result.text.length;
    }
  }

  // ~4 characters per token (rough estimate)
  return Math.ceil(totalChars / 4);
}

/**
 * Get or initialize the search provider
 *
 * Loads search provider based on configuration with fallback to MVP default.
 * Caches provider instance for session duration.
 *
 * Note: This function is not fully thread-safe. If multiple invocations occur
 * concurrently, multiple provider instances might be created. However, this is
 * acceptable since the globalProviderRegistry has its own caching.
 *
 * @param providerOverride - Optional provider name to use (for experiments)
 * @returns Result with search provider or error
 */
async function getSearchProvider(
  providerOverride?: string
): Promise<Result<SearchProvider, RetrievalError>> {
  // Don't use cache if provider override specified (for experiments)
  // Return cached instance if available and no override
  if (searchProvider !== null && !providerOverride) {
    return { ok: true, value: searchProvider };
  }

  // Warn if concurrent loading detected (shouldn't happen in practice)
  if (providerLoadInProgress) {
    console.error(
      '[Memory:Retrieval] Warning: Concurrent provider loading detected'
    );
  }
  providerLoadInProgress = true;

  // Load config to determine which provider to use
  const configResult = await getMemoryConfig();

  if (!configResult.ok) {
    console.error(
      `[Memory:Retrieval] Failed to load config: ${configResult.error.message}`
    );
    providerLoadInProgress = false;
    return {
      ok: false,
      error: {
        code: 'RETRIEVAL_CONFIG_FAILED',
        message: `Failed to load configuration: ${configResult.error.message}`,
        cause: configResult.error.cause,
      },
    };
  }

  const config = configResult.value;

  // Use provider override if specified (for experiments), otherwise use config
  const searchName = providerOverride || config.providers.search;

  // Try to load configured search provider
  const providerResult = await globalProviderRegistry.getProvider<SearchProvider>(
    'search',
    searchName
  );

  if (!providerResult.ok) {
    console.error(
      `[Memory:Config] Provider '${searchName}' not found, using default`
    );

    // Fallback to MVP default
    const fallbackResult = await globalProviderRegistry.getProvider<SearchProvider>(
      'search',
      MVP_SEARCH_PROVIDER
    );

    if (!fallbackResult.ok) {
      providerLoadInProgress = false;
      return {
        ok: false,
        error: {
          code: 'RETRIEVAL_PROVIDER_INIT_FAILED',
          message: `Fatal: Default search provider '${MVP_SEARCH_PROVIDER}' not registered`,
        },
      };
    }

    console.error(
      `[Memory:Retrieval] Using search provider: ${fallbackResult.value.name}`
    );
    searchProvider = fallbackResult.value;
    providerLoadInProgress = false;
    return { ok: true, value: searchProvider };
  }

  console.error(
    `[Memory:Retrieval] Using search provider: ${providerResult.value.name}`
  );

  // Only cache if not an experiment override (experiments use different providers per request)
  if (!providerOverride) {
    searchProvider = providerResult.value;
  }

  providerLoadInProgress = false;
  return { ok: true, value: providerResult.value };
}

/**
 * Retrieval Pipeline - Now with keyword search, filtering, and ranking
 *
 * Story 2.2: ✅ Keyword search from inverted index
 * Story 2.3: ✅ Filter by tags, recency, importance, access count
 * Story 2.4: ✅ Rank by relevance score (multi-factor scoring)
 * Story 2.5 will add:
 * - Story 2.5: Format for context injection and load full content
 *
 * For Stories 2.2-2.4, this returns ranked search results with metadata.
 * Full memory context loading will be implemented in Story 2.5.
 *
 * @param query - User's search query text
 * @param options - Optional configuration for retrieval behavior
 * @returns Result containing array of ranked results (Story 2.4+)
 */
export async function retrieveMemories(
  query: string,
  options?: RetrievalOptions
): Promise<Result<RankedResult[], RetrievalError>> {
  try {
    // Story 4.6.2: Log query at entry point
    debugLog('Retrieve', `Query: "${query}"`);

    // Story 5.4: Check for active experiments
    const configResult = await getMemoryConfig();
    if (!configResult.ok) {
      debugLog('Retrieve', `ERROR: Config load failed - ${configResult.error.message}`);
      return {
        ok: false,
        error: {
          code: 'RETRIEVAL_CONFIG_FAILED',
          message: `Failed to load configuration: ${configResult.error.message}`,
          cause: configResult.error.cause,
        },
      };
    }

    const config = configResult.value;
    const activeExperiment = getActiveExperiment(config, 'search');

    // Story 5.4: Select variant and override provider if experiment active
    let providerOverride: string | undefined = undefined;
    let experimentVariant: string | null = null;
    let experimentId: string | null = null;

    if (activeExperiment) {
      debugLog('Retrieve', `Active experiment detected: ${activeExperiment.id}`);

      // Generate deterministic request ID from query hash
      const requestId = hashQuery(query);

      // Select variant
      experimentVariant = selectVariant(
        activeExperiment.id,
        requestId,
        activeExperiment.config
      );

      experimentId = activeExperiment.id;

      // Get provider name from variant
      const variantProviderName =
        activeExperiment.config.variants[experimentVariant];

      debugLog('Retrieve', `Experiment variant selected: ${experimentVariant} (provider: ${variantProviderName})`);

      // Validate experiment provider
      const validationResult = await validateExperimentProvider(
        variantProviderName,
        'search'
      );

      if (!validationResult.ok) {
        console.error(
          `[Memory:Experiment] Provider '${variantProviderName}' not found or invalid: ${validationResult.error.message}`
        );
        debugLog('Retrieve', `Experiment provider validation failed - falling back to default`);

        // Log experiment failure
        logExperimentResult({
          experimentId: experimentId,
          variant: experimentVariant,
          timestamp: Date.now(),
          latencyMs: 0,
          resultCount: 0,
          injectedTokens: 0,
          queryHash: requestId,
          success: false,
          errorCode: 'EXPERIMENT_INVALID_PROVIDER',
        }).catch((err) => {
          console.error(
            `[Memory:Experiment] Failed to log experiment error: ${err.error?.message}`
          );
        });

        // Clear experiment tracking - fallback to default provider
        experimentVariant = null;
        experimentId = null;
      } else {
        // Valid experiment provider - use it
        providerOverride = variantProviderName;
      }
    }

    // Get search provider (with optional experiment override)
    const startTime = Date.now();
    const providerResult = await getSearchProvider(providerOverride);

    if (!providerResult.ok) {
      debugLog('Retrieve', `ERROR: Provider initialization failed - ${providerResult.error.message}`);
      return providerResult;
    }

    const provider = providerResult.value;

    // Story 6.4: Track per-layer timing
    let searchLatency = 0;
    let filterLatency = 0;
    let rankLatency = 0;

    // Execute keyword search
    // Pass debug flag to search provider (Story 4.6, Task 2.1-2.3)
    const searchStart = Date.now();
    const searchResult = await provider.search(query, {
      maxResults: options?.maxResults || 100, // Increase for filtering
      minMatchCount: 1,  // At least one term must match
      debug: options?.debug  // Enable debug logging if configured
    });
    searchLatency = Date.now() - searchStart;

    if (!searchResult.ok) {
      debugLog('Retrieve', `ERROR: Search failed - ${searchResult.error.message}`);
      return {
        ok: false,
        error: {
          code: 'RETRIEVAL_SEARCH_FAILED',
          message: searchResult.error.message,
          cause: searchResult.error.cause
        }
      };
    }

    // Story 4.6.2: Log candidates before filtering
    const candidatesBeforeFilter = searchResult.value.length;
    debugLog('Retrieve', `Total candidates before filtering: ${candidatesBeforeFilter} segments`);

    // Apply filters to search results (Story 2.3)
    const filterStart = Date.now();
    const filterResult = await applyFilters(
      searchResult.value,
      options?.filters
    );
    filterLatency = Date.now() - filterStart;

    if (!filterResult.ok) {
      debugLog('Retrieve', `ERROR: Filter failed - ${filterResult.error.message}`);
      return {
        ok: false,
        error: {
          code: 'RETRIEVAL_FILTER_FAILED',
          message: filterResult.error.message,
          cause: filterResult.error.cause
        }
      };
    }

    // Story 4.6.2: Log filtering results with details
    const filteredCount = filterResult.value.length;

    // Log filter application
    if (options?.filters?.recency) {
      debugLog('Retrieve', `After recency filter (${options.filters.recency}d): ${filteredCount} segments`);
    } else if (options?.filters) {
      debugLog('Retrieve', `After filtering: ${filteredCount} segments`);
    }

    // Story 4.6.2: Log zero-result diagnostics
    if (filteredCount === 0 && candidatesBeforeFilter > 0) {
      debugLog('Retrieve', `Zero results - all candidates filtered out`);
    } else if (filteredCount === 0) {
      debugLog('Retrieve', `Zero results - no index matches found`);
    }

    console.error(
      `[Memory:Retrieval] Filtered to ${filteredCount} candidates`
    );

    // Story 2.4: Rank results by relevance
    const rankStart = Date.now();
    const rankingResult = await rankResults(
      filterResult.value,
      {
        limit: options?.maxResults || 10,
        minScore: options?.minRelevance || 0,
        ...options?.ranking
      }
    );
    rankLatency = Date.now() - rankStart;

    if (!rankingResult.ok) {
      debugLog('Retrieve', `ERROR: Ranking failed - ${rankingResult.error.message}`);
      return {
        ok: false,
        error: {
          code: 'RETRIEVAL_RANKING_FAILED',
          message: rankingResult.error.message,
          cause: rankingResult.error.cause
        }
      };
    }

    // Story 4.6.2: Log top ranked results with detailed formatting
    if (isDebugEnabled() && rankingResult.value.length > 0) {
      const topN = Math.min(5, rankingResult.value.length);
      debugLog('Retrieve', `Top ${topN} by relevance score:`);

      for (let i = 0; i < topN; i++) {
        const result = rankingResult.value[i];
        const age = formatAge(Date.now() - result.metadata.createdAt);
        const tags = formatTags(result.metadata.tags || []);
        const score = Math.round(result.relevanceScore);

        debugLog(
          'Retrieve',
          `  - ${result.segmentId} (score=${score}, age=${age}, tags=${tags})`
        );
      }
    }

    // Story 4.6.2: Log completion summary
    debugLog('Retrieve', `Retrieval complete: ${rankingResult.value.length} results`);

    console.error(
      `[Memory:Retrieval] Ranked to top ${rankingResult.value.length} results`
    );

    // Story 5.4: Log experiment data if experiment is active
    if (experimentId && experimentVariant) {
      const endTime = Date.now();
      const latencyMs = endTime - startTime;

      const tokens = estimateTokens(rankingResult.value);

      debugLog('Retrieve', `Logging experiment data: variant=${experimentVariant}, latency=${latencyMs}ms, results=${rankingResult.value.length}, tokens=${tokens}`);

      // Fire-and-forget logging (don't block retrieval)
      logExperimentResult({
        experimentId: experimentId,
        variant: experimentVariant,
        timestamp: startTime,
        latencyMs: latencyMs,
        resultCount: rankingResult.value.length,
        injectedTokens: tokens,
        queryHash: hashQuery(query),
        success: true,
      }).catch((err) => {
        console.error(
          `[Memory:Experiment] Failed to log experiment result: ${err.error?.message}`
        );
      });
    }

    // === Story 6.4: Log retrieval operation with per-layer timing ===
    const endTime = Date.now();
    const totalLatencyMs = endTime - startTime;

    // Extract keywords from query
    const extractedTerms = extractKeywords(query);

    // Estimate tokens
    const tokensInjected = estimateTokens(rankingResult.value);

    // Determine success and reason
    const success = rankingResult.value.length > 0;
    let reason: 'no_matches' | 'filtered_all' | undefined = undefined;
    if (!success) {
      reason = candidatesBeforeFilter === 0 ? 'no_matches' : 'filtered_all';
    }

    // Calculate inject latency (remainder after search, filter, rank)
    const injectLatency = Math.max(0, totalLatencyMs - searchLatency - filterLatency - rankLatency);

    const retrievalMetadata: RetrievalOperationMetadata = {
      timestamp: startTime,
      queryLength: query.length,
      termsExtracted: extractedTerms.length,
      candidatesFound: candidatesBeforeFilter,
      resultsReturned: rankingResult.value.length,
      tokensInjected: tokensInjected,
      totalLatencyMs: totalLatencyMs,
      success: success,
      reason: reason,
      layerTiming: {
        search: { provider: provider.name, latencyMs: searchLatency },
        filter: { latencyMs: filterLatency },
        rank: { latencyMs: rankLatency },
        inject: { latencyMs: injectLatency },
      },
    };

    const logResult = await logRetrievalOperation(retrievalMetadata);
    if (!logResult.ok) {
      console.error(`[Memory:Retrieval] Failed to log retrieval metadata: ${logResult.error.message}`);
      // Continue - don't fail on logging error
    }
    // === End Story 6.4 ===

    // === Story 6.2: Track usage for all retrieved segments ===
    if (rankingResult.value.length > 0) {
      const segmentIds = rankingResult.value.map(r => r.segmentId);

      // Fire-and-forget: Don't block retrieval on usage tracking
      updateUsageSignals(segmentIds).then(result => {
        if (!result.ok) {
          console.error(
            `[Memory:Retrieval] Failed to track usage: ${result.error.message}`
          );
        }
      }).catch(err => {
        // Catch any unexpected errors (shouldn't happen with Result pattern)
        console.error(
          `[Memory:Retrieval] Unexpected error in usage tracking: ${String(err)}`
        );
      });
    }
    // === End Story 6.2 ===

    // Story 2.5 will add content loading and formatting
    return {
      ok: true,
      value: rankingResult.value
    };

  } catch (error) {
    // Story 5.4: Log experiment failure if experiment was active
    if (experimentId && experimentVariant) {
      logExperimentResult({
        experimentId: experimentId,
        variant: experimentVariant,
        timestamp: Date.now(),
        latencyMs: 0,
        resultCount: 0,
        injectedTokens: 0,
        queryHash: hashQuery(query),
        success: false,
        errorCode: 'RETRIEVAL_FAILED',
      }).catch((err) => {
        console.error(
          `[Memory:Experiment] Failed to log experiment error: ${err.error?.message}`
        );
      });
    }

    return {
      ok: false,
      error: {
        code: 'RETRIEVAL_FAILED',
        message: (error as Error).message,
        cause: error as Error
      }
    };
  }
}
