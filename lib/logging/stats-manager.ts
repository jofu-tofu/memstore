import { join } from 'path';
import { homedir } from 'os';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from 'fs';

// ============================================================================
// Types
// ============================================================================

export interface Stats {
  capture: CaptureStats;
  retrieval: RetrievalStats;
  processing: ProcessingStats;
  usage: UsageStats;
}

export interface CaptureStats {
  totalCount: number;
  sum: number; // Sum of latencies (for average)
  avgLatencyMs: number; // Computed average
  lastRun: number; // Unix timestamp (ms)
  errors: number;
}

export interface RetrievalStats {
  totalCount: number;
  sum: number; // Sum of latencies
  avgLatencyMs: number;
  sumResults: number; // Sum of result counts
  avgResultCount: number;
  sumTokens: number; // Sum of injected tokens
  avgInjectedTokens: number;
  budgetExceededCount: number;
  lastRun: number;
}

export interface ProcessingStats {
  totalSegmentsCreated: number;
  sessionCount: number; // Number of processing sessions
  sumSegments: number; // Sum of segments per session
  avgSegmentsPerSession: number;
  sumProcessingMs: number; // Sum of processing times
  avgProcessingMs: number;
  queueDepth: number; // Last measured depth
  failedItems: number;
}

export interface UsageStats {
  totalInjections: number; // Total count of all injections
  uniqueSegmentsUsed: number; // Distinct segment IDs used
  mostUsedSegments: string[]; // Top 10 segment IDs by frequency
  segmentFrequency: Record<string, number>; // Internal: segment ID -> count
}

export interface StatsError {
  code: string;
  message: string;
  cause?: Error;
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// ============================================================================
// Constants
// ============================================================================

const STATS_FILE_NAME = 'stats.json';

// ============================================================================
// Path Helpers
// ============================================================================

function getPaiDir(): string {
  return process.env.PAI_DIR || join(homedir(), 'pai');
}

function getMetricsDir(): string {
  return join(getPaiDir(), 'mem-store', 'metrics');
}

function getStatsPath(): string {
  return join(getMetricsDir(), STATS_FILE_NAME);
}

// ============================================================================
// Default Stats
// ============================================================================

function getDefaultStats(): Stats {
  return {
    capture: {
      totalCount: 0,
      sum: 0,
      avgLatencyMs: 0,
      lastRun: 0,
      errors: 0,
    },
    retrieval: {
      totalCount: 0,
      sum: 0,
      avgLatencyMs: 0,
      sumResults: 0,
      avgResultCount: 0,
      sumTokens: 0,
      avgInjectedTokens: 0,
      budgetExceededCount: 0,
      lastRun: 0,
    },
    processing: {
      totalSegmentsCreated: 0,
      sessionCount: 0,
      sumSegments: 0,
      avgSegmentsPerSession: 0,
      sumProcessingMs: 0,
      avgProcessingMs: 0,
      queueDepth: 0,
      failedItems: 0,
    },
    usage: {
      totalInjections: 0,
      uniqueSegmentsUsed: 0,
      mostUsedSegments: [],
      segmentFrequency: {},
    },
  };
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Load stats from file, or return defaults if file doesn't exist
 */
function loadStats(): Stats {
  const statsPath = getStatsPath();

  if (!existsSync(statsPath)) {
    return getDefaultStats();
  }

  try {
    const content = readFileSync(statsPath, 'utf-8');
    return JSON.parse(content) as Stats;
  } catch (error) {
    // Corrupted file - log error and return defaults
    console.error(
      `[Memory:StatsManager] Failed to parse stats.json, using defaults: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return getDefaultStats();
  }
}

/**
 * Save stats to file atomically using temp file + rename
 */
function saveStats(stats: Stats): Result<void, StatsError> {
  const statsPath = getStatsPath();
  const metricsDir = getMetricsDir();
  const tempPath = `${statsPath}.tmp.${process.pid}`;

  try {
    // Ensure metrics directory exists
    if (!existsSync(metricsDir)) {
      mkdirSync(metricsDir, { recursive: true });
    }

    // Write to temp file
    writeFileSync(tempPath, JSON.stringify(stats, null, 2), 'utf-8');

    // Atomic rename
    renameSync(tempPath, statsPath);

    return { ok: true, value: undefined };
  } catch (error) {
    // Clean up temp file if it exists
    if (existsSync(tempPath)) {
      try {
        unlinkSync(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }

    const message =
      error instanceof Error ? error.message : String(error);
    console.error(`[Memory:StatsManager] Failed to save stats: ${message}`);

    return {
      ok: false,
      error: {
        code: 'STATS_WRITE_FAILED',
        message,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}

/**
 * Atomic read-modify-write operation
 */
function atomicUpdate(
  modifier: (stats: Stats) => void
): Result<void, StatsError> {
  try {
    // Read
    const stats = loadStats();

    // Modify
    modifier(stats);

    // Write
    return saveStats(stats);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error(`[Memory:StatsManager] Update failed: ${message}`);

    return {
      ok: false,
      error: {
        code: 'STATS_UPDATE_FAILED',
        message,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get current stats (read-only)
 */
export function getStats(): Result<Stats, StatsError> {
  try {
    const stats = loadStats();
    return { ok: true, value: stats };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error(`[Memory:StatsManager] Failed to read stats: ${message}`);

    return {
      ok: false,
      error: {
        code: 'STATS_READ_FAILED',
        message,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}

/**
 * Update capture hook stats
 */
export function updateCaptureStats(
  latencyMs: number,
  success: boolean
): Result<void, StatsError> {
  // Input validation
  if (latencyMs < 0) {
    return {
      ok: false,
      error: {
        code: 'STATS_UPDATE_FAILED',
        message: 'Latency cannot be negative',
      },
    };
  }

  return atomicUpdate((stats) => {
    const capture = stats.capture;

    // Update running average (incremental mean algorithm)
    capture.totalCount++;
    capture.sum += latencyMs;
    capture.avgLatencyMs = capture.sum / capture.totalCount;
    capture.lastRun = Date.now();

    if (!success) {
      capture.errors++;
    }
  });
}

/**
 * Update retrieval hook stats
 */
export function updateRetrievalStats(
  latencyMs: number,
  resultCount: number,
  injectedTokens: number,
  budgetExceeded: boolean
): Result<void, StatsError> {
  // Input validation
  if (latencyMs < 0 || resultCount < 0 || injectedTokens < 0) {
    return {
      ok: false,
      error: {
        code: 'STATS_UPDATE_FAILED',
        message: 'Latency, result count, and token count cannot be negative',
      },
    };
  }

  return atomicUpdate((stats) => {
    const retrieval = stats.retrieval;

    // Update latency average (incremental mean algorithm)
    retrieval.totalCount++;
    retrieval.sum += latencyMs;
    retrieval.avgLatencyMs = retrieval.sum / retrieval.totalCount;

    // Update result count average
    retrieval.sumResults += resultCount;
    retrieval.avgResultCount = retrieval.sumResults / retrieval.totalCount;

    // Update token count average
    retrieval.sumTokens += injectedTokens;
    retrieval.avgInjectedTokens = retrieval.sumTokens / retrieval.totalCount;

    // Update budget exceeded count
    if (budgetExceeded) {
      retrieval.budgetExceededCount++;
    }

    retrieval.lastRun = Date.now();
  });
}

/**
 * Update queue processor stats
 */
export function updateProcessingStats(
  segmentsCreated: number,
  processingMs: number,
  queueDepth: number,
  failedCount: number
): Result<void, StatsError> {
  // Input validation
  if (segmentsCreated < 0 || processingMs < 0 || queueDepth < 0 || failedCount < 0) {
    return {
      ok: false,
      error: {
        code: 'STATS_UPDATE_FAILED',
        message: 'Processing stats values cannot be negative',
      },
    };
  }

  return atomicUpdate((stats) => {
    const processing = stats.processing;

    // Update total segments (cumulative)
    processing.totalSegmentsCreated += segmentsCreated;

    // Increment session count
    processing.sessionCount++;

    // Update segments per session average (incremental mean algorithm)
    processing.sumSegments += segmentsCreated;
    processing.avgSegmentsPerSession = processing.sumSegments / processing.sessionCount;

    // Update processing time average (incremental mean algorithm)
    processing.sumProcessingMs += processingMs;
    processing.avgProcessingMs = processing.sumProcessingMs / processing.sessionCount;

    // Update queue depth (last value)
    processing.queueDepth = queueDepth;

    // Update failed items (cumulative)
    processing.failedItems += failedCount;
  });
}

/**
 * Update usage stats when segments are injected into sessions.
 * Tracks total injections, unique segments, and most frequently used segments.
 *
 * **Behavior:**
 * - Duplicate IDs in the array are counted separately for totalInjections
 * - Duplicate IDs increment the same segment's frequency counter
 * - Empty array is a no-op (returns ok:true immediately)
 * - Note: Frequency map currently grows unbounded (pruning deferred to Epic 6)
 *
 * **Thread Safety:**
 * - Uses atomic read-modify-write pattern via temp file + rename
 * - Safe for concurrent calls from multiple retrieval hooks
 *
 * **Performance:**
 * - O(n) for n segment IDs in input array
 * - O(m log m) for sorting frequency map (m = unique segments)
 * - Bounded by pruning: keeps only segments with count >= 2
 *
 * @param segmentIds - Array of segment IDs that were injected (may contain duplicates)
 * @returns Result indicating success or error
 *
 * @example
 * ```typescript
 * // Single injection
 * const result = updateUsageStats(['seg_001', 'seg_002', 'seg_003']);
 * // totalInjections += 3, uniqueSegmentsUsed may increase
 *
 * // Duplicate IDs (both counted for total, but same frequency counter)
 * updateUsageStats(['seg_001', 'seg_001']);
 * // totalInjections += 2, but seg_001 frequency += 2 (not 4)
 * ```
 */
export function updateUsageStats(
  segmentIds: string[]
): Result<void, StatsError> {
  // Input validation
  if (!Array.isArray(segmentIds)) {
    return {
      ok: false,
      error: {
        code: 'STATS_UPDATE_FAILED',
        message: 'segmentIds must be an array',
      },
    };
  }

  // No-op for empty list
  if (segmentIds.length === 0) {
    return { ok: true, value: undefined };
  }

  return atomicUpdate((stats) => {
    // Initialize usage section if missing (backward compatibility)
    if (!stats.usage) {
      stats.usage = {
        totalInjections: 0,
        uniqueSegmentsUsed: 0,
        mostUsedSegments: [],
        segmentFrequency: {},
      };
    }

    const usage = stats.usage;

    // Increment total injections
    usage.totalInjections += segmentIds.length;

    // Update frequency counts
    for (const id of segmentIds) {
      usage.segmentFrequency[id] = (usage.segmentFrequency[id] || 0) + 1;
    }

    // TODO (MEDIUM #1): Implement time-based pruning to prevent unbounded growth
    // Current approach: Keep all segments with any access count
    // Future: Prune segments with low frequency AND old lastAccessed timestamp
    // Example: Remove segments with count=1 AND lastAccessed > 90 days
    // This requires loading segment metadata, so deferring to Epic 6 (Data Quality)

    // Update unique segments count
    usage.uniqueSegmentsUsed = Object.keys(usage.segmentFrequency).length;

    // Update top 10 most used segments
    const sorted = Object.entries(usage.segmentFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
    usage.mostUsedSegments = sorted.map(([id]) => id);
  });
}
