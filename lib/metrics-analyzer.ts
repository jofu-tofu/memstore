#!/usr/bin/env bun

/**
 * Metrics Analyzer CLI - Story 6.4
 *
 * Command-line tool for querying performance metrics.
 *
 * Usage:
 *   bun run metrics-analyzer.ts metrics              # Show full performance report
 *   bun run metrics-analyzer.ts slow                 # List slow providers
 *   bun run metrics-analyzer.ts compare A B          # Compare two providers
 *   bun run metrics-analyzer.ts trends --days 7      # Show 7-day trends
 *
 * @module metrics-analyzer
 */

import {
  getPerformanceMetrics,
  getSlowProviders,
  compareProviders,
  getTrends,
} from './performance-metrics';
import type { TimeRange } from '../types/performance';

/**
 * Format milliseconds for display.
 */
function formatMs(ms: number): string {
  return `${Math.round(ms)}ms`;
}

/**
 * Format percentage for display.
 */
function formatPercent(percent: number): string {
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent.toFixed(1)}%`;
}

/**
 * Display full performance metrics report.
 */
async function showMetricsCommand() {
  console.log('📊 Performance Metrics Report\n');

  const result = await getPerformanceMetrics();

  if (!result.ok) {
    console.error(`❌ Error: ${result.error.message}`);
    process.exit(1);
  }

  const report = result.value;

  console.log(`Generated: ${report.timestampFormatted}`);
  console.log(
    `Time Range: ${new Date(report.timeRange.start).toISOString()} to ${new Date(report.timeRange.end).toISOString()}\n`
  );

  // Capture Pipeline
  console.log('🔄 Capture Pipeline');
  console.log('─'.repeat(80));
  console.log(
    `Segment     (${report.pipeline.segment.providerName.padEnd(18)}): avg ${formatMs(report.pipeline.segment.avgMs).padEnd(6)} p95 ${formatMs(report.pipeline.segment.p95Ms).padEnd(6)} (${report.pipeline.segment.operationCount} ops)`
  );
  console.log(
    `Extract     (${report.pipeline.extract.providerName.padEnd(18)}): avg ${formatMs(report.pipeline.extract.avgMs).padEnd(6)} p95 ${formatMs(report.pipeline.extract.p95Ms).padEnd(6)} (${report.pipeline.extract.operationCount} ops)`
  );
  console.log(
    `Summarize   (${report.pipeline.summarize.providerName.padEnd(18)}): avg ${formatMs(report.pipeline.summarize.avgMs).padEnd(6)} p95 ${formatMs(report.pipeline.summarize.p95Ms).padEnd(6)} (${report.pipeline.summarize.operationCount} ops)`
  );
  console.log(
    `Storage     (${report.pipeline.storage.providerName.padEnd(18)}): avg ${formatMs(report.pipeline.storage.avgMs).padEnd(6)} p95 ${formatMs(report.pipeline.storage.p95Ms).padEnd(6)} (${report.pipeline.storage.operationCount} ops)`
  );
  console.log();

  // Retrieval Pipeline
  console.log('🔍 Retrieval Pipeline');
  console.log('─'.repeat(80));
  console.log(
    `Search      (${report.retrieval.search.providerName.padEnd(18)}): avg ${formatMs(report.retrieval.search.avgMs).padEnd(6)} p95 ${formatMs(report.retrieval.search.p95Ms).padEnd(6)} (${report.retrieval.search.operationCount} ops)`
  );
  console.log(
    `Filter      ${' '.repeat(20)}: avg ${formatMs(report.retrieval.filter.avgMs).padEnd(6)} p95 ${formatMs(report.retrieval.filter.p95Ms).padEnd(6)} (${report.retrieval.filter.operationCount} ops)`
  );
  console.log(
    `Rank        ${' '.repeat(20)}: avg ${formatMs(report.retrieval.rank.avgMs).padEnd(6)} p95 ${formatMs(report.retrieval.rank.p95Ms).padEnd(6)} (${report.retrieval.rank.operationCount} ops)`
  );
  console.log(
    `Inject      ${' '.repeat(20)}: avg ${formatMs(report.retrieval.inject.avgMs).padEnd(6)} p95 ${formatMs(report.retrieval.inject.p95Ms).padEnd(6)} (${report.retrieval.inject.operationCount} ops)`
  );
  console.log();

  // Slow Providers
  if (report.slowProviders.length > 0) {
    console.log('🐌 Slow Providers (Exceeding Thresholds)');
    console.log('─'.repeat(80));
    for (const slow of report.slowProviders) {
      const icon = slow.severity === 'error' ? '🔴' : '⚠️';
      console.log(
        `${icon} ${slow.category.padEnd(10)} ${slow.providerName.padEnd(20)} ${formatMs(slow.avgMs).padEnd(8)} > ${formatMs(slow.threshold)} (${formatPercent(slow.exceedancePercent)} over)`
      );
    }
    console.log();
  }

  // Quality Issues
  if (report.qualityIssues.length > 0) {
    console.log('⚠️ Quality Issues');
    console.log('─'.repeat(80));
    for (const issue of report.qualityIssues) {
      console.log(
        `${issue.category.padEnd(10)} ${issue.providerName.padEnd(20)} ${issue.successRate.toFixed(1)}% success rate (< ${issue.threshold}%)`
      );
      console.log(`   ${issue.reason}`);
    }
    console.log();
  }

  if (
    report.slowProviders.length === 0 &&
    report.qualityIssues.length === 0
  ) {
    console.log('✅ No performance issues detected!\n');
  }
}

/**
 * Display slow providers.
 */
async function showSlowCommand() {
  console.log('🐌 Slow Providers\n');

  const result = await getSlowProviders();

  if (!result.ok) {
    console.error(`❌ Error: ${result.error.message}`);
    process.exit(1);
  }

  const slow = result.value;

  if (slow.length === 0) {
    console.log('✅ No slow providers detected!\n');
    return;
  }

  console.log('─'.repeat(80));
  for (const provider of slow) {
    const icon = provider.severity === 'error' ? '🔴' : '⚠️';
    console.log(
      `${icon} ${provider.category.padEnd(10)} ${provider.providerName.padEnd(20)}`
    );
    console.log(
      `   Avg: ${formatMs(provider.avgMs)} (threshold: ${formatMs(provider.threshold)})`
    );
    console.log(
      `   Exceedance: ${formatPercent(provider.exceedancePercent)}`
    );
  }
  console.log();
}

/**
 * Compare two providers.
 */
async function showCompareCommand(providerA: string, providerB: string) {
  console.log(`📊 Provider Comparison: ${providerA} vs ${providerB}\n`);

  const result = await compareProviders(providerA, providerB);

  if (!result.ok) {
    console.error(`❌ Error: ${result.error.message}`);
    process.exit(1);
  }

  const comparison = result.value;

  console.log(`Provider A: ${comparison.providerA}`);
  console.log(`  Operations: ${comparison.metricsA.operationCount}`);
  console.log(`  Avg:        ${formatMs(comparison.metricsA.avgMs)}`);
  console.log(`  P95:        ${formatMs(comparison.metricsA.p95Ms)}`);
  console.log(`  P99:        ${formatMs(comparison.metricsA.p99Ms)}`);
  console.log();

  console.log(`Provider B: ${comparison.providerB}`);
  console.log(`  Operations: ${comparison.metricsB.operationCount}`);
  console.log(`  Avg:        ${formatMs(comparison.metricsB.avgMs)}`);
  console.log(`  P95:        ${formatMs(comparison.metricsB.p95Ms)}`);
  console.log(`  P99:        ${formatMs(comparison.metricsB.p99Ms)}`);
  console.log();

  console.log('Delta:');
  console.log(
    `  Avg Latency: ${formatMs(Math.abs(comparison.delta.avgLatencyDelta))} ${comparison.delta.avgLatencyDelta < 0 ? 'faster' : 'slower'} (${formatPercent(comparison.delta.latencyPercentChange)})`
  );
  console.log();

  console.log(`Recommendation: ${comparison.recommendation === 'neutral' ? 'No significant difference' : `Use Provider ${comparison.recommendation}`}`);
  console.log();
}

/**
 * Show performance trends.
 */
async function showTrendsCommand(days: number = 7) {
  console.log(`📈 Performance Trends (Last ${days} days)\n`);

  const now = Date.now();
  const durationMs = days * 24 * 60 * 60 * 1000;
  const timeRange: TimeRange = {
    start: now - durationMs,
    end: now,
    durationMs,
  };

  const result = await getTrends(timeRange);

  if (!result.ok) {
    console.error(`❌ Error: ${result.error.message}`);
    process.exit(1);
  }

  const trends = result.value;

  // Provider Trends
  if (trends.providerTrends.length > 0) {
    console.log('Provider Performance Trends');
    console.log('─'.repeat(80));
    for (const trend of trends.providerTrends) {
      let icon = '→';
      if (trend.direction === 'improving') icon = '📈';
      if (trend.direction === 'degrading') icon = '📉';

      console.log(
        `${icon} ${trend.providerName.padEnd(20)} ${formatPercent(trend.percentChange).padEnd(8)} (${formatMs(trend.previousAvg)} → ${formatMs(trend.currentAvg)})`
      );
    }
    console.log();
  }

  // Bottlenecks
  if (trends.bottlenecks.length > 0) {
    console.log('🔴 Bottlenecks (Slowest Providers)');
    console.log('─'.repeat(80));
    for (const bottleneck of trends.bottlenecks) {
      console.log(
        `   ${bottleneck.providerName.padEnd(20)} ${formatMs(bottleneck.avgMs)}`
      );
    }
    console.log();
  }

  // Regressions
  if (trends.regressions.length > 0) {
    console.log('⚠️ Performance Regressions (>20% slower)');
    console.log('─'.repeat(80));
    for (const regression of trends.regressions) {
      console.log(
        `   ${regression.providerName.padEnd(20)} ${formatPercent(regression.percentIncrease)} slower`
      );
    }
    console.log();
  }

  if (
    trends.providerTrends.length === 0 &&
    trends.bottlenecks.length === 0 &&
    trends.regressions.length === 0
  ) {
    console.log('ℹ️ Not enough data for trend analysis.\n');
  }
}

/**
 * Display help message.
 */
function showHelp() {
  console.log(`
📊 Memory System Metrics Analyzer

USAGE:
  bun run metrics-analyzer.ts <command> [options]

COMMANDS:
  metrics              Show full performance metrics report
  slow                 List providers exceeding latency thresholds
  compare <A> <B>      Compare two providers
  trends [--days N]    Show performance trends (default: 7 days)
  help                 Show this help message

EXAMPLES:
  bun run metrics-analyzer.ts metrics
  bun run metrics-analyzer.ts slow
  bun run metrics-analyzer.ts compare keyword-search semantic-search
  bun run metrics-analyzer.ts trends --days 30

OPTIONS:
  --days N             Number of days for trend analysis (default: 7)
`);
}

/**
 * Main CLI entry point.
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help') {
    showHelp();
    return;
  }

  const command = args[0];

  try {
    switch (command) {
      case 'metrics':
        await showMetricsCommand();
        break;

      case 'slow':
        await showSlowCommand();
        break;

      case 'compare':
        if (args.length < 3) {
          console.error('❌ Error: compare command requires two provider names');
          console.error('Usage: bun run metrics-analyzer.ts compare <providerA> <providerB>');
          process.exit(1);
        }
        await showCompareCommand(args[1], args[2]);
        break;

      case 'trends':
        let days = 7;
        const daysIndex = args.indexOf('--days');
        if (daysIndex !== -1 && args[daysIndex + 1]) {
          days = parseInt(args[daysIndex + 1], 10);
          if (isNaN(days) || days <= 0) {
            console.error('❌ Error: --days must be a positive number');
            process.exit(1);
          }
        }
        await showTrendsCommand(days);
        break;

      default:
        console.error(`❌ Unknown command: ${command}`);
        console.error('Run "bun run metrics-analyzer.ts help" for usage information');
        process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Run CLI if executed directly
if (import.meta.main) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
