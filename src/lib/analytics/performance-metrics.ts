/**
 * Performance Metrics Aggregator - Story 6.4
 *
 * Analyzes operations.jsonl to provide per-provider performance insights.
 *
 * Features:
 * - Per-provider latency statistics (avg, p50, p95, p99)
 * - Threshold detection and alerting
 * - Quality correlation (success rate tracking)
 * - Provider comparison (A/B testing support)
 * - Trend analysis (improving/degrading/stable)
 *
 * @module performance-metrics
 */

import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import type { Result } from '../../types/common';
import type {
  PerformanceReport,
  ProviderMetrics,
  LayerMetrics,
  SlowProvider,
  QualityIssue,
  ComparisonReport,
  TrendReport,
  ProviderTrend,
  TrendDirection,
  TimeRange,
  MetricsError,
} from '../../types/performance';
import type {
  CaptureOperationMetadata,
  RetrievalOperationMetadata,
  ProviderTiming,
} from '../logging/operations-logger';

/**
 * Default latency thresholds per provider type (in milliseconds).
 *
 * Based on Architecture NFRs:
 * - Capture pipeline: 3000ms total budget
 * - Retrieval pipeline: 1000ms total budget
 */
export const DEFAULT_LATENCY_THRESHOLDS = {
  // Capture pipeline (total budget: 3000ms)
  segment: 500, // 500ms max for segmentation
  extract: 800, // 800ms max for extraction
  summarize: 500, // 500ms max for summarization
  storage: 300, // 300ms max for storage writes

  // Retrieval pipeline (total budget: 1000ms)
  search: 400, // 400ms max for search
  filter: 100, // 100ms max for filtering
  rank: 100, // 100ms max for ranking
  inject: 100, // 100ms max for injection
} as const;

/**
 * Success rate threshold for quality issues (percentage).
 */
const SUCCESS_RATE_THRESHOLD = 70; // Flag if success rate < 70%

/**
 * Get the path to the operations log file.
 *
 * @returns Absolute path to operations.jsonl
 */
function getOperationsLogPath(): string {
  const memstoreDir = process.env.MEMSTORE_DIR || join(homedir(), '.memstore');
  return join(memstoreDir, 'mem-store', 'metrics', 'operations.jsonl');
}

/**
 * Calculate percentile from array of values.
 *
 * Uses simple nearest-rank method.
 *
 * @param values - Array of numeric values
 * @param percentile - Percentile to calculate (e.g., 50, 95, 99)
 * @returns Percentile value
 */
function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Parse operations.jsonl file and filter by time range.
 *
 * Gracefully handles:
 * - Missing file (returns empty array)
 * - Corrupted lines (skips and logs warning)
 * - Both old and new schema formats
 *
 * @param timeRange - Optional time range filter
 * @returns Result with operations array or error
 */
async function parseOperationsLog(
  timeRange?: TimeRange
): Promise<
  Result<
    (CaptureOperationMetadata | RetrievalOperationMetadata)[],
    MetricsError
  >
> {
  const logPath = getOperationsLogPath();

  if (!existsSync(logPath)) {
    // No operations logged yet - not an error, just empty
    return { ok: true, value: [] };
  }

  try {
    const file = Bun.file(logPath);
    const content = await file.text();
    const lines = content.split('\n').filter((l) => l.trim());

    const operations: (CaptureOperationMetadata | RetrievalOperationMetadata)[] =
      [];
    let parseFailures = 0;

    for (const line of lines) {
      try {
        const op = JSON.parse(line);

        // Apply time range filter if specified
        if (timeRange) {
          const timestamp =
            'capturedAt' in op ? op.capturedAt : op.timestamp;
          if (timestamp < timeRange.start || timestamp > timeRange.end) {
            continue; // Skip operations outside time range
          }
        }

        operations.push(op);
      } catch (error) {
        parseFailures++;
        console.error(
          `[Memory:Metrics] Failed to parse line: ${line.substring(0, 50)}...`
        );
      }
    }

    if (parseFailures > 0) {
      console.error(
        `[Memory:Metrics] Loaded ${operations.length} operations (${parseFailures} parse failures)`
      );
    }

    return { ok: true, value: operations };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'METRICS_PARSE_ERROR',
        message: `Failed to parse operations log: ${
          error instanceof Error ? error.message : String(error)
        }`,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}

/**
 * Calculate provider metrics from timing data.
 *
 * @param timings - Array of provider timings
 * @param threshold - Configured latency threshold
 * @returns Provider metrics
 */
function calculateProviderMetrics(
  timings: { provider: string; latencyMs: number }[],
  threshold: number
): ProviderMetrics {
  if (timings.length === 0) {
    return {
      providerName: 'none',
      operationCount: 0,
      avgMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      minMs: 0,
      maxMs: 0,
      threshold,
      exceedsThreshold: false,
    };
  }

  const latencies = timings.map((t) => t.latencyMs);
  const providerName = timings[0].provider;

  const avgMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p50Ms = calculatePercentile(latencies, 50);
  const p95Ms = calculatePercentile(latencies, 95);
  const p99Ms = calculatePercentile(latencies, 99);
  const minMs = Math.min(...latencies);
  const maxMs = Math.max(...latencies);

  return {
    providerName,
    operationCount: timings.length,
    avgMs,
    p50Ms,
    p95Ms,
    p99Ms,
    minMs,
    maxMs,
    threshold,
    exceedsThreshold: avgMs > threshold,
  };
}

/**
 * Calculate layer metrics from latency data.
 *
 * @param latencies - Array of latencies
 * @param threshold - Configured latency threshold
 * @returns Layer metrics
 */
function calculateLayerMetrics(
  latencies: number[],
  threshold: number
): LayerMetrics {
  if (latencies.length === 0) {
    return {
      operationCount: 0,
      avgMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      minMs: 0,
      maxMs: 0,
      threshold,
      exceedsThreshold: false,
    };
  }

  const avgMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p50Ms = calculatePercentile(latencies, 50);
  const p95Ms = calculatePercentile(latencies, 95);
  const p99Ms = calculatePercentile(latencies, 99);
  const minMs = Math.min(...latencies);
  const maxMs = Math.max(...latencies);

  return {
    operationCount: latencies.length,
    avgMs,
    p50Ms,
    p95Ms,
    p99Ms,
    minMs,
    maxMs,
    threshold,
    exceedsThreshold: avgMs > threshold,
  };
}

/**
 * Detect slow providers from metrics.
 *
 * Logs warnings to stderr for providers exceeding thresholds.
 *
 * @param metrics - Performance metrics
 * @returns Array of slow providers
 */
function detectSlowProviders(metrics: {
  pipeline: any;
  retrieval: any;
}): SlowProvider[] {
  const slow: SlowProvider[] = [];

  // Check pipeline providers
  for (const [category, providerMetrics] of Object.entries(metrics.pipeline)) {
    const pm = providerMetrics as ProviderMetrics;
    if (pm.exceedsThreshold && pm.operationCount > 0) {
      const exceedancePercent =
        ((pm.avgMs - pm.threshold) / pm.threshold) * 100;
      const severity = exceedancePercent > 50 ? 'error' : 'warn';

      slow.push({
        category: category as any,
        providerName: pm.providerName,
        avgMs: pm.avgMs,
        threshold: pm.threshold,
        exceedancePercent,
        severity,
      });

      // Log to stderr
      console.error(
        `[Memory:Metrics] SLOW: ${category} provider ${pm.providerName} avg ${Math.round(pm.avgMs)}ms > threshold ${pm.threshold}ms`
      );
    }
  }

  // Check retrieval search provider
  const searchMetrics = metrics.retrieval.search as ProviderMetrics;
  if (searchMetrics.exceedsThreshold && searchMetrics.operationCount > 0) {
    const exceedancePercent =
      ((searchMetrics.avgMs - searchMetrics.threshold) /
        searchMetrics.threshold) *
      100;
    const severity = exceedancePercent > 50 ? 'error' : 'warn';

    slow.push({
      category: 'search',
      providerName: searchMetrics.providerName,
      avgMs: searchMetrics.avgMs,
      threshold: searchMetrics.threshold,
      exceedancePercent,
      severity,
    });

    console.error(
      `[Memory:Metrics] SLOW: search provider ${searchMetrics.providerName} avg ${Math.round(searchMetrics.avgMs)}ms > threshold ${searchMetrics.threshold}ms`
    );
  }

  return slow;
}

/**
 * Detect quality issues from retrieval operations.
 *
 * Flags providers with low success rates.
 *
 * @param retrievalOps - Retrieval operations
 * @returns Array of quality issues
 */
function detectQualityIssues(
  retrievalOps: RetrievalOperationMetadata[]
): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Group by search provider
  const byProvider = new Map<string, RetrievalOperationMetadata[]>();

  for (const op of retrievalOps) {
    // Handle both old and new schema
    const provider =
      op.layerTiming?.search.provider || op.provider || 'unknown';
    if (!byProvider.has(provider)) {
      byProvider.set(provider, []);
    }
    byProvider.get(provider)!.push(op);
  }

  // Calculate success rate per provider
  for (const [provider, ops] of byProvider.entries()) {
    const total = ops.length;
    const successful = ops.filter((op) => op.success).length;
    const successRate = (successful / total) * 100;

    // Flag if success rate < threshold
    if (successRate < SUCCESS_RATE_THRESHOLD) {
      issues.push({
        providerName: provider,
        category: 'search',
        successRate,
        threshold: SUCCESS_RATE_THRESHOLD,
        reason: `Low retrieval success rate (${successRate.toFixed(1)}% < ${SUCCESS_RATE_THRESHOLD}%)`,
      });

      console.error(
        `[Memory:Metrics] QUALITY: ${provider} success rate ${successRate.toFixed(1)}% < ${SUCCESS_RATE_THRESHOLD}% threshold`
      );
    }
  }

  return issues;
}

/**
 * Get comprehensive performance metrics.
 *
 * Analyzes operations.jsonl and generates performance report with:
 * - Per-provider latency statistics
 * - Slow provider detection
 * - Quality issue detection
 *
 * @param timeRange - Optional time range filter
 * @returns Result with performance report or error
 */
export async function getPerformanceMetrics(
  timeRange?: TimeRange
): Promise<Result<PerformanceReport, MetricsError>> {
  try {
    // Read operations.jsonl
    const operationsResult = await parseOperationsLog(timeRange);
    if (!operationsResult.ok) {
      return operationsResult;
    }

    const operations = operationsResult.value;

    // Separate capture and retrieval operations
    const captureOps = operations.filter(
      (op) => 'providerTiming' in op || 'providers' in op
    ) as CaptureOperationMetadata[];

    const retrievalOps = operations.filter(
      (op) => 'layerTiming' in op || 'provider' in op
    ) as RetrievalOperationMetadata[];

    // Extract timing data for each provider (new schema only)
    const captureOpsWithTiming = captureOps.filter((op) => op.providerTiming);

    const segmentTimings = captureOpsWithTiming.map((op) => ({
      provider: op.providerTiming!.segment.provider,
      latencyMs: op.providerTiming!.segment.latencyMs,
    }));

    const extractTimings = captureOpsWithTiming.flatMap((op) =>
      op.providerTiming!.extract.map((e) => ({
        provider: e.provider,
        latencyMs: e.latencyMs,
      }))
    );

    const summarizeTimings = captureOpsWithTiming.map((op) => ({
      provider: op.providerTiming!.summarize.provider,
      latencyMs: op.providerTiming!.summarize.latencyMs,
    }));

    const storageTimings = captureOpsWithTiming.map((op) => ({
      provider: op.providerTiming!.storage.provider,
      latencyMs: op.providerTiming!.storage.latencyMs,
    }));

    // Extract retrieval timing data (new schema only)
    const retrievalOpsWithTiming = retrievalOps.filter(
      (op) => op.layerTiming
    );

    const searchTimings = retrievalOpsWithTiming.map((op) => ({
      provider: op.layerTiming!.search.provider,
      latencyMs: op.layerTiming!.search.latencyMs,
    }));

    const filterLatencies = retrievalOpsWithTiming.map(
      (op) => op.layerTiming!.filter.latencyMs
    );

    const rankLatencies = retrievalOpsWithTiming.map(
      (op) => op.layerTiming!.rank.latencyMs
    );

    const injectLatencies = retrievalOpsWithTiming.map(
      (op) => op.layerTiming!.inject.latencyMs
    );

    // Calculate metrics
    const pipeline = {
      segment: calculateProviderMetrics(
        segmentTimings,
        DEFAULT_LATENCY_THRESHOLDS.segment
      ),
      extract: calculateProviderMetrics(
        extractTimings,
        DEFAULT_LATENCY_THRESHOLDS.extract
      ),
      summarize: calculateProviderMetrics(
        summarizeTimings,
        DEFAULT_LATENCY_THRESHOLDS.summarize
      ),
      storage: calculateProviderMetrics(
        storageTimings,
        DEFAULT_LATENCY_THRESHOLDS.storage
      ),
    };

    const retrieval = {
      search: calculateProviderMetrics(
        searchTimings,
        DEFAULT_LATENCY_THRESHOLDS.search
      ),
      filter: calculateLayerMetrics(
        filterLatencies,
        DEFAULT_LATENCY_THRESHOLDS.filter
      ),
      rank: calculateLayerMetrics(
        rankLatencies,
        DEFAULT_LATENCY_THRESHOLDS.rank
      ),
      inject: calculateLayerMetrics(
        injectLatencies,
        DEFAULT_LATENCY_THRESHOLDS.inject
      ),
    };

    // Detect issues
    const slowProviders = detectSlowProviders({ pipeline, retrieval });
    const qualityIssues = detectQualityIssues(retrievalOps);

    // Build report
    const report: PerformanceReport = {
      timestamp: Date.now(),
      timestampFormatted: new Date().toISOString(),
      timeRange: timeRange || {
        start: 0,
        end: Date.now(),
        durationMs: Date.now(),
      },
      pipeline,
      retrieval,
      slowProviders,
      qualityIssues,
    };

    return { ok: true, value: report };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'METRICS_CALCULATION_FAILED',
        message: `Failed to calculate performance metrics: ${
          error instanceof Error ? error.message : String(error)
        }`,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}

/**
 * Get providers exceeding latency thresholds.
 *
 * Convenience function that extracts slow providers from performance report.
 *
 * @param thresholdMs - Optional custom threshold (uses defaults if not specified)
 * @returns Result with slow providers array or error
 */
export async function getSlowProviders(
  thresholdMs?: number
): Promise<Result<SlowProvider[], MetricsError>> {
  const metricsResult = await getPerformanceMetrics();
  if (!metricsResult.ok) {
    return metricsResult;
  }

  return { ok: true, value: metricsResult.value.slowProviders };
}

/**
 * Compare two providers across metrics.
 *
 * Useful for A/B testing and provider selection decisions.
 *
 * @param providerA - First provider name
 * @param providerB - Second provider name
 * @param timeRange - Optional time range filter
 * @returns Result with comparison report or error
 */
export async function compareProviders(
  providerA: string,
  providerB: string,
  timeRange?: TimeRange
): Promise<Result<ComparisonReport, MetricsError>> {
  const metricsResult = await getPerformanceMetrics(timeRange);
  if (!metricsResult.ok) {
    return metricsResult;
  }

  // Find provider A metrics
  // Search in all categories
  const allProviders = [
    ...Object.values(metricsResult.value.pipeline),
    metricsResult.value.retrieval.search,
  ] as ProviderMetrics[];

  const metricsA = allProviders.find((m) => m.providerName === providerA);
  const metricsB = allProviders.find((m) => m.providerName === providerB);

  if (!metricsA) {
    return {
      ok: false,
      error: {
        code: 'METRICS_PROVIDER_NOT_FOUND',
        message: `Provider '${providerA}' not found in metrics`,
      },
    };
  }

  if (!metricsB) {
    return {
      ok: false,
      error: {
        code: 'METRICS_PROVIDER_NOT_FOUND',
        message: `Provider '${providerB}' not found in metrics`,
      },
    };
  }

  // Calculate delta
  const avgLatencyDelta = metricsB.avgMs - metricsA.avgMs;
  const latencyPercentChange =
    ((metricsB.avgMs - metricsA.avgMs) / metricsA.avgMs) * 100;

  // Determine recommendation
  let recommendation: 'A' | 'B' | 'neutral';
  if (Math.abs(latencyPercentChange) < 5) {
    recommendation = 'neutral'; // Less than 5% difference
  } else if (metricsB.avgMs < metricsA.avgMs) {
    recommendation = 'B'; // B is faster
  } else {
    recommendation = 'A'; // A is faster
  }

  const report: ComparisonReport = {
    providerA,
    providerB,
    metricsA,
    metricsB,
    delta: {
      avgLatencyDelta,
      latencyPercentChange,
    },
    recommendation,
  };

  return { ok: true, value: report };
}

/**
 * Analyze performance trends over time.
 *
 * Compares current vs previous time window to detect regressions.
 *
 * @param timeRange - Time range to analyze
 * @returns Result with trend report or error
 */
export async function getTrends(
  timeRange: TimeRange
): Promise<Result<TrendReport, MetricsError>> {
  // Get current metrics
  const currentResult = await getPerformanceMetrics(timeRange);
  if (!currentResult.ok) {
    return currentResult;
  }

  // Get previous metrics (same duration, shifted back)
  const previousRange: TimeRange = {
    start: timeRange.start - timeRange.durationMs,
    end: timeRange.start,
    durationMs: timeRange.durationMs,
  };

  const previousResult = await getPerformanceMetrics(previousRange);
  if (!previousResult.ok) {
    return previousResult;
  }

  // Calculate trends for each provider
  const providerTrends: ProviderTrend[] = [];

  const currentProviders = [
    ...Object.values(currentResult.value.pipeline),
    currentResult.value.retrieval.search,
  ] as ProviderMetrics[];

  const previousProviders = [
    ...Object.values(previousResult.value.pipeline),
    previousResult.value.retrieval.search,
  ] as ProviderMetrics[];

  for (const current of currentProviders) {
    const previous = previousProviders.find(
      (p) => p.providerName === current.providerName
    );
    if (!previous || previous.operationCount === 0) continue;

    const percentChange =
      ((current.avgMs - previous.avgMs) / previous.avgMs) * 100;

    let direction: TrendDirection;
    if (Math.abs(percentChange) < 5) {
      direction = 'stable';
    } else if (percentChange < 0) {
      direction = 'improving'; // Lower latency = better
    } else {
      direction = 'degrading'; // Higher latency = worse
    }

    providerTrends.push({
      providerName: current.providerName,
      currentAvg: current.avgMs,
      previousAvg: previous.avgMs,
      percentChange,
      direction,
    });
  }

  // Identify bottlenecks (slowest providers)
  // Build provider-to-category map from current metrics
  const providerCategories = new Map<string, string>();
  providerCategories.set(currentResult.value.pipeline.segment.providerName, 'segment');
  providerCategories.set(currentResult.value.pipeline.extract.providerName, 'extract');
  providerCategories.set(currentResult.value.pipeline.summarize.providerName, 'summarize');
  providerCategories.set(currentResult.value.pipeline.storage.providerName, 'storage');
  providerCategories.set(currentResult.value.retrieval.search.providerName, 'search');

  const bottlenecks = currentProviders
    .filter((p) => p.operationCount > 0)
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 3)
    .map((p) => ({
      category: providerCategories.get(p.providerName) || 'unknown',
      providerName: p.providerName,
      avgMs: p.avgMs,
    }));

  // Detect regressions (>20% increase)
  const regressions = providerTrends
    .filter((t) => t.percentChange > 20)
    .map((t) => ({
      providerName: t.providerName,
      percentIncrease: t.percentChange,
    }));

  const report: TrendReport = {
    timestamp: Date.now(),
    timeRange,
    providerTrends,
    bottlenecks,
    regressions,
  };

  return { ok: true, value: report };
}
