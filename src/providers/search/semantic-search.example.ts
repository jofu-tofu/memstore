/**
 * Semantic Search Provider Example for the MemStore Memory System
 *
 * This is an EXAMPLE implementation showing how to create a semantic search provider
 * using vector embeddings for similarity-based search.
 *
 * ## Purpose
 *
 * This example demonstrates:
 * - How to implement the SearchProvider interface
 * - Integration with embedding APIs (OpenAI, Claude, or local models)
 * - Efficient embedding caching to reduce API calls
 * - Vector similarity calculation (cosine similarity)
 * - Batching for performance optimization
 * - Proper Result<T, E> error handling
 *
 * ## When to Use Semantic Search
 *
 * - Query meaning matters more than exact keywords
 * - Multilingual support needed (embeddings work across languages)
 * - Want to find conceptually similar memories
 * - Dealing with synonyms and paraphrasing
 *
 * ## Example Use Cases
 *
 * - "Find memories about machine learning" → matches "neural networks", "deep learning"
 * - "authentication issues" → matches "login problems", "sign-in errors"
 * - "performance optimization" → matches "speed improvements", "faster execution"
 *
 * ## Integration Steps
 *
 * 1. Copy this file to semantic-search.ts (remove .example)
 * 2. Install embedding dependencies (if using external APIs)
 * 3. Add API keys to environment variables
 * 4. Register in hooks/memory/core/config.ts:
 *    ```typescript
 *    search: {
 *      provider: 'semantic-search',
 *      // ...config
 *    }
 *    ```
 * 5. Run contract tests (see semantic-search.example.test.ts)
 * 6. Set up A/B testing to compare with keyword search (Story 5.4)
 *
 * @module providers/search/semantic-search.example
 * @version 1.0.0
 */

import { SearchProvider, SearchOptions, SearchResult, SearchError, SEARCH_ERROR_CODES } from './interface';
import { Result, HealthStatus } from '../../types/common';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { getMemstoreDir } from '../../lib/utils';
import { debugLog } from '../../lib/debug-utils';

/**
 * Configuration for semantic search provider
 */
export interface SemanticSearchConfig {
  /**
   * Embedding model to use
   * - 'openai': OpenAI text-embedding-3-small or text-embedding-3-large
   * - 'claude': Claude embeddings (if available)
   * - 'local': Local embedding model (requires separate setup)
   */
  embeddingModel: 'openai' | 'claude' | 'local';

  /**
   * API key for embedding service (OpenAI, Anthropic, etc.)
   * Store in environment variables, never hardcode
   */
  apiKey?: string;

  /**
   * Dimensions for embeddings (model-dependent)
   * - OpenAI text-embedding-3-small: 1536
   * - OpenAI text-embedding-3-large: 3072
   */
  dimensions?: number;

  /**
   * Batch size for embedding generation (optimize API usage)
   * Default: 100
   */
  batchSize?: number;

  /**
   * Minimum similarity score threshold (0-1)
   * Only return results above this threshold
   * Default: 0.7 (70% similarity)
   */
  minSimilarity?: number;

  /**
   * MemStore directory override (for testing)
   */
  memstoreDir?: string;
}

/**
 * Index entry mapping segment ID to its embedding vector
 */
interface EmbeddingIndexEntry {
  segmentId: string;
  embedding: number[];
  /** Cached for quick text preview (first 100 chars) */
  preview?: string;
}

/**
 * Embedding index stored on disk
 */
interface EmbeddingIndex {
  version: string;
  model: string;
  dimensions: number;
  entries: EmbeddingIndexEntry[];
}

/**
 * Semantic search provider using vector embeddings
 *
 * ## Design Decisions
 *
 * **Why cache embeddings on disk?**
 * - Embedding generation is expensive (API cost, latency)
 * - Segment content rarely changes after creation
 * - Cache enables fast restarts without regenerating embeddings
 *
 * **Why use cosine similarity?**
 * - Standard metric for comparing high-dimensional vectors
 * - Fast to compute and well-understood
 * - Works well for normalized embeddings
 *
 * **Why batch embedding generation?**
 * - Many embedding APIs support batching (faster, cheaper)
 * - Reduces number of network requests
 * - Amortizes API overhead
 *
 * @example
 * ```typescript
 * const search = new SemanticSearchProvider({
 *   embeddingModel: 'openai',
 *   apiKey: process.env.OPENAI_API_KEY,
 *   minSimilarity: 0.7
 * });
 *
 * await search.initialize();
 *
 * const result = await search.search('authentication problems');
 * if (result.ok) {
 *   result.value.forEach(r => {
 *     console.log(`${r.segmentId}: ${(r.matchCount / r.totalQueryTerms * 100).toFixed(0)}% similar`);
 *   });
 * }
 * ```
 */
export class SemanticSearchProvider implements SearchProvider {
  readonly name = 'semantic-search';
  readonly version = '1.0.0';

  private config: Required<SemanticSearchConfig>;
  private indexPath: string;
  private embeddingCache: Map<string, number[]> = new Map();
  private indexEntries: EmbeddingIndexEntry[] = [];
  private initialized = false;

  constructor(config: SemanticSearchConfig) {
    // Set defaults for optional config
    this.config = {
      embeddingModel: config.embeddingModel,
      apiKey: config.apiKey || process.env.OPENAI_API_KEY || '',
      dimensions: config.dimensions || 1536, // OpenAI text-embedding-3-small default
      batchSize: config.batchSize || 100,
      minSimilarity: config.minSimilarity || 0.7,
      memstoreDir: config.memstoreDir || getMemstoreDir()
    };

    this.indexPath = join(this.config.memstoreDir, 'mem-store', 'indexes', 'semantic', 'embeddings.json');
  }

  /**
   * Initialize the provider by loading or creating the embedding index
   */
  async initialize(): Promise<Result<void, SearchError>> {
    try {
      // Create index directory if it doesn't exist
      const indexDir = join(this.config.memstoreDir, 'mem-store', 'indexes', 'semantic');
      if (!existsSync(indexDir)) {
        await mkdir(indexDir, { recursive: true });
      }

      // Load existing index if it exists
      if (existsSync(this.indexPath)) {
        const loadResult = await this.loadIndex();
        if (!loadResult.ok) {
          return loadResult;
        }

        debugLog('SemanticSearch', `Loaded ${this.indexEntries.length} embeddings from index`);
      } else {
        // Create empty index
        this.indexEntries = [];
        debugLog('SemanticSearch', 'Created new embedding index');
      }

      this.initialized = true;
      return { ok: true, value: undefined };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: SEARCH_ERROR_CODES.FAILED,
          message: `Failed to initialize semantic search: ${(error as Error).message}`,
          cause: error as Error
        }
      };
    }
  }

  /**
   * Check provider health and operational status
   */
  async healthCheck(): Promise<HealthStatus> {
    const hasApiKey = Boolean(this.config.apiKey);
    const healthy = this.initialized && hasApiKey;

    return {
      healthy,
      message: healthy
        ? `Semantic search operational (${this.indexEntries.length} embeddings cached)`
        : !this.initialized
        ? 'Not initialized'
        : 'Missing API key',
      details: {
        embeddingModel: this.config.embeddingModel,
        embeddingCount: this.indexEntries.length,
        indexPath: this.indexPath,
        dimensions: this.config.dimensions,
        hasApiKey
      }
    };
  }

  /**
   * Gracefully shutdown the provider
   */
  async shutdown(): Promise<void> {
    // Save index to disk before shutdown
    if (this.indexEntries.length > 0) {
      await this.saveIndex().catch(() => {
        // Ignore errors during shutdown
      });
    }

    this.embeddingCache.clear();
    this.indexEntries = [];
    this.initialized = false;
  }

  /**
   * Search for segments similar to the given query
   *
   * ## Implementation Strategy
   *
   * 1. Generate embedding for query text
   * 2. Calculate cosine similarity with all segment embeddings
   * 3. Rank results by similarity score (descending)
   * 4. Filter by minimum similarity threshold
   * 5. Return top N results
   *
   * @param query - User's search query text
   * @param options - Optional search configuration
   * @returns Result containing similar segments or error
   */
  async search(query: string, options?: SearchOptions): Promise<Result<SearchResult[], SearchError>> {
    try {
      // Validation
      if (!this.initialized) {
        return {
          ok: false,
          error: {
            code: SEARCH_ERROR_CODES.PROVIDER_NOT_INITIALIZED,
            message: 'Semantic search not initialized. Call initialize() first.'
          }
        };
      }

      if (!query || query.trim().length === 0) {
        return {
          ok: false,
          error: {
            code: SEARCH_ERROR_CODES.QUERY_INVALID,
            message: 'Query cannot be empty'
          }
        };
      }

      const debug = options?.debug ?? false;
      const maxResults = options?.maxResults ?? 10;

      if (debug) {
        debugLog('SemanticSearch', `Searching for: "${query}"`);
      }

      // Generate embedding for query
      const embeddingResult = await this.generateEmbedding(query);
      if (!embeddingResult.ok) {
        return {
          ok: false,
          error: {
            code: SEARCH_ERROR_CODES.FAILED,
            message: 'Failed to generate query embedding',
            cause: embeddingResult.error
          }
        };
      }

      const queryEmbedding = embeddingResult.value;

      // Calculate similarity scores for all segments
      const similarities: Array<{ segmentId: string; similarity: number }> = [];

      for (const entry of this.indexEntries) {
        const similarity = this.cosineSimilarity(queryEmbedding, entry.embedding);

        // Filter by minimum similarity threshold
        if (similarity >= this.config.minSimilarity) {
          similarities.push({ segmentId: entry.segmentId, similarity });
        }
      }

      // Sort by similarity (descending) and take top N
      similarities.sort((a, b) => b.similarity - a.similarity);
      const topResults = similarities.slice(0, maxResults);

      if (debug) {
        debugLog('SemanticSearch', `Found ${topResults.length} similar segments (threshold: ${this.config.minSimilarity})`);
      }

      // Convert to SearchResult format
      const results: SearchResult[] = topResults.map(({ segmentId, similarity }) => ({
        segmentId,
        // Convert similarity score (0-1) to percentage for matchCount/totalQueryTerms
        // e.g., 0.85 similarity → 85/100
        matchCount: Math.round(similarity * 100),
        matchedTerms: [query], // Semantic search doesn't have discrete matched terms
        totalQueryTerms: 100 // Denominator for percentage
      }));

      return { ok: true, value: results };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: SEARCH_ERROR_CODES.FAILED,
          message: `Semantic search failed: ${(error as Error).message}`,
          cause: error as Error
        }
      };
    }
  }

  /**
   * Generate embedding vector for text
   *
   * ## Caching Strategy
   *
   * Embeddings are cached in-memory and on-disk to avoid regenerating them.
   * - Memory cache: Fast lookup for current session
   * - Disk cache: Persistent across restarts
   *
   * ## API Integration
   *
   * This example shows OpenAI integration. For other providers:
   * - Claude: Use Anthropic SDK (when embeddings available)
   * - Local: Use sentence-transformers, ONNX, or other local models
   *
   * @param text - Text to generate embedding for
   * @returns Embedding vector or error
   */
  private async generateEmbedding(text: string): Promise<Result<number[], Error>> {
    try {
      // Check memory cache first
      const cached = this.embeddingCache.get(text);
      if (cached) {
        return { ok: true, value: cached };
      }

      // Generate new embedding via API
      let embedding: number[];

      if (this.config.embeddingModel === 'openai') {
        // OpenAI API integration
        // NOTE: This requires installing 'openai' package
        // npm install openai (or bun add openai)

        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: text
          })
        });

        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.statusText}`);
        }

        const data = await response.json();
        embedding = data.data[0].embedding;
      } else if (this.config.embeddingModel === 'claude') {
        // Claude embeddings integration (when available)
        // TODO: Implement when Anthropic releases embedding API
        throw new Error('Claude embeddings not yet available');
      } else if (this.config.embeddingModel === 'local') {
        // Local embedding model integration
        // TODO: Implement using sentence-transformers or ONNX runtime
        throw new Error('Local embeddings not implemented in this example');
      } else {
        throw new Error(`Unknown embedding model: ${this.config.embeddingModel}`);
      }

      // Cache the embedding
      this.embeddingCache.set(text, embedding);

      return { ok: true, value: embedding };
    } catch (error) {
      return {
        ok: false,
        error: error as Error
      };
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   *
   * ## Math Explanation
   *
   * Cosine similarity measures the cosine of the angle between two vectors.
   * Result ranges from -1 (opposite) to 1 (identical):
   * - 1.0 = vectors are identical
   * - 0.0 = vectors are orthogonal (unrelated)
   * - -1.0 = vectors are opposite
   *
   * Formula: cos(θ) = (A · B) / (||A|| × ||B||)
   * Where:
   * - A · B = dot product
   * - ||A|| = magnitude of A
   * - ||B|| = magnitude of B
   *
   * @param vecA - First embedding vector
   * @param vecB - Second embedding vector
   * @returns Similarity score (0-1)
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have same dimensions');
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      magnitudeA += vecA[i] * vecA[i];
      magnitudeB += vecB[i] * vecB[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Load embedding index from disk
   */
  private async loadIndex(): Promise<Result<void, SearchError>> {
    try {
      const content = await readFile(this.indexPath, 'utf-8');
      const index: EmbeddingIndex = JSON.parse(content);

      // Validate index structure
      if (!index.entries || !Array.isArray(index.entries)) {
        return {
          ok: false,
          error: {
            code: SEARCH_ERROR_CODES.INDEX_CORRUPT,
            message: 'Embedding index is corrupted'
          }
        };
      }

      this.indexEntries = index.entries;

      // Populate memory cache for fast lookup
      for (const entry of index.entries) {
        if (entry.preview) {
          this.embeddingCache.set(entry.preview, entry.embedding);
        }
      }

      return { ok: true, value: undefined };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist yet - not an error
        return { ok: true, value: undefined };
      }

      return {
        ok: false,
        error: {
          code: SEARCH_ERROR_CODES.FAILED,
          message: `Failed to load embedding index: ${(error as Error).message}`,
          cause: error as Error
        }
      };
    }
  }

  /**
   * Save embedding index to disk
   */
  private async saveIndex(): Promise<Result<void, SearchError>> {
    try {
      const index: EmbeddingIndex = {
        version: this.version,
        model: this.config.embeddingModel,
        dimensions: this.config.dimensions,
        entries: this.indexEntries
      };

      await writeFile(this.indexPath, JSON.stringify(index, null, 2), 'utf-8');
      return { ok: true, value: undefined };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: SEARCH_ERROR_CODES.FAILED,
          message: `Failed to save embedding index: ${(error as Error).message}`,
          cause: error as Error
        }
      };
    }
  }

  /**
   * Add segment embedding to index (called during indexing phase)
   *
   * NOTE: This method is not part of the SearchProvider interface.
   * It would be called by the indexing pipeline during segment processing.
   *
   * @param segmentId - Segment identifier
   * @param text - Segment text to generate embedding for
   */
  async indexSegment(segmentId: string, text: string): Promise<Result<void, SearchError>> {
    try {
      const embeddingResult = await this.generateEmbedding(text);
      if (!embeddingResult.ok) {
        return {
          ok: false,
          error: {
            code: SEARCH_ERROR_CODES.FAILED,
            message: 'Failed to generate segment embedding',
            cause: embeddingResult.error
          }
        };
      }

      // Add to index
      this.indexEntries.push({
        segmentId,
        embedding: embeddingResult.value,
        preview: text.substring(0, 100) // Cache preview for debugging
      });

      // Persist to disk
      await this.saveIndex();

      return { ok: true, value: undefined };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: SEARCH_ERROR_CODES.FAILED,
          message: `Failed to index segment: ${(error as Error).message}`,
          cause: error as Error
        }
      };
    }
  }
}
