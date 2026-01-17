/**
 * Insights types for Story 6.5: Queryable Insights
 *
 * Defines structures for querying and reporting actionable insights about
 * memory system performance, segment usage, and provider quality.
 */

import type { TimeRange } from './performance';

/**
 * Segment insight metadata.
 *
 * Aggregated metadata from segment frontmatter for insights queries.
 */
export interface SegmentInsight {
  /** Segment ID */
  id: string;

  /** Session this segment belongs to */
  sessionId: string;

  /** Number of times accessed (from frontmatter) */
  accessCount: number;

  /** Last access timestamp in Unix ms (from frontmatter) */
  lastAccessed: number | null;

  /** Segment tags (from frontmatter) */
  tags: string[];

  /** Optional title extracted from content */
  title?: string;

  /** Provider that created this segment */
  provider?: string;
}

/**
 * Success rate metrics for retrieval operations.
 *
 * Calculated from operations.jsonl retrieval logs.
 */
export interface SuccessRateMetrics {
  /** Time range analyzed */
  timeRange: TimeRange & { days: number };

  /** Total retrieval queries */
  totalQueries: number;

  /** Successful queries (resultsReturned > 0) */
  successfulQueries: number;

  /** Failed queries (resultsReturned = 0) */
  failedQueries: number;

  /** Success rate percentage (0-100) */
  successRate: number;

  /** Average latency across all queries */
  avgLatencyMs: number;

  /** Average results returned per query */
  avgResults: number;

  /** Average tokens injected per query */
  avgTokensInjected: number;
}

/**
 * Potential issue detected during insights analysis.
 */
export interface Issue {
  /** Issue severity */
  severity: 'info' | 'warning' | 'error';

  /** Issue category */
  category:
    | 'stale-segments'
    | 'slow-provider'
    | 'low-success-rate'
    | 'storage-growth'
    | 'zero-results';

  /** Human-readable message */
  message: string;

  /** Count of items affected */
  count?: number;

  /** Additional details */
  details?: unknown;
}

/**
 * System-level statistics.
 */
export interface SystemStats {
  /** Total sessions captured */
  totalSessions: number;

  /** Total segments created */
  totalSegments: number;

  /** Storage used in bytes */
  storageUsedBytes: number;

  /** Storage used formatted */
  storageUsedMB: string;

  /** Oldest segment date */
  oldestSegmentDate: string;

  /** Newest segment date */
  newestSegmentDate: string;
}

/**
 * Comprehensive insights summary report.
 *
 * Aggregates all insights data for a complete system health overview.
 */
export interface InsightsSummary {
  /** Timestamp when report was generated */
  timestamp: number;

  /** Formatted timestamp */
  timestampFormatted: string;

  /** System-level statistics */
  systemStats: SystemStats;

  /** Retrieval statistics for specified time range */
  retrievalStats: SuccessRateMetrics;

  /** Top performing segments by access count */
  topSegments: SegmentInsight[];

  /** Potential issues detected */
  potentialIssues: Issue[];
}

/**
 * Provider quality analysis result.
 *
 * Aggregates usage, success, and performance data for a provider.
 */
export interface ProviderQuality {
  /** Provider category */
  category: 'segment' | 'extract' | 'summarize' | 'storage' | 'search';

  /** Provider name */
  providerName: string;

  /** Number of segments created by this provider */
  segmentsCreated: number;

  /** Average access count for segments from this provider */
  avgAccessCount: number;

  /** Success rate for operations using this provider (0-100) */
  successRate: number;

  /** Average latency for this provider */
  avgLatencyMs: number;

  /** Composite quality score (0-100) */
  qualityScore: number;
}

/**
 * Error type for insights operations.
 */
export interface InsightsError {
  code:
    | 'INSIGHTS_TOP_SEGMENTS_FAILED'
    | 'INSIGHTS_STALE_SEGMENTS_FAILED'
    | 'INSIGHTS_SLOW_PROVIDERS_FAILED'
    | 'INSIGHTS_SUCCESS_RATE_FAILED'
    | 'INSIGHTS_COMPARISON_FAILED'
    | 'INSIGHTS_SUMMARY_FAILED'
    | 'INSIGHTS_PROVIDER_QUALITY_FAILED'
    | 'INSIGHTS_DATA_LOAD_FAILED';
  message: string;
  cause?: Error;
}
