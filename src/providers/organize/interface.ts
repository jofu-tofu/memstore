/**
 * Organize Provider Interface for MemStore
 *
 * Defines the contract for organization providers that determine storage
 * path strategies for memory segments.
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
 * @module providers/organize/interface
 * @version 1.0.0
 */

import type { Provider, ProviderError, Result } from '../../types/common';
import type { MemorySegment } from '../../types/segment';

/**
 * Error type for organization failures.
 *
 * ## Error Codes
 *
 * - **ORGANIZE_PATH_FAILED**: Failed to determine storage path
 * - **ORGANIZE_INVALID_SEGMENT**: Segment is missing required fields (timestamp, tags, etc.)
 *
 * @example
 * ```typescript
 * const result = await organize.organize(segment);
 * if (!result.ok) {
 *   switch (result.error.code) {
 *     case 'ORGANIZE_PATH_FAILED':
 *       console.error('Could not determine storage path');
 *       break;
 *     case 'ORGANIZE_INVALID_SEGMENT':
 *       console.error('Segment is missing required fields');
 *       break;
 *     default:
 *       console.error(`Organization failed: ${result.error.message}`);
 *   }
 * }
 * ```
 */
export interface OrganizeError extends ProviderError {
  code: 'ORGANIZE_PATH_FAILED' | 'ORGANIZE_INVALID_SEGMENT';
}

/**
 * Organize error code constants.
 *
 * Use these constants instead of hardcoding error strings to prevent typos.
 *
 * @example
 * ```typescript
 * import { ORGANIZE_ERROR_CODES } from './interface';
 *
 * return {
 *   ok: false,
 *   error: {
 *     code: ORGANIZE_ERROR_CODES.PATH_FAILED,
 *     message: 'Failed to determine storage path'
 *   }
 * };
 * ```
 */
export const ORGANIZE_ERROR_CODES = {
  PATH_FAILED: 'ORGANIZE_PATH_FAILED' as const,
  INVALID_SEGMENT: 'ORGANIZE_INVALID_SEGMENT' as const,
} as const;

/**
 * Organize provider interface for determining storage path strategies.
 *
 * Implementations support different organization strategies:
 * - **flat-by-date**: `segments/{YYYY-MM}/` - organize by month (MVP)
 * - **hierarchical-retention**: `short-term/`, `long-term/`, `archive/` (Story 1.8)
 * - **topic-based**: Organize by tags/topics (future)
 *
 * ## Organization Strategies
 *
 * Different strategies optimize for different use cases:
 *
 * **flat-by-date** (current):
 * - Simple chronological organization
 * - Easy to browse by time
 * - Good for recent memory access patterns
 *
 * **hierarchical-retention** (future):
 * - Organizes by retention policy
 * - Supports lifecycle management
 * - Enables automated archival
 *
 * **topic-based** (future):
 * - Organizes by content topics
 * - Uses tags for directory structure
 * - Good for semantic browsing
 *
 * @example
 * ```typescript
 * const organize: OrganizeProvider = new FlatByDate();
 * await organize.initialize();
 *
 * const segment: MemorySegment = {
 *   id: 'seg_1704912345000_a1b2c3d4',
 *   timestamp: 1704912345000, // Jan 2024
 *   // ... other fields
 * };
 *
 * const result = await organize.organize(segment);
 * if (result.ok) {
 *   console.log(`Path: ${result.value}`); // "segments/2024-01/"
 * }
 * ```
 */
export interface OrganizeProvider extends Provider {
  /**
   * Determine the storage path for a memory segment.
   *
   * Returns a relative path (from memory root) where the segment should be stored.
   *
   * ## Path Format
   *
   * - Must be a relative path (no leading `/`)
   * - Must end with `/` (directory path)
   * - Must use forward slashes `/` (even on Windows)
   * - May include subdirectories (e.g., `segments/2024/01/`)
   *
   * ## Behavior by Implementation Strategy
   *
   * **flat-by-date** (current):
   * ```typescript
   * // segments/YYYY-MM/
   * organize(segment) => "segments/2024-01/"
   * ```
   *
   * **hierarchical-retention** (future):
   * ```typescript
   * // short-term/, long-term/, or archive/ based on age
   * organize(segment) => "short-term/"  // if < 7 days old
   * organize(segment) => "long-term/"   // if 7-30 days old
   * organize(segment) => "archive/"     // if > 30 days old
   * ```
   *
   * **topic-based** (future):
   * ```typescript
   * // topics/{primary-tag}/
   * organize(segment) => "topics/typescript/"
   * ```
   *
   * @param segment - The segment to organize (must have timestamp, tags, etc.)
   * @returns Result containing relative directory path, or error
   *
   * @example
   * ```typescript
   * const segment: MemorySegment = {
   *   id: 'seg_1704912345000_a1b2c3d4',
   *   sessionId: 'mem_1704912340000_b2c3d4e5',
   *   timestamp: 1704912345000, // Jan 10, 2024
   *   tags: ['typescript', 'memory'],
   *   // ... other fields
   * };
   *
   * // flat-by-date strategy
   * const result = await organize.organize(segment);
   * if (result.ok) {
   *   console.log(`Store in: ${result.value}`);
   *   // "segments/2024-01/"
   *
   *   const fullPath = `${memoryRoot}/${result.value}${segment.id}.md`;
   *   // "/Users/josh/.pai-memory/segments/2024-01/seg_1704912345000_a1b2c3d4.md"
   * }
   * ```
   */
  organize(segment: MemorySegment): Promise<Result<string, OrganizeError>>;
}
