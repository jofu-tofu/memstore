/**
 * Insights Query Engine - Story 6.5
 *
 * Provides queryable insights for actionable performance intelligence.
 *
 * Features:
 * - Top segments by access count
 * - Stale segment detection
 * - Slow provider identification (Story 6.4 integration)
 * - Retrieval success rate analysis
 * - Provider comparison (Story 6.4 integration)
 * - Comprehensive system health summary
 *
 * @module insights
 */

import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import { readdir, stat } from 'node:fs/promises';
import type { Result } from '../types/common';
import type {
  SegmentInsight,
  SuccessRateMetrics,
  InsightsSummary,
  SystemStats,
  Issue,
  ProviderQuality,
  InsightsError,
} from '../types/insights';
import type { TimeRange, SlowProvider, ComparisonReport } from '../types/performance';
import {
  getSlowProviders,
  compareProviders,
} from './performance-metrics';
import type {
  CaptureOperationMetadata,
  RetrievalOperationMetadata,
} from './operations-logger';

/**
 * Get the PAI directory path.
 *
 * @returns Absolute path to PAI directory
 */
function getPaiDir(): string {
  return process.env.PAI_DIR || join(homedir(), 'pai');
}

/**
 * Parse frontmatter from segment markdown content.
 *
 * Simple parser - extracts YAML frontmatter between --- markers.
 *
 * @param content - Markdown file content
 * @returns Parsed frontmatter object
 */
function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const lines = content.split('\n');

  if (lines[0] !== '---') {
    return { frontmatter: {}, body: content };
  }

  const endIndex = lines.slice(1).indexOf('---');
  if (endIndex === -1) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterLines = lines.slice(1, endIndex + 1);
  const body = lines.slice(endIndex + 2).join('\n');

  const frontmatter: Record<string, unknown> = {};

  for (const line of frontmatterLines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value: unknown = line.slice(colonIndex + 1).trim();

    // Parse arrays
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      try {
        value = JSON.parse(value);
      } catch {
        // Keep as string if parse fails
      }
    }

    // Parse numbers
    if (typeof value === 'string' && !isNaN(Number(value))) {
      value = Number(value);
    }

    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

/**
 * Extract title from segment content.
 *
 * Tries to find first heading or first line of content.
 *
 * @param content - Segment markdown content
 * @returns Extracted title or empty string
 */
function extractTitle(content: string): string {
  const lines = content.split('\n');

  // Skip frontmatter
  let startIndex = 0;
  if (lines[0] === '---') {
    const endIndex = lines.slice(1).indexOf('---');
    if (endIndex !== -1) {
      startIndex = endIndex + 2;
    }
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Heading
    if (line.startsWith('#')) {
      return line.replace(/^#+\s*/, '').trim();
    }

    // First non-empty line
    return line.substring(0, 60);
  }

  return '';
}

/**
 * Load all segment metadata from filesystem.
 *
 * Reads segment frontmatter from all YYYY-MM directories.
 *
 * @returns Array of segment insights
 */
async function loadAllSegmentMetadata(): Promise<SegmentInsight[]> {
  const paiDir = getPaiDir();
  const segmentsPath = join(paiDir, 'mem-store', 'segments');

  const allSegments: SegmentInsight[] = [];

  try {
    if (!existsSync(segmentsPath)) {
      return [];
    }

    const months = await readdir(segmentsPath);

    for (const month of months) {
      const monthPath = join(segmentsPath, month);
      const monthStat = await stat(monthPath);
      if (!monthStat.isDirectory()) continue;

      const files = await readdir(monthPath);

      for (const file of files) {
        if (!file.endsWith('.md')) continue;

        try {
          const filePath = join(monthPath, file);
          const content = await Bun.file(filePath).text();
          const { frontmatter } = parseFrontmatter(content);

          allSegments.push({
            id: (frontmatter.id as string) || file.replace('.md', ''),
            sessionId: (frontmatter.session_id as string) || '',
            accessCount: (frontmatter.access_count as number) || 0,
            lastAccessed: (frontmatter.last_accessed as number) || null,
            tags: (frontmatter.tags as string[]) || [],
            title: extractTitle(content),
            provider: (frontmatter.provider as string) || 'unknown',
          });
        } catch (error) {
          console.error(
            `[Memory:Insights] Failed to parse segment ${file}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }
  } catch (error) {
    console.error(
      `[Memory:Insights] Failed to load segment metadata: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return allSegments;
}

/**
 * Load operations from operations.jsonl.
 *
 * Reads and parses JSONL file line by line.
 *
 * @returns Array of operations (capture + retrieval)
 */
async function loadOperations(): Promise<
  Array<CaptureOperationMetadata | RetrievalOperationMetadata>
> {
  const paiDir = getPaiDir();
  const operationsPath = join(paiDir, 'mem-store', 'metrics', 'operations.jsonl');

  try {
    if (!existsSync(operationsPath)) {
      return [];
    }

    const file = Bun.file(operationsPath);
    const content = await file.text();
    const lines = content.split('\n').filter((l) => l.trim());

    const operations: Array<CaptureOperationMetadata | RetrievalOperationMetadata> = [];

    for (const line of lines) {
      try {
        const op = JSON.parse(line);
        operations.push(op);
      } catch (error) {
        console.error(
          `[Memory:Insights] Failed to parse operation line: ${line.substring(0, 50)}...`
        );
      }
    }

    return operations;
  } catch (error) {
    console.error(
      `[Memory:Insights] Failed to load operations: ${error instanceof Error ? error.message : String(error)}`
    );
    return [];
  }
}

/**
 * Calculate total storage size of segments.
 *
 * Sums up file sizes across all YYYY-MM directories.
 *
 * @returns Total bytes
 */
async function calculateStorageSize(): Promise<number> {
  const paiDir = getPaiDir();
  const segmentsPath = join(paiDir, 'mem-store', 'segments');

  let totalBytes = 0;

  try {
    if (!existsSync(segmentsPath)) {
      return 0;
    }

    const months = await readdir(segmentsPath);

    for (const month of months) {
      const monthPath = join(segmentsPath, month);
      const monthStat = await stat(monthPath);
      if (!monthStat.isDirectory()) continue;

      const files = await readdir(monthPath);

      for (const file of files) {
        if (!file.endsWith('.md')) continue;

        const filePath = join(monthPath, file);
        const fileStat = await stat(filePath);
        totalBytes += fileStat.size;
      }
    }
  } catch (error) {
    console.error(
      `[Memory:Insights] Failed to calculate storage size: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return totalBytes;
}

/**
 * Count total sessions from session registry.
 *
 * @returns Number of sessions
 */
async function countTotalSessions(): Promise<number> {
  const paiDir = getPaiDir();
  const registryPath = join(paiDir, 'mem-store', 'structured', 'session-registry.json');

  try {
    if (!existsSync(registryPath)) {
      return 0;
    }

    const file = Bun.file(registryPath);
    const content = await file.text();
    const registry = JSON.parse(content);

    return Object.keys(registry).length;
  } catch (error) {
    console.error(
      `[Memory:Insights] Failed to count sessions: ${error instanceof Error ? error.message : String(error)}`
    );
    return 0;
  }
}

/**
 * Get oldest and newest segment dates.
 *
 * @param segments - Array of segment insights
 * @returns Object with oldest and newest dates
 */
function getSegmentDateRange(segments: SegmentInsight[]): {
  oldest: string;
  newest: string;
} {
  if (segments.length === 0) {
    return { oldest: 'N/A', newest: 'N/A' };
  }

  const timestamps = segments
    .map((s) => {
      const match = s.id.match(/seg_(\d+)_/);
      return match ? parseInt(match[1]) : 0;
    })
    .filter((t) => t > 0);

  if (timestamps.length === 0) {
    return { oldest: 'N/A', newest: 'N/A' };
  }

  const oldest = Math.min(...timestamps);
  const newest = Math.max(...timestamps);

  return {
    oldest: new Date(oldest).toISOString().split('T')[0],
    newest: new Date(newest).toISOString().split('T')[0],
  };
}

/**
 * Get top N segments by access count.
 *
 * Sorts segments by accessCount descending, with lastAccessed as tiebreaker.
 *
 * @param limit - Maximum number of segments to return
 * @returns Result containing top segments
 */
export async function topSegments(
  limit: number = 10
): Promise<Result<SegmentInsight[], InsightsError>> {
  try {
    const segments = await loadAllSegmentMetadata();

    // Sort by accessCount descending, then by lastAccessed descending
    segments.sort((a, b) => {
      if (b.accessCount !== a.accessCount) {
        return b.accessCount - a.accessCount;
      }
      // Tie-break: newer first
      const aTime = a.lastAccessed || 0;
      const bTime = b.lastAccessed || 0;
      return bTime - aTime;
    });

    return { ok: true, value: segments.slice(0, limit) };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'INSIGHTS_TOP_SEGMENTS_FAILED',
        message: `Failed to query top segments: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}

/**
 * Get stale segments not accessed in N days.
 *
 * Identifies segments with accessCount=0 or lastAccessed > N days ago.
 *
 * @param daysUnused - Threshold in days
 * @returns Result containing stale segments
 */
export async function staleSegments(
  daysUnused: number = 90
): Promise<Result<SegmentInsight[], InsightsError>> {
  try {
    const segments = await loadAllSegmentMetadata();
    const now = Date.now();
    const threshold = now - daysUnused * 24 * 60 * 60 * 1000;

    const stale = segments.filter((segment) => {
      // Never accessed
      if (segment.accessCount === 0) return true;

      // Not accessed recently
      if (segment.lastAccessed && segment.lastAccessed < threshold) return true;

      return false;
    });

    return { ok: true, value: stale };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'INSIGHTS_STALE_SEGMENTS_FAILED',
        message: `Failed to query stale segments: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}

/**
 * Get slow providers (integration with Story 6.4).
 *
 * Delegates to performance-metrics module.
 *
 * @param thresholdMs - Optional latency threshold override
 * @returns Result containing slow providers
 */
export async function slowProviders(
  thresholdMs?: number
): Promise<Result<SlowProvider[], InsightsError>> {
  try {
    const result = await getSlowProviders(thresholdMs);

    if (!result.ok) {
      return {
        ok: false,
        error: {
          code: 'INSIGHTS_SLOW_PROVIDERS_FAILED',
          message: `Failed to get slow providers: ${result.error.message}`,
          cause: result.error.cause,
        },
      };
    }

    return result;
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'INSIGHTS_SLOW_PROVIDERS_FAILED',
        message: `Failed to query slow providers: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}

/**
 * Get retrieval success rate for last N days.
 *
 * Analyzes operations.jsonl to calculate success metrics.
 *
 * @param days - Number of days to analyze
 * @returns Result containing success rate metrics
 */
export async function retrievalSuccessRate(
  days: number = 30
): Promise<Result<SuccessRateMetrics, InsightsError>> {
  try {
    const operations = await loadOperations();
    const now = Date.now();
    const startTime = now - days * 24 * 60 * 60 * 1000;

    // Filter to retrieval operations in time range
    const retrievalOps = operations.filter((op): op is RetrievalOperationMetadata => {
      return 'success' in op && op.timestamp >= startTime;
    });

    if (retrievalOps.length === 0) {
      return {
        ok: true,
        value: {
          timeRange: { start: startTime, end: now, durationMs: now - startTime, days },
          totalQueries: 0,
          successfulQueries: 0,
          failedQueries: 0,
          successRate: 0,
          avgLatencyMs: 0,
          avgResults: 0,
          avgTokensInjected: 0,
        },
      };
    }

    const successful = retrievalOps.filter((op) => op.success);
    const successRate = (successful.length / retrievalOps.length) * 100;

    const totalLatency = retrievalOps.reduce((sum, op) => {
      const latency = op.totalLatencyMs || (op as { latencyMs?: number }).latencyMs || 0;
      return sum + latency;
    }, 0);
    const avgLatency = totalLatency / retrievalOps.length;

    const avgResults =
      retrievalOps.reduce((sum, op) => sum + op.resultsReturned, 0) / retrievalOps.length;
    const avgTokens =
      retrievalOps.reduce((sum, op) => sum + op.tokensInjected, 0) / retrievalOps.length;

    return {
      ok: true,
      value: {
        timeRange: { start: startTime, end: now, durationMs: now - startTime, days },
        totalQueries: retrievalOps.length,
        successfulQueries: successful.length,
        failedQueries: retrievalOps.length - successful.length,
        successRate,
        avgLatencyMs: avgLatency,
        avgResults: avgResults,
        avgTokensInjected: avgTokens,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'INSIGHTS_SUCCESS_RATE_FAILED',
        message: `Failed to calculate success rate: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}

/**
 * Provider comparison (integration with Story 6.4).
 *
 * Delegates to performance-metrics module.
 *
 * @param providerA - First provider name
 * @param providerB - Second provider name
 * @param timeRange - Optional time range filter
 * @returns Result containing comparison report
 */
export async function providerComparison(
  providerA: string,
  providerB: string,
  timeRange?: TimeRange
): Promise<Result<ComparisonReport, InsightsError>> {
  try {
    const result = await compareProviders(providerA, providerB, timeRange);

    if (!result.ok) {
      return {
        ok: false,
        error: {
          code: 'INSIGHTS_COMPARISON_FAILED',
          message: `Failed to compare providers: ${result.error.message}`,
          cause: result.error.cause,
        },
      };
    }

    return result;
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'INSIGHTS_COMPARISON_FAILED',
        message: `Failed to compare providers: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}

/**
 * Analyze provider quality across usage, success, and performance.
 *
 * Calculates composite quality score for each provider based on:
 * - Usage (40%): Average access count of segments created by provider
 * - Success (30%): Success rate of operations using provider
 * - Performance (30%): Latency score (lower is better)
 *
 * @returns Result containing provider quality analysis
 */
export async function analyzeProviderQuality(): Promise<
  Result<ProviderQuality[], InsightsError>
> {
  try {
    const segments = await loadAllSegmentMetadata();
    const operations = await loadOperations();

    // Group segments by provider
    const providerSegments = new Map<string, SegmentInsight[]>();
    for (const segment of segments) {
      const provider = segment.provider || 'unknown';
      if (!providerSegments.has(provider)) {
        providerSegments.set(provider, []);
      }
      providerSegments.get(provider)!.push(segment);
    }

    const qualityReports: ProviderQuality[] = [];

    for (const [providerName, providerSegs] of providerSegments) {
      // Calculate average access count
      const totalAccess = providerSegs.reduce((sum, s) => sum + s.accessCount, 0);
      const avgAccessCount = providerSegs.length > 0 ? totalAccess / providerSegs.length : 0;

      // Calculate success rate (from operations)
      const providerOps = operations.filter((op): op is RetrievalOperationMetadata => {
        if (!('layerTiming' in op)) return false;
        const timing = op.layerTiming as { search?: { provider?: string } };
        return timing.search?.provider === providerName;
      });

      const successRate =
        providerOps.length > 0
          ? (providerOps.filter((op) => op.success).length / providerOps.length) * 100
          : 100;

      // Calculate average latency
      let avgLatencyMs = 0;
      if (providerOps.length > 0) {
        const totalLatency = providerOps.reduce((sum, op) => {
          const timing = op.layerTiming as { search?: { latencyMs?: number } };
          return sum + (timing.search?.latencyMs || 0);
        }, 0);
        avgLatencyMs = totalLatency / providerOps.length;
      }

      // Calculate composite quality score
      const usageScore = Math.min(100, avgAccessCount * 5); // 20 accesses = 100
      const latencyScore = Math.max(0, 100 - avgLatencyMs / 10); // 1000ms = 0, 0ms = 100

      const qualityScore =
        usageScore * 0.4 + // 40% weight
        successRate * 0.3 + // 30% weight
        latencyScore * 0.3; // 30% weight

      // Determine category (heuristic based on provider name)
      let category: ProviderQuality['category'] = 'search';
      if (providerName.includes('segment')) category = 'segment';
      else if (providerName.includes('extract')) category = 'extract';
      else if (providerName.includes('summarize') || providerName.includes('summary'))
        category = 'summarize';
      else if (providerName.includes('storage') || providerName.includes('backend'))
        category = 'storage';

      qualityReports.push({
        category,
        providerName,
        segmentsCreated: providerSegs.length,
        avgAccessCount,
        successRate,
        avgLatencyMs,
        qualityScore: Math.round(qualityScore),
      });
    }

    // Sort by quality score descending
    qualityReports.sort((a, b) => b.qualityScore - a.qualityScore);

    return { ok: true, value: qualityReports };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'INSIGHTS_PROVIDER_QUALITY_FAILED',
        message: `Failed to analyze provider quality: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}

/**
 * Generate comprehensive insights summary.
 *
 * Aggregates all insights data for complete system health overview.
 *
 * @param days - Number of days for retrieval stats (default 30)
 * @returns Result containing insights summary
 */
export async function getInsightsSummary(
  days: number = 30
): Promise<Result<InsightsSummary, InsightsError>> {
  try {
    // Load all data sources
    const segments = await loadAllSegmentMetadata();

    // Calculate system stats
    const storageBytes = await calculateStorageSize();
    const dateRange = getSegmentDateRange(segments);

    const systemStats: SystemStats = {
      totalSessions: await countTotalSessions(),
      totalSegments: segments.length,
      storageUsedBytes: storageBytes,
      storageUsedMB: `${(storageBytes / 1024 / 1024).toFixed(2)} MB`,
      oldestSegmentDate: dateRange.oldest,
      newestSegmentDate: dateRange.newest,
    };

    // Calculate retrieval stats
    const successRateResult = await retrievalSuccessRate(days);
    const retrievalStats = successRateResult.ok
      ? successRateResult.value
      : {
          timeRange: {
            start: Date.now() - days * 24 * 60 * 60 * 1000,
            end: Date.now(),
            durationMs: days * 24 * 60 * 60 * 1000,
            days,
          },
          totalQueries: 0,
          successfulQueries: 0,
          failedQueries: 0,
          successRate: 0,
          avgLatencyMs: 0,
          avgResults: 0,
          avgTokensInjected: 0,
        };

    // Get top segments
    const topSegmentsResult = await topSegments(5);
    const topSegs = topSegmentsResult.ok ? topSegmentsResult.value : [];

    // Detect issues
    const issues: Issue[] = [];

    // Issue: Stale segments
    const staleResult = await staleSegments(90);
    if (staleResult.ok && staleResult.value.length > 0) {
      issues.push({
        severity: 'warning',
        category: 'stale-segments',
        message: `${staleResult.value.length} segments never accessed or not accessed in 90+ days`,
        count: staleResult.value.length,
      });
    }

    // Issue: Slow providers
    const slowProvidersResult = await slowProviders();
    if (slowProvidersResult.ok && slowProvidersResult.value.length > 0) {
      slowProvidersResult.value.forEach((slow) => {
        issues.push({
          severity: slow.severity === 'error' ? 'error' : 'warning',
          category: 'slow-provider',
          message: `${slow.category} provider ${slow.providerName} avg ${slow.avgMs}ms > threshold ${slow.threshold}ms`,
        });
      });
    }

    // Issue: Low success rate
    if (retrievalStats.successRate < 70 && retrievalStats.totalQueries > 0) {
      issues.push({
        severity: 'error',
        category: 'low-success-rate',
        message: `${retrievalStats.successRate.toFixed(1)}% success rate (< 70% threshold)`,
      });
    }

    // Issue: Zero results
    if (retrievalStats.failedQueries > 0) {
      const zeroResultsPercent = (retrievalStats.failedQueries / retrievalStats.totalQueries) * 100;
      if (zeroResultsPercent > 10) {
        issues.push({
          severity: 'warning',
          category: 'zero-results',
          message: `${zeroResultsPercent.toFixed(1)}% of queries return zero results`,
          count: retrievalStats.failedQueries,
        });
      }
    }

    const summary: InsightsSummary = {
      timestamp: Date.now(),
      timestampFormatted: new Date().toISOString(),
      systemStats,
      retrievalStats,
      topSegments: topSegs,
      potentialIssues: issues,
    };

    return { ok: true, value: summary };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'INSIGHTS_SUMMARY_FAILED',
        message: `Failed to generate insights summary: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}
