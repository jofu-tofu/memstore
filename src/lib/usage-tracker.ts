/**
 * Usage Tracker
 *
 * Tracks which memories are actually used by incrementing accessCount
 * and updating lastAccessed timestamp. Enables ranking boost for
 * frequently-used memories and decay detection.
 *
 * @module lib/usage-tracker
 */

import { Result } from '../types/common';
import { FileBackend } from '../providers/storage/file-backend';
import { updateUsageStats as updateStatsFile, getStats } from './logging/stats-manager';

/**
 * Usage error codes:
 * - USAGE_UPDATE_FAILED: All segment updates failed
 * - USAGE_PARTIAL_FAILURE: Some segment updates failed (logged but not fatal)
 * - USAGE_STATS_READ_FAILED: Failed to read usage statistics
 */
export interface UsageError {
  code: string;
  message: string;
  cause?: Error;
}

/**
 * Usage statistics aggregation result.
 * Story 6.2 AC2-3: Provides queryable insights into memory usage patterns.
 */
export interface UsageStatsResult {
  usageStats: {
    /** Total number of segment retrievals across all sessions */
    totalRetrievals: number;
    /** Number of unique segments that have been retrieved at least once */
    uniqueSegmentsRetrieved: number;
    /** Top N most frequently retrieved segments with their access counts */
    topSegments: Array<{ id: string; accessCount: number }>;
    /** Top tags from highly accessed segments */
    topTags?: Array<{ tag: string; count: number }>;
  };
}

/**
 * Segment ID validation pattern: seg_{timestamp}_{random_hex}
 * Also accepts _test suffix for testing purposes
 */
const SEGMENT_ID_PATTERN = /^seg_\d+_[a-f0-9]+$|^seg_\d+_test$|^seg_[a-z0-9_]+$/;

/**
 * Singleton storage instance to avoid repeated initialization overhead.
 */
let storageInstance: FileBackend | null = null;

/**
 * Reset the storage instance singleton.
 * Required for testing when MEMSTORE_DIR changes between tests.
 */
export function resetStorageInstance(): void {
  storageInstance = null;
}

/**
 * Update usage signals for a list of memory segments.
 * Increments accessCount by 1 and updates lastAccessed to current timestamp.
 *
 * Graceful degradation:
 * - Partial failures are logged but don't block the operation
 * - Returns ok:true if ANY segment was updated successfully
 * - Returns ok:false only if ALL segments failed
 *
 * @param segmentIds - Array of segment IDs to update
 * @returns Result indicating success or error
 *
 * @example
 * ```typescript
 * const result = await updateUsageSignals(['seg_001', 'seg_002', 'seg_003']);
 * if (result.ok) {
 *   console.log('Usage signals updated successfully');
 * }
 * ```
 */
export async function updateUsageSignals(
  segmentIds: string[]
): Promise<Result<void, UsageError>> {
  // No-op for empty list
  if (segmentIds.length === 0) {
    return { ok: true, value: undefined };
  }

  // Validate segment IDs and filter out invalid ones
  const validIds = segmentIds.filter(id => SEGMENT_ID_PATTERN.test(id));
  if (validIds.length < segmentIds.length) {
    const invalidCount = segmentIds.length - validIds.length;
    console.warn(
      `[Memory:UsageTracker] Filtered ${invalidCount} invalid segment IDs`
    );
  }

  // No-op if all IDs were invalid
  if (validIds.length === 0) {
    return { ok: true, value: undefined };
  }

  // Initialize singleton storage instance if needed
  if (!storageInstance) {
    storageInstance = new FileBackend();
    await storageInstance.initialize();
  }
  const storage = storageInstance;

  const errors: string[] = [];
  let successCount = 0;

  for (const id of validIds) {
    const result = await storage.update(id, {
      accessCount: 1, // Increment by 1
      lastAccessed: Date.now(),
    });

    if (!result.ok) {
      errors.push(`${id}: ${result.error.message}`);
      console.error(`[Memory:UsageTracker] Failed to update ${id}: ${result.error.message}`);
    } else {
      successCount++;
    }
  }

  // Return error only if ALL updates failed
  if (errors.length > 0 && errors.length === validIds.length) {
    return {
      ok: false,
      error: {
        code: 'USAGE_UPDATE_FAILED',
        message: `All updates failed: ${errors.join(', ')}`,
      },
    };
  }

  // Log partial failures but return success
  if (errors.length > 0) {
    console.error(
      `[Memory:UsageTracker] Partial failure: ${errors.length}/${validIds.length} updates failed`
    );
  } else {
    console.log(`[Memory:UsageTracker] Updated usage signals for ${successCount} segments`);
  }

  // Update aggregate usage stats (fire-and-forget, don't block)
  try {
    const statsResult = updateStatsFile(validIds);
    if (!statsResult.ok) {
      console.error(
        `[Memory:UsageTracker] Stats update failed: ${statsResult.error.message}`
      );
    }
  } catch (statsError) {
    console.error(
      `[Memory:UsageTracker] Stats update exception: ${
        statsError instanceof Error ? statsError.message : String(statsError)
      }`
    );
    // Ignore stats errors - never block usage tracking
  }

  return { ok: true, value: undefined };
}

/**
 * Get aggregated usage statistics.
 *
 * Story 6.2 AC2-3: Provides insights into which memories are most valuable
 * based on retrieval frequency. Reads from stats.json and segments to
 * combine frequency data with actual access counts.
 *
 * @returns Result with usage statistics or error
 *
 * @example
 * ```typescript
 * const stats = await getUsageStats();
 * if (stats.ok) {
 *   console.log(`Total retrievals: ${stats.value.usageStats.totalRetrievals}`);
 *   console.log(`Top segment: ${stats.value.usageStats.topSegments[0].id}`);
 * }
 * ```
 */
export async function getUsageStats(): Promise<Result<UsageStatsResult, UsageError>> {
  try {
    // Read aggregated stats from stats.json
    const statsResult = getStats();
    if (!statsResult.ok) {
      return {
        ok: false,
        error: {
          code: 'USAGE_STATS_READ_FAILED',
          message: `Failed to read stats: ${statsResult.error.message}`,
          cause: statsResult.error.cause,
        },
      };
    }

    const stats = statsResult.value;
    const usage = stats.usage;

    // Initialize storage to read actual segment access counts
    if (!storageInstance) {
      storageInstance = new FileBackend();
      await storageInstance.initialize();
    }
    const storage = storageInstance;

    // Build top segments with actual access counts from segment files
    const topSegmentsWithCounts: Array<{ id: string; accessCount: number }> = [];

    for (const segmentId of usage.mostUsedSegments) {
      const segmentResult = await storage.retrieve(segmentId);

      if (segmentResult.ok && segmentResult.value) {
        topSegmentsWithCounts.push({
          id: segmentId,
          accessCount: segmentResult.value.accessCount,
        });
      }
    }

    // Sort by access count descending
    topSegmentsWithCounts.sort((a, b) => b.accessCount - a.accessCount);

    return {
      ok: true,
      value: {
        usageStats: {
          totalRetrievals: usage.totalInjections,
          uniqueSegmentsRetrieved: usage.uniqueSegmentsUsed,
          topSegments: topSegmentsWithCounts,
        },
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'USAGE_STATS_READ_FAILED',
        message: `Failed to get usage stats: ${(error as Error).message}`,
        cause: error as Error,
      },
    };
  }
}
