/**
 * Segment CRUD API
 *
 * Provides programmatic API for memory segment manipulation outside
 * the normal capture flow. Enables manual memory creation, editing,
 * deletion, and batch operations.
 *
 * @module api/segment-api
 * @see Story 5.1 - Segment CRUD API
 * @see FR15-FR19 in PRD
 */

import type { Result } from '../types/common';
import type { MemorySegment } from '../types/segment';
import type {
  StorageProvider,
  StoreResult,
  StorageError
} from '../providers/storage/interface';
import type { SummarizeProvider } from '../providers/summarize/interface';
import { globalProviderRegistry } from '../core/provider-registry';
import { generateSegmentId } from '../lib/id-generator';
import { getMemoryConfig } from '../core/config';

/**
 * Segment API operation error
 *
 * Error codes:
 * - SEGMENT_API_INVALID_SEGMENT: Segment structure validation failed
 * - SEGMENT_API_MISSING_FIELD: Required field missing
 * - SEGMENT_API_INVALID_ID: Segment ID format invalid
 * - SEGMENT_API_NOT_FOUND: Segment doesn't exist (update/delete)
 * - SEGMENT_API_ADD_FAILED: Failed to add segment
 * - SEGMENT_API_UPDATE_FAILED: Failed to update segment
 * - SEGMENT_API_DELETE_FAILED: Failed to delete segment
 * - SEGMENT_API_SUMMARIZE_FAILED: Summarization failed
 * - SEGMENT_API_PROVIDER_UNAVAILABLE: Required provider not loaded
 * - SEGMENT_API_STORAGE_FAILED: Storage provider error
 */
export interface SegmentError {
  /** Namespaced error code */
  code: string;

  /** Human-readable error message */
  message: string;

  /** Original error that caused this failure */
  cause?: Error;

  /** Debug context information */
  context?: Record<string, unknown>;
}

/**
 * Options for summarizeToSegment() operation
 */
export interface SummarizeOptions {
  /** Associate with specific session (default: generated) */
  sessionId?: string;

  /** Custom timestamp (default: now) */
  timestamp?: number;

  /** Initial importance score (default: 0) */
  importanceScore?: number;

  /** Additional tags beyond auto-extracted (default: []) */
  tags?: string[];

  /** Memory type classification (default: 'semantic') */
  memoryType?: 'episodic' | 'semantic' | 'procedural';
}

/**
 * Entity extracted from segment (future use)
 *
 * @experimental Graph storage not yet implemented
 */
export interface Entity {
  id: string;
  type: string;
  name: string;
}

/**
 * Relation between entities (future use)
 *
 * @experimental Graph storage not yet implemented
 */
export interface Relation {
  id: string;
  from: string;
  to: string;
  type: string;
}

/**
 * Segment CRUD API
 *
 * Provides programmatic interface for memory segment operations:
 * - addSegment(): Create new segments
 * - updateSegment(): Modify existing segments
 * - deleteSegment(): Remove segments
 * - summarizeToSegment(): Generate segments from content
 * - splitSegment(): Extract entities (experimental stub)
 *
 * All methods return Result types for explicit error handling.
 *
 * @example
 * ```typescript
 * const api = new SegmentApi();
 * await api.initialize();
 *
 * // Add a segment
 * const result = await api.addSegment({
 *   sessionId: 'mem_001',
 *   content: 'User prefers TypeScript',
 *   tags: ['preference', 'typescript'],
 *   memoryType: 'semantic',
 *   sourceRange: { start: 0, end: 100 }
 * });
 *
 * if (result.ok) {
 *   console.log(`Added: ${result.value.id}`);
 * }
 * ```
 */
export class SegmentApi {
  private storageProvider?: StorageProvider;
  private summarizeProvider?: SummarizeProvider;
  private initialized = false;

  /**
   * Initialize the API and load required providers
   *
   * Must be called before using any API methods.
   *
   * @returns Result indicating success or initialization error
   */
  async initialize(): Promise<Result<void, SegmentError>> {
    if (this.initialized) {
      return { ok: true, value: undefined };
    }

    // Load configuration to get provider names
    const configResult = await getMemoryConfig();
    if (!configResult.ok) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_API_PROVIDER_UNAVAILABLE',
          message: 'Failed to load configuration',
          cause: configResult.error as unknown as Error
        }
      };
    }

    const config = configResult.value;

    // Load storage provider from registry (using config, not hardcoded)
    const storageResult =
      await globalProviderRegistry.getProvider<StorageProvider>(
        'storage',
        config.providers.storage
      );

    if (!storageResult.ok) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_API_PROVIDER_UNAVAILABLE',
          message: 'Storage provider not available',
          cause: storageResult.error as Error
        }
      };
    }

    this.storageProvider = storageResult.value;

    // Load summarize provider from registry
    const summarizeResult =
      await globalProviderRegistry.getProvider<SummarizeProvider>(
        'summarize',
        config.providers.summarize
      );

    if (!summarizeResult.ok) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_API_PROVIDER_UNAVAILABLE',
          message: 'Summarize provider not available',
          cause: summarizeResult.error as Error
        }
      };
    }

    this.summarizeProvider = summarizeResult.value;
    this.initialized = true;

    console.error('[Memory:SegmentApi] API initialized');
    return { ok: true, value: undefined };
  }

  /**
   * Add a new memory segment
   *
   * Validates segment structure, generates ID if not provided,
   * stores via storage provider, and updates keyword index.
   *
   * @param segment - Segment to add (ID optional, will be generated)
   * @returns Result containing storage metadata or error
   *
   * @example
   * ```typescript
   * const result = await api.addSegment({
   *   sessionId: 'mem_001',
   *   content: 'User prefers TypeScript',
   *   tags: ['preference'],
   *   memoryType: 'semantic',
   *   sourceRange: { start: 0, end: 100 }
   * });
   * ```
   */
  async addSegment(
    segment: Partial<MemorySegment>
  ): Promise<Result<StoreResult, SegmentError>> {
    // Validate required fields
    const validationResult = this.validateSegment(segment);
    if (!validationResult.ok) {
      return validationResult;
    }

    // Generate ID if not provided
    const idResult = segment.id
      ? { ok: true as const, value: segment.id }
      : generateSegmentId();

    if (!idResult.ok) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_API_ADD_FAILED',
          message: 'Failed to generate segment ID',
          cause: idResult.error
        }
      };
    }

    const id = idResult.value;

    // Build complete segment with defaults
    const completeSegment: MemorySegment = {
      id,
      sessionId: segment.sessionId!,
      timestamp: segment.timestamp ?? Date.now(),
      importanceScore: segment.importanceScore ?? 0,
      accessCount: segment.accessCount ?? 0,
      lastAccessed: segment.lastAccessed ?? null,
      tags: segment.tags ?? [],
      memoryType: segment.memoryType ?? 'semantic',
      sourceRange: segment.sourceRange!,
      content: segment.content!
    };

    // Store via storage provider
    if (!this.storageProvider) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_API_PROVIDER_UNAVAILABLE',
          message: 'Storage provider not initialized'
        }
      };
    }

    const storeResult = await this.storageProvider.store(completeSegment);

    if (!storeResult.ok) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_API_ADD_FAILED',
          message: `Failed to store segment: ${storeResult.error.message}`,
          cause: storeResult.error.cause
        }
      };
    }

    console.error(`[Memory:SegmentApi] Added segment ${id}`);
    return storeResult;
  }

  /**
   * Update an existing memory segment
   *
   * Loads existing segment, merges updates, re-stores, and
   * updates indexes if tags changed.
   *
   * @param id - Segment ID to update
   * @param updates - Partial updates to apply
   * @returns Result containing updated segment or error
   *
   * @example
   * ```typescript
   * const result = await api.updateSegment('seg_001', {
   *   tags: ['updated', 'tags'],
   *   importanceScore: 75
   * });
   * ```
   */
  async updateSegment(
    id: string,
    updates: Partial<MemorySegment>
  ): Promise<Result<MemorySegment, SegmentError>> {
    // Validate ID format
    if (!this.validateSegmentId(id)) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_API_INVALID_ID',
          message: `Invalid segment ID format: ${id}`
        }
      };
    }

    if (!this.storageProvider) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_API_PROVIDER_UNAVAILABLE',
          message: 'Storage provider not initialized'
        }
      };
    }

    // Use storage provider's update method
    const updateResult = await this.storageProvider.update(id, updates);

    if (!updateResult.ok) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_API_UPDATE_FAILED',
          message: `Failed to update segment: ${updateResult.error.message}`,
          cause: updateResult.error.cause
        }
      };
    }

    console.error(`[Memory:SegmentApi] Updated segment ${id}`);
    return updateResult;
  }

  /**
   * Delete a memory segment
   *
   * Removes segment file, removes from indexes, and updates
   * session registry. Operation is idempotent (succeeds even
   * if segment already deleted).
   *
   * @param id - Segment ID to delete
   * @returns Result containing true if deleted, or error
   *
   * @example
   * ```typescript
   * const result = await api.deleteSegment('seg_001');
   * if (result.ok && result.value) {
   *   console.log('Deleted successfully');
   * }
   * ```
   */
  async deleteSegment(
    id: string
  ): Promise<Result<boolean, SegmentError>> {
    // Validate ID format
    if (!this.validateSegmentId(id)) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_API_INVALID_ID',
          message: `Invalid segment ID format: ${id}`
        }
      };
    }

    if (!this.storageProvider) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_API_PROVIDER_UNAVAILABLE',
          message: 'Storage provider not initialized'
        }
      };
    }

    // Delete via storage provider (idempotent)
    const deleteResult = await this.storageProvider.delete(id);

    if (!deleteResult.ok) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_API_DELETE_FAILED',
          message: `Failed to delete segment: ${deleteResult.error.message}`,
          cause: deleteResult.error.cause
        }
      };
    }

    console.error(`[Memory:SegmentApi] Deleted segment ${id}`);
    return deleteResult;
  }

  /**
   * Summarize content into a memory segment
   *
   * Runs summarization provider, extracts keywords, generates
   * frontmatter, and returns complete MemorySegment ready for storage.
   * Does NOT store the segment - caller must call addSegment() explicitly.
   *
   * @param content - Content to summarize
   * @param options - Optional configuration
   * @returns Result containing complete MemorySegment or error
   *
   * @example
   * ```typescript
   * const result = await api.summarizeToSegment(
   *   'Long content to summarize...',
   *   { sessionId: 'mem_001', tags: ['manual'] }
   * );
   *
   * if (result.ok) {
   *   await api.addSegment(result.value);
   * }
   * ```
   */
  async summarizeToSegment(
    content: string,
    options?: SummarizeOptions
  ): Promise<Result<MemorySegment, SegmentError>> {
    // Validate content
    if (!content || content.trim().length === 0) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_API_INVALID_SEGMENT',
          message: 'Content cannot be empty'
        }
      };
    }

    // Ensure summarize provider is available
    if (!this.summarizeProvider) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_API_PROVIDER_UNAVAILABLE',
          message: 'Summarize provider not initialized'
        }
      };
    }

    // Generate segment ID
    const idResult = generateSegmentId();
    if (!idResult.ok) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_API_SUMMARIZE_FAILED',
          message: 'Failed to generate segment ID',
          cause: idResult.error
        }
      };
    }

    // Build base segment with options and defaults
    const baseSegment: MemorySegment = {
      id: idResult.value,
      sessionId: options?.sessionId ?? `mem_${Date.now()}_manual`,
      timestamp: options?.timestamp ?? Date.now(),
      importanceScore: options?.importanceScore ?? 0,
      accessCount: 0,
      lastAccessed: null,
      tags: options?.tags ?? [],
      memoryType: options?.memoryType ?? 'semantic',
      sourceRange: { start: 0, end: content.length },
      content
    };

    // Run summarization provider to extract keywords and generate summary
    const summarizeResult = await this.summarizeProvider.summarize(baseSegment);

    if (!summarizeResult.ok) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_API_SUMMARIZE_FAILED',
          message: `Summarization failed: ${summarizeResult.error.message}`,
          cause: summarizeResult.error.cause
        }
      };
    }

    console.error(`[Memory:SegmentApi] Summarized ${content.length} chars to segment`);
    return { ok: true, value: summarizeResult.value };
  }

  /**
   * Split segment into entities and relations (experimental)
   *
   * Future implementation will extract entities and relationships
   * for graph-based memory storage. Currently returns stub data.
   *
   * @experimental Not yet implemented - returns empty arrays
   * @param segment - Segment to split into graph nodes
   * @returns Result containing entities and relations
   */
  async splitSegment(
    segment: MemorySegment
  ): Promise<
    Result<{ entities: Entity[]; relations: Relation[] }, SegmentError>
  > {
    // Stub implementation - future enhancement
    console.error('[Memory:SegmentApi] splitSegment() is experimental - returning stub data');

    return {
      ok: true,
      value: {
        entities: [],
        relations: []
      }
    };
  }

  /**
   * Shutdown the API and release resources
   */
  async shutdown(): Promise<void> {
    if (this.storageProvider) {
      await this.storageProvider.shutdown();
      this.storageProvider = undefined;
    }
    if (this.summarizeProvider) {
      await this.summarizeProvider.shutdown();
      this.summarizeProvider = undefined;
    }
    this.initialized = false;
    console.error('[Memory:SegmentApi] API shutdown');
  }

  // Private helper methods

  /**
   * Validate segment structure and required fields
   */
  private validateSegment(
    segment: Partial<MemorySegment>
  ): Result<void, SegmentError> {
    const required = ['sessionId', 'content', 'tags', 'memoryType', 'sourceRange'];

    for (const field of required) {
      if (!(field in segment)) {
        return {
          ok: false,
          error: {
            code: 'SEGMENT_API_MISSING_FIELD',
            message: `Missing required field: ${field}`,
            context: { field }
          }
        };
      }
    }

    // Validate content
    if (typeof segment.content === 'string' && segment.content.trim().length === 0) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_API_INVALID_SEGMENT',
          message: 'Content cannot be empty'
        }
      };
    }

    return { ok: true, value: undefined };
  }

  /**
   * Validate segment ID format
   *
   * Valid format: seg_{timestamp}_{8hex}
   */
  private validateSegmentId(id: string): boolean {
    return /^seg_\d+_[a-f0-9]{8}$/.test(id);
  }
}
