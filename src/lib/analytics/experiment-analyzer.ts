/**
 * Experiment results aggregation and analysis (Story 5.4 Task 5)
 *
 * Aggregates experiment data from JSONL files and calculates statistics.
 * Provides comparative analysis for A/B testing decisions.
 */

import { join } from 'path';
import { homedir } from 'os';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import type { Result } from '../../types/common';
import type { ExperimentDataPoint } from '../logging/experiment-logger';

/**
 * Aggregated variant statistics
 */
export interface VariantStats {
  /** Total number of requests for this variant */
  count: number;

  /** Average latency in milliseconds */
  avgLatencyMs: number;

  /** Average number of results returned */
  avgResultCount: number;

  /** Average tokens injected */
  avgInjectedTokens: number;

  /** Number of failures */
  errorCount: number;

  /** Error rate (errorCount / count) */
  errorRate: number;

  /** Latency distribution */
  latencyDistribution: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
}

/**
 * Statistical comparison between two variants
 */
export interface VariantComparison {
  /** Whether latency difference is statistically significant */
  significantLatencyDifference: boolean;

  /** Which variant is faster (null if no significant difference) */
  fasterVariant: string | null;

  /** Latency improvement percentage (positive = treatment faster) */
  latencyImprovementPercent: number;

  /** P-value from t-test */
  pValue: number;
}

/**
 * Aggregated experiment results
 */
export interface ExperimentResults {
  /** Experiment identifier */
  experimentId: string;

  /** Unix timestamp when experiment started */
  startedAt: number;

  /** Unix timestamp when experiment stopped (undefined if still running) */
  stoppedAt?: number;

  /** Statistics for each variant */
  variants: Record<string, VariantStats>;

  /** Comparison between variants (only for 2-variant experiments) */
  comparison?: VariantComparison;
}

/**
 * Experiment analysis error
 */
export interface ExperimentAnalysisError {
  code:
    | 'EXPERIMENT_NOT_FOUND'
    | 'EXPERIMENT_DATA_READ_FAILED'
    | 'EXPERIMENT_DATA_PARSE_FAILED'
    | 'EXPERIMENT_NO_DATA'
    | 'EXPERIMENT_INVALID_DATA';
  message: string;
  cause?: Error;
}

/**
 * Get MemStore directory path
 */
function getMemstoreDir(): string {
  return process.env.MEMSTORE_DIR || join(homedir(), '.memstore');
}

/**
 * Get experiment data file path
 */
function getExperimentDataPath(experimentId: string): string {
  return join(
    getMemstoreDir(),
    'mem-store/metrics/experiments',
    `${experimentId}.jsonl`
  );
}

/**
 * Read experiment data from JSONL file
 *
 * @param experimentId - Experiment to read
 * @returns Array of data points or error
 */
async function readExperimentData(
  experimentId: string
): Promise<Result<ExperimentDataPoint[], ExperimentAnalysisError>> {
  const dataPath = getExperimentDataPath(experimentId);

  // Check if file exists
  if (!existsSync(dataPath)) {
    return {
      ok: false,
      error: {
        code: 'EXPERIMENT_NOT_FOUND',
        message: `No data found for experiment '${experimentId}'`,
      },
    };
  }

  try {
    // Read file contents
    const contents = await readFile(dataPath, 'utf-8');

    // Parse JSONL (one JSON object per line)
    const lines = contents.trim().split('\n').filter(line => line.length > 0);

    if (lines.length === 0) {
      return {
        ok: false,
        error: {
          code: 'EXPERIMENT_NO_DATA',
          message: `Experiment '${experimentId}' has no data points`,
        },
      };
    }

    const dataPoints: ExperimentDataPoint[] = [];
    for (let i = 0; i < lines.length; i++) {
      try {
        const point = JSON.parse(lines[i]) as ExperimentDataPoint;
        dataPoints.push(point);
      } catch (parseError) {
        return {
          ok: false,
          error: {
            code: 'EXPERIMENT_DATA_PARSE_FAILED',
            message: `Failed to parse line ${i + 1}: ${
              parseError instanceof Error ? parseError.message : String(parseError)
            }`,
            cause: parseError instanceof Error ? parseError : undefined,
          },
        };
      }
    }

    return { ok: true, value: dataPoints };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'EXPERIMENT_DATA_READ_FAILED',
        message: `Failed to read experiment data: ${
          error instanceof Error ? error.message : String(error)
        }`,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}

/**
 * Calculate mean of numbers
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Calculate percentile of sorted numbers
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];

  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

/**
 * Perform Welch's t-test for two independent samples
 *
 * Tests null hypothesis: means are equal
 * Returns p-value (lower = more significant)
 *
 * @param sample1 - First sample
 * @param sample2 - Second sample
 * @returns T-test result with p-value
 */
function welchTTest(
  sample1: number[],
  sample2: number[]
): { tStatistic: number; pValue: number } {
  const n1 = sample1.length;
  const n2 = sample2.length;

  if (n1 < 2 || n2 < 2) {
    return { tStatistic: 0, pValue: 1.0 }; // Not enough data
  }

  const mean1 = mean(sample1);
  const mean2 = mean(sample2);

  // Calculate variances
  const variance1 =
    sample1.reduce((sum, val) => sum + (val - mean1) ** 2, 0) / (n1 - 1);
  const variance2 =
    sample2.reduce((sum, val) => sum + (val - mean2) ** 2, 0) / (n2 - 1);

  // Welch's t-statistic
  const tStatistic =
    (mean1 - mean2) / Math.sqrt(variance1 / n1 + variance2 / n2);

  // Degrees of freedom (Welch-Satterthwaite equation)
  const numerator = (variance1 / n1 + variance2 / n2) ** 2;
  const denominator =
    (variance1 / n1) ** 2 / (n1 - 1) + (variance2 / n2) ** 2 / (n2 - 1);
  const df = numerator / denominator;

  // Approximate p-value using t-distribution
  // For simplicity, using normal approximation for df > 30
  // For small df, use conservative estimate
  let pValue: number;
  if (df > 30) {
    // Normal approximation
    pValue = 2 * (1 - normalCDF(Math.abs(tStatistic)));
  } else {
    // Conservative: use t-critical value of ~2.0 for df > 10
    // This is a simplification; proper t-distribution CDF would be better
    pValue = Math.abs(tStatistic) > 2.0 ? 0.05 : 0.5;
  }

  return { tStatistic, pValue };
}

/**
 * Normal cumulative distribution function approximation
 */
function normalCDF(z: number): number {
  // Abramowitz and Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const prob =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

  return z > 0 ? 1 - prob : prob;
}

/**
 * Calculate statistics for a variant
 */
function calculateVariantStats(
  dataPoints: ExperimentDataPoint[]
): VariantStats {
  if (dataPoints.length === 0) {
    return {
      count: 0,
      avgLatencyMs: 0,
      avgResultCount: 0,
      avgInjectedTokens: 0,
      errorCount: 0,
      errorRate: 0,
      latencyDistribution: { p50: 0, p90: 0, p95: 0, p99: 0 },
    };
  }

  // Story 6.4: Handle both new (totalLatencyMs) and old (latencyMs) schema
  const latencies = dataPoints.map(p => p.totalLatencyMs ?? p.latencyMs ?? 0);
  const sortedLatencies = latencies.slice().sort((a, b) => a - b);

  const errorCount = dataPoints.filter(p => !p.success).length;

  return {
    count: dataPoints.length,
    avgLatencyMs: mean(latencies),
    avgResultCount: mean(dataPoints.map(p => p.resultCount)),
    avgInjectedTokens: mean(dataPoints.map(p => p.injectedTokens)),
    errorCount,
    errorRate: errorCount / dataPoints.length,
    latencyDistribution: {
      p50: percentile(sortedLatencies, 50),
      p90: percentile(sortedLatencies, 90),
      p95: percentile(sortedLatencies, 95),
      p99: percentile(sortedLatencies, 99),
    },
  };
}

/**
 * Group data points by variant
 */
function groupByVariant(
  dataPoints: ExperimentDataPoint[]
): Record<string, ExperimentDataPoint[]> {
  const grouped: Record<string, ExperimentDataPoint[]> = {};

  for (const point of dataPoints) {
    if (!grouped[point.variant]) {
      grouped[point.variant] = [];
    }
    grouped[point.variant].push(point);
  }

  return grouped;
}

/**
 * Aggregate experiment data and calculate statistics
 *
 * Reads JSONL data file, groups by variant, and calculates:
 * - Count, averages (latency, results, tokens)
 * - Error count and rate
 * - Latency distribution (p50, p90, p95, p99)
 * - Statistical comparison (if 2 variants)
 *
 * @param experimentId - Experiment to analyze
 * @returns Aggregated results or error
 *
 * @example
 * ```typescript
 * const result = await aggregateExperimentData('search-comparison');
 *
 * if (result.ok) {
 *   const { variants, comparison } = result.value;
 *   console.log(`Control: ${variants.control.avgLatencyMs}ms`);
 *   console.log(`Treatment: ${variants.treatment.avgLatencyMs}ms`);
 *
 *   if (comparison?.significantLatencyDifference) {
 *     console.log(`Winner: ${comparison.fasterVariant}`);
 *   }
 * }
 * ```
 */
export async function aggregateExperimentData(
  experimentId: string
): Promise<Result<ExperimentResults, ExperimentAnalysisError>> {
  // Read data points
  const dataResult = await readExperimentData(experimentId);
  if (!dataResult.ok) {
    return dataResult;
  }

  const dataPoints = dataResult.value;

  // Group by variant
  const grouped = groupByVariant(dataPoints);
  const variantNames = Object.keys(grouped);

  // Calculate stats for each variant
  const variants: Record<string, VariantStats> = {};
  for (const variant of variantNames) {
    variants[variant] = calculateVariantStats(grouped[variant]);
  }

  // Calculate comparison if 2 variants
  let comparison: VariantComparison | undefined;
  if (variantNames.length === 2) {
    const [variant1, variant2] = variantNames;
    // Story 6.4: Handle both new (totalLatencyMs) and old (latencyMs) schema
    const latencies1 = grouped[variant1].map(p => p.totalLatencyMs ?? p.latencyMs ?? 0);
    const latencies2 = grouped[variant2].map(p => p.totalLatencyMs ?? p.latencyMs ?? 0);

    const testResult = welchTTest(latencies1, latencies2);
    const significant = testResult.pValue < 0.05;

    const mean1 = variants[variant1].avgLatencyMs;
    const mean2 = variants[variant2].avgLatencyMs;
    const fasterVariant = mean1 < mean2 ? variant1 : variant2;
    const slowerVariant = mean1 < mean2 ? variant2 : variant1;

    // Calculate improvement percentage (positive = treatment faster)
    const improvement =
      ((variants[slowerVariant].avgLatencyMs - variants[fasterVariant].avgLatencyMs) /
        variants[slowerVariant].avgLatencyMs) *
      100;

    comparison = {
      significantLatencyDifference: significant,
      fasterVariant: significant ? fasterVariant : null,
      latencyImprovementPercent: improvement,
      pValue: testResult.pValue,
    };
  }

  // Find start/stop times
  const timestamps = dataPoints.map(p => p.timestamp);
  const startedAt = Math.min(...timestamps);

  return {
    ok: true,
    value: {
      experimentId,
      startedAt,
      variants,
      comparison,
    },
  };
}

/**
 * Export format
 */
export type ExportFormat = 'json' | 'csv';

/**
 * Export experiment results to specified format
 *
 * @param experimentId - Experiment to export
 * @param format - Export format ('json' or 'csv')
 * @returns Formatted export string or error
 *
 * @example
 * ```typescript
 * const result = await exportExperimentResults('search-comparison', 'csv');
 *
 * if (result.ok) {
 *   await writeFile('results.csv', result.value);
 * }
 * ```
 */
export async function exportExperimentResults(
  experimentId: string,
  format: ExportFormat
): Promise<Result<string, ExperimentAnalysisError>> {
  // Read data points
  const dataResult = await readExperimentData(experimentId);
  if (!dataResult.ok) {
    return dataResult;
  }

  const dataPoints = dataResult.value;

  if (format === 'json') {
    // Export as JSON array
    return {
      ok: true,
      value: JSON.stringify(dataPoints, null, 2),
    };
  } else if (format === 'csv') {
    // Export as CSV
    const headers = [
      'experimentId',
      'variant',
      'timestamp',
      'latencyMs',
      'resultCount',
      'injectedTokens',
      'queryHash',
      'success',
      'errorCode',
    ];

    const rows = dataPoints.map(p => [
      p.experimentId,
      p.variant,
      p.timestamp.toString(),
      // Story 6.4: Handle both new (totalLatencyMs) and old (latencyMs) schema
      (p.totalLatencyMs ?? p.latencyMs ?? 0).toString(),
      p.resultCount.toString(),
      p.injectedTokens.toString(),
      p.queryHash,
      p.success.toString(),
      p.errorCode || '',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(field => `"${field}"`).join(',')),
    ].join('\n');

    return { ok: true, value: csv };
  }

  return {
    ok: false,
    error: {
      code: 'EXPERIMENT_INVALID_DATA',
      message: `Unsupported export format: ${format}`,
    },
  };
}
