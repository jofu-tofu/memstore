/**
 * Performance metrics types for Story 6.4: Layer Performance Monitoring
 *
 * Defines structures for per-provider performance metrics, threshold detection,
 * quality correlation, provider comparison, and trend analysis.
 */

/**
 * Time range for metrics queries.
 */
export interface TimeRange {
  /** Start timestamp (Unix ms) */
  start: number;

  /** End timestamp (Unix ms) */
  end: number;

  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Provider-level performance metrics.
 *
 * Contains statistical analysis of provider latency including percentiles.
 */
export interface ProviderMetrics {
  /** Provider name */
  providerName: string;

  /** Number of operations measured */
  operationCount: number;

  /** Average latency in milliseconds */
  avgMs: number;

  /** Median latency (50th percentile) */
  p50Ms: number;

  /** 95th percentile latency */
  p95Ms: number;

  /** 99th percentile latency */
  p99Ms: number;

  /** Minimum latency observed */
  minMs: number;

  /** Maximum latency observed */
  maxMs: number;

  /** Configured threshold for this provider */
  threshold: number;

  /** Whether average exceeds threshold */
  exceedsThreshold: boolean;
}

/**
 * Layer-level performance metrics (for layers without provider variation).
 *
 * Used for filter, rank, inject layers in retrieval pipeline.
 */
export interface LayerMetrics {
  /** Number of operations measured */
  operationCount: number;

  /** Average latency in milliseconds */
  avgMs: number;

  /** Median latency (50th percentile) */
  p50Ms: number;

  /** 95th percentile latency */
  p95Ms: number;

  /** 99th percentile latency */
  p99Ms: number;

  /** Minimum latency observed */
  minMs: number;

  /** Maximum latency observed */
  maxMs: number;

  /** Configured threshold for this layer */
  threshold: number;

  /** Whether average exceeds threshold */
  exceedsThreshold: boolean;
}

/**
 * Slow provider detection result.
 *
 * Identifies providers exceeding latency thresholds.
 */
export interface SlowProvider {
  /** Provider category (segment, extract, summarize, storage, search) */
  category: 'segment' | 'extract' | 'summarize' | 'storage' | 'search';

  /** Provider name */
  providerName: string;

  /** Average latency in milliseconds */
  avgMs: number;

  /** Configured threshold */
  threshold: number;

  /** Percentage over threshold */
  exceedancePercent: number;

  /** Severity level */
  severity: 'warn' | 'error';
}

/**
 * Quality issue detection result.
 *
 * Identifies providers with poor quality metrics (low success rate).
 */
export interface QualityIssue {
  /** Provider name */
  providerName: string;

  /** Provider category */
  category: string;

  /** Success rate percentage (0-100) */
  successRate: number;

  /** Expected threshold */
  threshold: number;

  /** Reason for quality issue */
  reason: string;
}

/**
 * Complete performance report.
 *
 * Aggregates all performance metrics for capture and retrieval pipelines.
 */
export interface PerformanceReport {
  /** Timestamp when report was generated */
  timestamp: number;

  /** Formatted timestamp */
  timestampFormatted: string;

  /** Time range covered by this report */
  timeRange: TimeRange;

  /** Capture pipeline metrics */
  pipeline: {
    segment: ProviderMetrics;
    extract: ProviderMetrics;
    summarize: ProviderMetrics;
    storage: ProviderMetrics;
  };

  /** Retrieval pipeline metrics */
  retrieval: {
    search: ProviderMetrics;
    filter: LayerMetrics;
    rank: LayerMetrics;
    inject: LayerMetrics;
  };

  /** Providers exceeding latency thresholds */
  slowProviders: SlowProvider[];

  /** Providers with quality issues */
  qualityIssues: QualityIssue[];
}

/**
 * Provider comparison report.
 *
 * Compares two providers across metrics.
 */
export interface ComparisonReport {
  /** First provider name */
  providerA: string;

  /** Second provider name */
  providerB: string;

  /** Metrics for provider A */
  metricsA: ProviderMetrics;

  /** Metrics for provider B */
  metricsB: ProviderMetrics;

  /** Delta metrics (B - A) */
  delta: {
    /** Latency difference (negative = B is faster) */
    avgLatencyDelta: number;

    /** Percentage change in latency */
    latencyPercentChange: number;

    /** Success rate difference */
    successRateDelta?: number;
  };

  /** Which provider performed better */
  recommendation: 'A' | 'B' | 'neutral';
}

/**
 * Trend direction.
 */
export type TrendDirection = 'improving' | 'degrading' | 'stable';

/**
 * Trend analysis for a single provider.
 */
export interface ProviderTrend {
  /** Provider name */
  providerName: string;

  /** Current average latency */
  currentAvg: number;

  /** Previous average latency */
  previousAvg: number;

  /** Percent change */
  percentChange: number;

  /** Trend direction */
  direction: TrendDirection;
}

/**
 * Trend analysis report.
 *
 * Analyzes performance trends over time.
 */
export interface TrendReport {
  /** Timestamp when report was generated */
  timestamp: number;

  /** Time range covered */
  timeRange: TimeRange;

  /** Per-provider trends */
  providerTrends: ProviderTrend[];

  /** Identified bottlenecks (slowest layers) */
  bottlenecks: {
    category: string;
    providerName: string;
    avgMs: number;
  }[];

  /** Performance regressions detected */
  regressions: {
    providerName: string;
    percentIncrease: number;
  }[];
}

/**
 * Error type for metrics operations.
 */
export interface MetricsError {
  code:
    | 'METRICS_CALCULATION_FAILED'
    | 'METRICS_LOG_NOT_FOUND'
    | 'METRICS_PARSE_ERROR'
    | 'METRICS_INVALID_TIME_RANGE'
    | 'METRICS_PROVIDER_NOT_FOUND';
  message: string;
  cause?: Error;
}
