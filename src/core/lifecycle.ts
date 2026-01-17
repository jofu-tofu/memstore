/**
 * Memory Lifecycle Management
 *
 * Identifies decay candidates and generates lifecycle recommendations
 * based on usage patterns and access recency.
 *
 * Story 6.3: Decay Signal Tracking
 * @module core/lifecycle
 */

import type { Result } from '../types/common';
import type {
  DecayReport,
  DecayCandidate,
  DecayPriority,
  DecayReason,
  DecayRecommendation,
  LifecycleError
} from '../types/lifecycle';
import {
  findStaleSegments,
  findNeverAccessedSegments,
  findStaleSessions
} from '../lib/segment-search';

/**
 * Thresholds for decay classification (in days).
 * Story 6.3: Based on cognitive science and practical retention needs.
 */
const STALE_THRESHOLD_DAYS = 90;      // Segments >90 days without access
const RECENT_THRESHOLD_DAYS = 30;     // Recently created segments
const CREATION_AGE_OLD_DAYS = 90;     // Old segments (created >90 days ago)

/**
 * Identify segments that are candidates for decay-based lifecycle actions.
 *
 * Story 6.3 AC4: Lifecycle module detects:
 * - Segments never accessed (accessCount === 0)
 * - Segments not accessed in 90+ days
 * - Sessions where all segments are stale
 *
 * Priority classification:
 * - HIGH: Never accessed + created >90 days ago → delete
 * - MEDIUM: Never accessed + created 30-90 days ago → monitor
 * - LOW: Stale but previously used → archive
 *
 * @returns Result with decay report or error
 *
 * @example
 * ```typescript
 * const result = await identifyDecayCandidates();
 * if (result.ok) {
 *   const report = result.value;
 *   console.log(`Total candidates: ${report.totalCandidates}`);
 *   console.log(`High priority: ${report.highPriority}`);
 *
 *   report.candidates.forEach(candidate => {
 *     console.log(`${candidate.segmentId}: ${candidate.recommendation} (${candidate.priority})`);
 *   });
 * }
 * ```
 */
export async function identifyDecayCandidates(): Promise<Result<DecayReport, LifecycleError>> {
  try {
    // Query for never-accessed segments
    const neverAccessedResult = await findNeverAccessedSegments();
    if (!neverAccessedResult.ok) {
      return {
        ok: false,
        error: {
          code: 'LIFECYCLE_DECAY_FAILED',
          message: `Failed to query never-accessed segments: ${neverAccessedResult.error.message}`,
          cause: neverAccessedResult.error.cause
        }
      };
    }

    // Query for stale segments (90+ days)
    const staleResult = await findStaleSegments(STALE_THRESHOLD_DAYS);
    if (!staleResult.ok) {
      return {
        ok: false,
        error: {
          code: 'LIFECYCLE_DECAY_FAILED',
          message: `Failed to query stale segments: ${staleResult.error.message}`,
          cause: staleResult.error.cause
        }
      };
    }

    // Query for stale sessions
    const staleSessionsResult = await findStaleSessions(STALE_THRESHOLD_DAYS);
    if (!staleSessionsResult.ok) {
      return {
        ok: false,
        error: {
          code: 'LIFECYCLE_DECAY_FAILED',
          message: `Failed to query stale sessions: ${staleSessionsResult.error.message}`,
          cause: staleSessionsResult.error.cause
        }
      };
    }

    // Classify candidates
    const candidates: DecayCandidate[] = [];
    const now = Date.now();

    // Process never-accessed segments
    for (const segment of neverAccessedResult.value) {
      const createdAtMs = segment.timestamp;
      const ageDays = (now - createdAtMs) / (1000 * 60 * 60 * 24);

      if (ageDays > CREATION_AGE_OLD_DAYS) {
        // Never accessed + old = high priority deletion
        candidates.push({
          segmentId: segment.id,
          reason: 'never_accessed_old',
          ageDays: ageDays,
          accessCount: 0,
          recommendation: 'delete',
          priority: 'high'
        });
      } else if (ageDays > RECENT_THRESHOLD_DAYS) {
        // Never accessed + medium age = monitor
        candidates.push({
          segmentId: segment.id,
          reason: 'never_accessed_recent',
          ageDays: ageDays,
          accessCount: 0,
          recommendation: 'monitor',
          priority: 'medium'
        });
      }
      // Skip very recent never-accessed segments (< 30 days)
    }

    // Process stale segments (previously accessed)
    for (const stale of staleResult.value) {
      // Only include segments that HAVE been accessed before
      // ageDays !== null means segment was accessed at least once
      if (stale.accessCount > 0 && stale.ageDays !== null) {
        // Check if not already in candidates (from never-accessed)
        const alreadyIncluded = candidates.some(c => c.segmentId === stale.id);
        if (!alreadyIncluded) {
          // ageDays is guaranteed non-null here due to check above
          const ageDaysValue = stale.ageDays;
          candidates.push({
            segmentId: stale.id,
            reason: 'stale_previously_used',
            ageDays: ageDaysValue,
            accessCount: stale.accessCount,
            recommendation: 'archive',
            priority: 'low'
          });
        }
      }
    }

    // Generate summary report
    const highPriority = candidates.filter(c => c.priority === 'high').length;
    const mediumPriority = candidates.filter(c => c.priority === 'medium').length;
    const lowPriority = candidates.filter(c => c.priority === 'low').length;

    const report: DecayReport = {
      timestamp: now,
      timestampFormatted: new Date(now).toISOString(),
      totalCandidates: candidates.length,
      highPriority,
      mediumPriority,
      lowPriority,
      candidates,
      staleSessions: staleSessionsResult.value
    };

    console.error(
      `[Memory:Lifecycle] Identified ${candidates.length} decay candidates (${highPriority} high, ${mediumPriority} medium, ${lowPriority} low)`
    );

    return { ok: true, value: report };

  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'LIFECYCLE_DECAY_FAILED',
        message: `Failed to identify decay candidates: ${(error as Error).message}`,
        cause: error as Error
      }
    };
  }
}

/**
 * Generate a comprehensive decay report.
 * Story 6.3 AC4: Alias for identifyDecayCandidates for semantic clarity.
 *
 * @returns Result with decay report or error
 */
export async function generateDecayReport(): Promise<Result<DecayReport, LifecycleError>> {
  return identifyDecayCandidates();
}
