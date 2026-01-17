/**
 * Lifecycle management types for MemStore
 *
 * This module defines types for memory lifecycle operations including
 * decay detection, archival, and retention policy enforcement.
 *
 * Story 6.3: Decay Signal Tracking
 */

import type { StaleSession } from '../lib/segment-search';

/**
 * Priority level for decay candidates.
 */
export type DecayPriority = 'high' | 'medium' | 'low';

/**
 * Reason code for why a segment is a decay candidate.
 */
export type DecayReason =
  | 'never_accessed_old'      // Created >90 days ago, never accessed
  | 'never_accessed_recent'   // Created 30-90 days ago, never accessed
  | 'stale_previously_used';  // Accessed before but >90 days stale

/**
 * Recommended action for a decay candidate.
 */
export type DecayRecommendation =
  | 'delete'   // Strong candidate for deletion
  | 'archive'  // Move to archive storage
  | 'monitor'; // Keep but watch for continued disuse

/**
 * A segment identified as a candidate for decay-based lifecycle action.
 */
export interface DecayCandidate {
  /** Segment identifier */
  segmentId: string;

  /** Why this segment was identified as a decay candidate */
  reason: DecayReason;

  /** Age in days since creation or last access */
  ageDays: number;

  /** Number of times accessed (reinforcement signal) */
  accessCount: number;

  /** Recommended action based on usage patterns */
  recommendation: DecayRecommendation;

  /** Priority level for taking action */
  priority: DecayPriority;
}

/**
 * Comprehensive decay analysis report.
 * Story 6.3 AC4: Lifecycle module generates decay reports.
 */
export interface DecayReport {
  /** When this report was generated (Unix milliseconds) */
  timestamp: number;

  /** Human-readable timestamp (ISO 8601 format) */
  timestampFormatted: string;

  /** Total number of decay candidates identified */
  totalCandidates: number;

  /** Count of high-priority candidates (likely deletion) */
  highPriority: number;

  /** Count of medium-priority candidates (monitor) */
  mediumPriority: number;

  /** Count of low-priority candidates (archive) */
  lowPriority: number;

  /** Detailed candidate list */
  candidates: DecayCandidate[];

  /** Sessions where all segments are stale */
  staleSessions: StaleSession[];
}

/**
 * Error type for lifecycle operations.
 */
export interface LifecycleError {
  code: string;
  message: string;
  cause?: Error;
}
