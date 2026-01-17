/**
 * Insights CLI - Command-line interface for insights queries
 *
 * @module insights-cli
 */

import { join } from 'path';
import { homedir } from 'os';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'fs';
import {
  getInsightsSummary,
  topSegments,
  staleSegments,
  slowProviders,
  analyzeProviderQuality,
  providerComparison,
} from './insights';

/**
 * Format insights summary as human-readable text.
 *
 * @param summary - Insights summary object
 * @returns Formatted string
 */
function formatInsightsSummary(summary: Awaited<ReturnType<typeof getInsightsSummary>>['value']): string {
  if (!summary) return '';

  const lines: string[] = [];

  lines.push('=== PAI Memory System Insights ===');
  lines.push(`Generated: ${summary.timestampFormatted}`);
  lines.push('');

  // System stats
  lines.push(`Total Sessions: ${summary.systemStats.totalSessions}`);
  lines.push(`Total Segments: ${summary.systemStats.totalSegments}`);
  lines.push(`Storage Used: ${summary.systemStats.storageUsedMB}`);
  lines.push(`Date Range: ${summary.systemStats.oldestSegmentDate} to ${summary.systemStats.newestSegmentDate}`);
  lines.push('');

  // Retrieval stats
  const rs = summary.retrievalStats;
  lines.push(`Retrieval Stats (${rs.timeRange.days} days):`);
  lines.push(`- Total Queries: ${rs.totalQueries}`);
  lines.push(`- Success Rate: ${rs.successRate.toFixed(1)}%`);
  lines.push(`- Avg Latency: ${rs.avgLatencyMs.toFixed(0)}ms`);
  lines.push(`- Avg Results: ${rs.avgResults.toFixed(1)}`);
  lines.push(`- Avg Tokens Injected: ${rs.avgTokensInjected.toFixed(0)}`);
  lines.push('');

  // Top segments
  if (summary.topSegments.length > 0) {
    lines.push('Top Performing Segments:');
    summary.topSegments.forEach((seg, i) => {
      const title = seg.title || seg.tags[0] || seg.id.substring(0, 30);
      lines.push(
        `${i + 1}. ${seg.id.substring(0, 15)}... (${seg.accessCount} accesses) - "${title}"`
      );
    });
    lines.push('');
  }

  // Potential issues
  if (summary.potentialIssues.length > 0) {
    lines.push('Potential Issues:');
    summary.potentialIssues.forEach((issue) => {
      const icon =
        issue.severity === 'error' ? '🚨' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
      lines.push(`${icon} ${issue.message}`);
    });
  } else {
    lines.push('✅ No issues detected');
  }

  return lines.join('\n');
}

/**
 * Run summary command.
 */
async function runSummary(args: string[]) {
  const daysArg = args.find((a) => a.startsWith('--days='));
  const days = daysArg ? parseInt(daysArg.split('=')[1]) : 30;
  const exportArg = args.find((a) => a.startsWith('--export='));

  const result = await getInsightsSummary(days);

  if (!result.ok) {
    console.error(`[Memory:Insights] Failed: ${result.error.message}`);
    process.exit(1);
  }

  const formatted = formatInsightsSummary(result.value);

  if (exportArg) {
    const format = exportArg.split('=')[1];
    await exportReport(formatted, format, result.value, 'summary');
  } else {
    console.log(formatted);
  }
}

/**
 * Run top-segments command.
 */
async function runTopSegments(args: string[]) {
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 10;
  const exportArg = args.find((a) => a.startsWith('--export='));

  const result = await topSegments(limit);

  if (!result.ok) {
    console.error(`[Memory:Insights] Failed: ${result.error.message}`);
    process.exit(1);
  }

  if (exportArg) {
    const format = exportArg.split('=')[1];
    const data = result.value.map((seg, i) => ({
      rank: i + 1,
      id: seg.id,
      accessCount: seg.accessCount,
      lastAccessed: seg.lastAccessed,
      tags: seg.tags,
      title: seg.title || '',
    }));
    await exportReport(JSON.stringify(data, null, 2), format, data, 'top-segments');
  } else {
    console.log(`Top ${limit} Segments by Access Count:\n`);
    result.value.forEach((seg, i) => {
      const title = seg.title || seg.tags[0] || seg.id.substring(0, 30);
      console.log(`${i + 1}. [${seg.accessCount} accesses] ${title}`);
      console.log(`   ID: ${seg.id}`);
      console.log(`   Tags: ${seg.tags.join(', ')}`);
      console.log('');
    });
  }
}

/**
 * Run stale command.
 */
async function runStaleSegments(args: string[]) {
  const daysArg = args.find((a) => a.startsWith('--days='));
  const days = daysArg ? parseInt(daysArg.split('=')[1]) : 90;
  const exportArg = args.find((a) => a.startsWith('--export='));

  const result = await staleSegments(days);

  if (!result.ok) {
    console.error(`[Memory:Insights] Failed: ${result.error.message}`);
    process.exit(1);
  }

  if (exportArg) {
    const format = exportArg.split('=')[1];
    await exportReport(JSON.stringify(result.value, null, 2), format, result.value, 'stale-segments');
  } else {
    console.log(`Stale Segments (not accessed in ${days}+ days):\n`);
    if (result.value.length === 0) {
      console.log('No stale segments found.');
    } else {
      result.value.forEach((seg, i) => {
        const title = seg.title || seg.tags[0] || seg.id.substring(0, 30);
        const lastAccessedStr = seg.lastAccessed
          ? new Date(seg.lastAccessed).toISOString().split('T')[0]
          : 'Never';
        console.log(`${i + 1}. ${title}`);
        console.log(`   ID: ${seg.id}`);
        console.log(`   Access Count: ${seg.accessCount}`);
        console.log(`   Last Accessed: ${lastAccessedStr}`);
        console.log('');
      });
    }
  }
}

/**
 * Run providers command.
 */
async function runProviderQuality(args: string[]) {
  const exportArg = args.find((a) => a.startsWith('--export='));

  const result = await analyzeProviderQuality();

  if (!result.ok) {
    console.error(`[Memory:Insights] Failed: ${result.error.message}`);
    process.exit(1);
  }

  if (exportArg) {
    const format = exportArg.split('=')[1];
    await exportReport(JSON.stringify(result.value, null, 2), format, result.value, 'provider-quality');
  } else {
    console.log('Provider Quality Analysis:\n');
    result.value.forEach((provider, i) => {
      console.log(`${i + 1}. ${provider.providerName} (${provider.category})`);
      console.log(`   Quality Score: ${provider.qualityScore}/100`);
      console.log(`   Segments Created: ${provider.segmentsCreated}`);
      console.log(`   Avg Access Count: ${provider.avgAccessCount.toFixed(2)}`);
      console.log(`   Success Rate: ${provider.successRate.toFixed(1)}%`);
      console.log(`   Avg Latency: ${provider.avgLatencyMs.toFixed(0)}ms`);
      console.log('');
    });
  }
}

/**
 * Run compare command.
 */
async function runProviderComparison(args: string[]) {
  if (args.length < 2) {
    console.error('Usage: insights compare <provider-a> <provider-b>');
    process.exit(1);
  }

  const providerA = args[0];
  const providerB = args[1];
  const exportArg = args.find((a) => a.startsWith('--export='));

  const result = await providerComparison(providerA, providerB);

  if (!result.ok) {
    console.error(`[Memory:Insights] Failed: ${result.error.message}`);
    process.exit(1);
  }

  if (exportArg) {
    const format = exportArg.split('=')[1];
    await exportReport(JSON.stringify(result.value, null, 2), format, result.value, 'comparison');
  } else {
    console.log(`Provider Comparison: ${providerA} vs ${providerB}\n`);
    console.log(`Provider A (${providerA}):`);
    console.log(`  Avg Latency: ${result.value.metricsA.avgMs.toFixed(0)}ms`);
    console.log(`  Operations: ${result.value.metricsA.operationCount}`);
    console.log('');
    console.log(`Provider B (${providerB}):`);
    console.log(`  Avg Latency: ${result.value.metricsB.avgMs.toFixed(0)}ms`);
    console.log(`  Operations: ${result.value.metricsB.operationCount}`);
    console.log('');
    console.log('Delta:');
    console.log(
      `  Latency Change: ${result.value.delta.avgLatencyDelta > 0 ? '+' : ''}${result.value.delta.avgLatencyDelta.toFixed(0)}ms (${result.value.delta.latencyPercentChange.toFixed(1)}%)`
    );
    console.log(`  Recommendation: Use ${result.value.recommendation}`);
  }
}

/**
 * Export report to file.
 *
 * @param content - Report content
 * @param format - Export format (json, md, txt)
 * @param data - Raw data object
 * @param reportType - Type of report
 */
async function exportReport(
  content: string,
  format: string,
  data: unknown,
  reportType: string
) {
  const paiDir = process.env.PAI_DIR || join(homedir(), 'pai');
  const reportsDir = join(paiDir, 'mem-store', 'reports');

  if (!existsSync(reportsDir)) {
    await mkdir(reportsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  let filename: string;
  let fileContent: string;

  if (format === 'json') {
    filename = `${reportType}-${timestamp}.json`;
    fileContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  } else if (format === 'md') {
    filename = `${reportType}-${timestamp}.md`;
    fileContent = `# ${reportType} Report\n\nGenerated: ${new Date().toISOString()}\n\n\`\`\`\n${content}\n\`\`\`\n`;
  } else {
    filename = `${reportType}-${timestamp}.txt`;
    fileContent = content;
  }

  const filePath = join(reportsDir, filename);
  await writeFile(filePath, fileContent);

  console.log(`\nReport exported to: ${filePath}`);
}

/**
 * Print help.
 */
function printHelp() {
  console.log(`
PAI Memory System Insights

Usage: bun run insights-cli.ts <command> [options]

Commands:
  summary              Generate comprehensive insights report
  top-segments, top    Show most frequently accessed segments
  stale                Show unused/stale segments
  providers            Analyze provider quality
  compare <A> <B>      Compare two providers

Options:
  --days=N             Time range in days (default: 30 for summary, 90 for stale)
  --limit=N            Limit results (default: 10)
  --export=FORMAT      Export format: json, md, txt

Examples:
  bun run insights-cli.ts summary
  bun run insights-cli.ts top-segments --limit=20
  bun run insights-cli.ts stale --days=60
  bun run insights-cli.ts providers
  bun run insights-cli.ts compare keyword-search semantic-search
  bun run insights-cli.ts summary --export=json
  `);
}

/**
 * Main entry point.
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help') {
    printHelp();
    process.exit(0);
  }

  switch (command) {
    case 'summary':
      await runSummary(args.slice(1));
      break;

    case 'top-segments':
    case 'top':
      await runTopSegments(args.slice(1));
      break;

    case 'stale':
      await runStaleSegments(args.slice(1));
      break;

    case 'providers':
      await runProviderQuality(args.slice(1));
      break;

    case 'compare':
      await runProviderComparison(args.slice(1));
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main();
