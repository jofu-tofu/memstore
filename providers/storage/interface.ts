/**
 * Storage Provider Interface
 *
 * Defines the contract for persisting memory segments to durable storage.
 * All storage providers must implement this interface to ensure consistent
 * behavior across different storage backends (file, SQLite, cloud, etc.).
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
 * @module providers/storage/interface
 * @version 1.0.0
 */

import type { Provider, Result } from '../../types/common';
import type { MemorySegment } from '../../types/segment';

/**
 * Storage provider interface for persisting memory segments.
 *
 * All methods return Result types - NEVER throw exceptions.
 *
 * @example
 * ```typescript
 * const storage: StorageProvider = new FileBackend();
 * await storage.initialize();
 *
 * const result = await storage.store(segment);
 * if (result.ok) {
 *   console.log(`Stored at: ${result.value.path}`);
 * } else {
 *   console.error(`Storage failed: ${result.error.message}`);
 * }
 * ```
 */
export interface StorageProvider extends Provider {
  /**
   * Persist a memory segment to storage.
   *
   * @param segment - The memory segment to store
   * @returns Result containing storage metadata or error
   *
   * @example
   * ```typescript
   * const segment: MemorySegment = {
   *   id: 'seg_1704912345000_a1b2c3d4',
   *   sessionId: 'mem_1704912340000_b2c3d4e5',
   *   timestamp: 1704912345000,
   *   importanceScore: 0,
   *   accessCount: 0,
   *   lastAccessed: null,
   *   tags: ['typescript', 'hooks'],
   *   memoryType: 'episodic',
   *   sourceRange: { start: 0, end: 150 },
   *   content: 'The conversation content...'
   * };
   *
   * const result = await storage.store(segment);
   * if (result.ok) {
   *   console.log(`Stored: ${result.value.id} at ${result.value.path}`);
   * }
   * ```
   */
  store(segment: MemorySegment): Promise<Result<StoreResult, StorageError>>;

  /**
   * Retrieve a memory segment by ID.
   *
   * Returns null (not an error) if segment doesn't exist.
   *
   * @param id - The segment ID to retrieve
   * @returns Result containing the segment, null if not found, or error
   *
   * @example
   * ```typescript
   * const result = await storage.retrieve('seg_1704912345000_a1b2c3d4');
   * if (result.ok) {
   *   if (result.value !== null) {
   *     console.log(`Found: ${result.value.content}`);
   *   } else {
   *     console.log('Segment not found');
   *   }
   * }
   * ```
   */
  retrieve(id: string): Promise<Result<MemorySegment | null, StorageError>>;

  /**
   * Query segments matching the given filters.
   *
   * @param filters - Filters to apply (tags, recency, importance, etc.)
   * @returns Result containing matching segments or error
   *
   * @example
   * ```typescript
   * const result = await storage.query({
   *   tags: ['typescript'],
   *   minImportance: 50,
   *   limit: 10
   * });
   * if (result.ok) {
   *   console.log(`Found ${result.value.total} segments`);
   *   result.value.segments.forEach(seg => console.log(seg.id));
   * }
   * ```
   */
  query(filters: QueryFilters): Promise<Result<QueryResult, StorageError>>;

  /**
   * Delete a memory segment from storage.
   *
   * **Idempotent behavior**: Calling delete() multiple times with the same ID
   * is safe and will not cause errors. First call returns true (deleted),
   * subsequent calls return false (not found).
   *
   * @param id - The segment ID to delete
   * @returns Result containing true if deleted, false if not found, or error
   *
   * @example
   * ```typescript
   * // First delete - returns true
   * const result1 = await storage.delete('seg_1704912345000_a1b2c3d4');
   * if (result1.ok && result1.value) {
   *   console.log('Segment deleted successfully');
   * }
   *
   * // Second delete - returns false (idempotent)
   * const result2 = await storage.delete('seg_1704912345000_a1b2c3d4');
   * if (result2.ok && !result2.value) {
   *   console.log('Segment was already deleted');
   * }
   * ```
   */
  delete(id: string): Promise<Result<boolean, StorageError>>;

  /**
   * Update a memory segment with partial updates.
   * Used for tracking usage signals (accessCount, lastAccessed).
   *
   * Special behavior for accessCount:
   * - If updates.accessCount is provided, it INCREMENTS the current value (not replace)
   * - This enables atomic increment operations for usage tracking
   *
   * @param id - The segment ID to update
   * @param updates - Partial segment updates to apply
   * @returns Result containing updated segment or error
   *
   * @example
   * ```typescript
   * // Increment accessCount by 1 and update lastAccessed
   * const result = await storage.update('seg_1704912345000_a1b2c3d4', {
   *   accessCount: 1,  // Will be ADDED to current accessCount
   *   lastAccessed: Date.now()
   * });
   * if (result.ok) {
   *   console.log(`Updated: accessCount=${result.value.accessCount}`);
   * }
   * ```
   */
  update(
    id: string,
    updates: Partial<MemorySegment>
  ): Promise<Result<MemorySegment, StorageError>>;
}

/**
 * Result returned by store() operation.
 */
export interface StoreResult {
  /** The segment ID that was stored */
  id: string;

  /** Absolute file path where the segment was stored */
  path: string;

  /** Timestamp when the store operation completed */
  timestamp: number;
}

/**
 * Filters for querying memory segments.
 * All filters are optional - omitting a filter means "no constraint".
 */
export interface QueryFilters {
  /** Filter by tags (OR logic: segments matching ANY of these tags) */
  tags?: string[];

  /** Filter by recency (e.g., "7d", "30d", "2h", "15m") */
  recency?: string;

  /** Minimum importance score (0-100) */
  minImportance?: number;

  /** Minimum access count */
  minAccessCount?: number;

  /** Maximum number of segments to return (default: 10) */
  limit?: number;
}

/**
 * Result returned by query() operation.
 */
export interface QueryResult {
  /** Segments matching the query filters */
  segments: MemorySegment[];

  /** Total number of segments matching filters (before limit applied) */
  total: number;
}

/**
 * Storage operation error.
 *
 * Error codes:
 * - STORAGE_WRITE_FAILED: Failed to write segment to disk
 * - STORAGE_READ_FAILED: Failed to read segment from disk
 * - STORAGE_DELETE_FAILED: Failed to delete segment
 * - STORAGE_QUERY_FAILED: Failed to execute query
 * - STORAGE_SERIALIZE_FAILED: Failed to serialize segment to markdown
 * - STORAGE_PARSE_FAILED: Failed to parse segment from markdown
 * - STORAGE_REGISTRY_UPDATE_FAILED: Failed to update session registry
 * - STORAGE_UPDATE_FAILED: Failed to update segment
 * - STORAGE_NOT_FOUND: Segment not found for update/retrieval
 */
export interface StorageError {
  /** Error name for Error interface compatibility (default: 'StorageError') */
  name: string;

  /** Error code identifying the type of failure */
  code:
    | 'STORAGE_WRITE_FAILED'
    | 'STORAGE_READ_FAILED'
    | 'STORAGE_DELETE_FAILED'
    | 'STORAGE_QUERY_FAILED'
    | 'STORAGE_SERIALIZE_FAILED'
    | 'STORAGE_PARSE_FAILED'
    | 'STORAGE_REGISTRY_UPDATE_FAILED'
    | 'STORAGE_UPDATE_FAILED'
    | 'STORAGE_NOT_FOUND';

  /** Human-readable error message */
  message: string;

  /** Original error that caused this failure (if available) */
  cause?: Error;
}

/**
 * Storage error code constants.
 *
 * Use these constants instead of hardcoding error strings to prevent typos.
 *
 * @example
 * ```typescript
 * import { STORAGE_ERROR_CODES } from './interface';
 *
 * return {
 *   ok: false,
 *   error: {
 *     code: STORAGE_ERROR_CODES.WRITE_FAILED,
 *     message: 'Failed to write segment'
 *   }
 * };
 * ```
 */
export const STORAGE_ERROR_CODES = {
  WRITE_FAILED: 'STORAGE_WRITE_FAILED' as const,
  READ_FAILED: 'STORAGE_READ_FAILED' as const,
  DELETE_FAILED: 'STORAGE_DELETE_FAILED' as const,
  QUERY_FAILED: 'STORAGE_QUERY_FAILED' as const,
  SERIALIZE_FAILED: 'STORAGE_SERIALIZE_FAILED' as const,
  PARSE_FAILED: 'STORAGE_PARSE_FAILED' as const,
  REGISTRY_UPDATE_FAILED: 'STORAGE_REGISTRY_UPDATE_FAILED' as const,
  UPDATE_FAILED: 'STORAGE_UPDATE_FAILED' as const,
  NOT_FOUND: 'STORAGE_NOT_FOUND' as const,
} as const;
