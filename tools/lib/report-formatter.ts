/**
 * Diagnostic Report Formatters
 *
 * Formats diagnostic data into human-readable reports.
 * Used by all diagnostic tools for consistent output formatting.
 *
 * Story 4.6.3: Diagnostic Analysis Tools (All ACs)
 */

import { DiagnosticData } from './log-parser';

/**
 * Diagnostic report structure
 */
export interface DiagnosticReport {
  diagnosis:
    | 'success'
    | 'zero_results'
    | 'filtered_out'
    | 'low_relevance';
  failurePoint?: string;
  rootCause?: string;
  recommendation?: string;
  details: DiagnosticData;
}

/**
 * Segment investigation report structure
 */
export interface SegmentInvestigation {
  segmentId: string;
  query: string;
  exists: boolean;
  tags?: string[];
  matchingTags?: string[];
  wouldBeFilteredByRecency?: boolean;
  wouldBeFilteredByImportance?: boolean;
  relevanceScore?: number;
  diagnosis: string;
  recommendation: string;
}

/**
 * Retrieval comparison report structure
 */
export interface ComparisonReport {
  run1Label: string;
  run2Label: string;
  uniqueToRun1: string[];
  uniqueToRun2: string[];
  inBothRuns: string[];
  scoreDifferences: Array<{
    segmentId: string;
    run1Score: number;
    run2Score: number;
    difference: number;
  }>;
  explanation: string;
}

/**
 * Format zero-result diagnostic report (AC2)
 *
 * @param report - Diagnostic report with zero_results diagnosis
 * @returns Formatted report string
 *
 * @example
 * ```
 * DIAGNOSIS: Zero Results
 * Failure Point: No index matches
 * Query: "quantum computing"
 * Terms Extracted: ["quantum", "computing"]
 * Index Hits:
 *   - quantum: 0 hits
 *   - computing: 0 hits
 * Candidates: 0 segments
 * Root Cause: Terms not in keyword index
 * ```
 */
export function formatZeroResultDiagnostic(
  report: DiagnosticReport
): string {
  const lines: string[] = [];

  lines.push('DIAGNOSIS: Zero Results');
  if (report.failurePoint) {
    lines.push(`Failure Point: ${report.failurePoint}`);
  }
  lines.push(`Query: "${report.details.query}"`);
  lines.push(`Terms Extracted: [${report.details.terms.map((t) => `"${t}"`).join(', ')}]`);

  lines.push('Index Hits:');
  for (const [term, hits] of Object.entries(report.details.indexHits)) {
    lines.push(`  - ${term}: ${hits} hits`);
  }

  lines.push(`Candidates: ${report.details.candidatesBeforeFilter} segments`);

  if (report.rootCause) {
    lines.push(`Root Cause: ${report.rootCause}`);
  }
  if (report.recommendation) {
    lines.push(`Recommendation: ${report.recommendation}`);
  }

  return lines.join('\n');
}

/**
 * Format filter-removal diagnostic report (AC3)
 *
 * @param report - Diagnostic report with filtered_out diagnosis
 * @returns Formatted report string
 *
 * @example
 * ```
 * DIAGNOSIS: Filtered Out
 * Query: "old typescript discussion"
 * Candidates Before Filtering: 23 segments
 * After Recency Filter (7d): 0 segments  ← FILTER REMOVED ALL
 * Root Cause: All candidates older than 7 days
 * Recommendation: Increase recency_window_days or check segment dates
 * ```
 */
export function formatFilterDiagnostic(report: DiagnosticReport): string {
  const lines: string[] = [];

  lines.push('DIAGNOSIS: Filtered Out');
  lines.push(`Query: "${report.details.query}"`);
  lines.push(
    `Candidates Before Filtering: ${report.details.candidatesBeforeFilter} segments`
  );

  // Check which filter removed candidates
  if (report.details.candidatesAfterRecency === 0) {
    lines.push(
      `After Recency Filter (${report.details.recencyWindow}d): 0 segments  ← FILTER REMOVED ALL`
    );
  } else {
    lines.push(
      `After Recency Filter (${report.details.recencyWindow}d): ${report.details.candidatesAfterRecency} segments`
    );
  }

  if (
    report.details.candidatesAfterImportance === 0 &&
    report.details.candidatesAfterRecency > 0
  ) {
    lines.push(
      `After Importance Filter (min=${report.details.minImportance}): 0 segments  ← FILTER REMOVED ALL`
    );
  } else if (report.details.minImportance !== undefined) {
    lines.push(
      `After Importance Filter (min=${report.details.minImportance}): ${report.details.candidatesAfterImportance} segments`
    );
  }

  if (report.rootCause) {
    lines.push(`Root Cause: ${report.rootCause}`);
  }
  if (report.recommendation) {
    lines.push(`Recommendation: ${report.recommendation}`);
  }

  return lines.join('\n');
}

/**
 * Format segment investigation report (AC4)
 *
 * @param investigation - Segment investigation result
 * @returns Formatted report string
 *
 * @example
 * ```
 * SEGMENT INVESTIGATION
 * Segment: seg_001
 * Query: "typescript hook"
 * Exists: true
 * Tags: [typescript, hooks, api]
 * Matching Tags: [typescript, hooks]
 * Filtered by Recency: false
 * Filtered by Importance: false
 * Relevance Score: 87
 * Diagnosis: Segment should have been retrieved
 * Recommendation: Check retrieval logic
 * ```
 */
export function formatSegmentInvestigation(
  investigation: SegmentInvestigation
): string {
  const lines: string[] = [];

  lines.push('SEGMENT INVESTIGATION');
  lines.push(`Segment: ${investigation.segmentId}`);
  lines.push(`Query: "${investigation.query}"`);
  lines.push(`Exists: ${investigation.exists}`);

  if (investigation.tags) {
    lines.push(`Tags: [${investigation.tags.join(', ')}]`);
  }
  if (investigation.matchingTags !== undefined) {
    lines.push(`Matching Tags: [${investigation.matchingTags.join(', ')}]`);
  }
  if (investigation.wouldBeFilteredByRecency !== undefined) {
    lines.push(
      `Filtered by Recency: ${investigation.wouldBeFilteredByRecency}`
    );
  }
  if (investigation.wouldBeFilteredByImportance !== undefined) {
    lines.push(
      `Filtered by Importance: ${investigation.wouldBeFilteredByImportance}`
    );
  }
  if (investigation.relevanceScore !== undefined) {
    lines.push(`Relevance Score: ${investigation.relevanceScore}`);
  }

  lines.push(`Diagnosis: ${investigation.diagnosis}`);
  lines.push(`Recommendation: ${investigation.recommendation}`);

  return lines.join('\n');
}

/**
 * Format retrieval comparison report (AC5)
 *
 * @param comparison - Comparison report data
 * @returns Formatted report string
 *
 * @example
 * ```
 * RETRIEVAL COMPARISON
 * Run 1: recency=7d
 * Run 2: recency=30d
 *
 * Unique to Run 1 (0 segments):
 *   (none)
 *
 * Unique to Run 2 (15 segments):
 *   - seg_001 (score=85)
 *   - seg_002 (score=78)
 *   ...
 *
 * In Both Runs (8 segments):
 *   - seg_010 (Run1: 92, Run2: 91, diff: -1)
 *   ...
 *
 * Explanation: Run 2 found 15 additional segments due to wider recency window
 * ```
 */
export function formatComparisonReport(comparison: ComparisonReport): string {
  const lines: string[] = [];

  lines.push('RETRIEVAL COMPARISON');
  lines.push(`Run 1: ${comparison.run1Label}`);
  lines.push(`Run 2: ${comparison.run2Label}`);
  lines.push('');

  lines.push(
    `Unique to Run 1 (${comparison.uniqueToRun1.length} segments):`
  );
  if (comparison.uniqueToRun1.length === 0) {
    lines.push('  (none)');
  } else {
    for (const segmentId of comparison.uniqueToRun1.slice(0, 10)) {
      lines.push(`  - ${segmentId}`);
    }
    if (comparison.uniqueToRun1.length > 10) {
      lines.push(`  ... and ${comparison.uniqueToRun1.length - 10} more`);
    }
  }
  lines.push('');

  lines.push(
    `Unique to Run 2 (${comparison.uniqueToRun2.length} segments):`
  );
  if (comparison.uniqueToRun2.length === 0) {
    lines.push('  (none)');
  } else {
    for (const segmentId of comparison.uniqueToRun2.slice(0, 10)) {
      lines.push(`  - ${segmentId}`);
    }
    if (comparison.uniqueToRun2.length > 10) {
      lines.push(`  ... and ${comparison.uniqueToRun2.length - 10} more`);
    }
  }
  lines.push('');

  lines.push(`In Both Runs (${comparison.inBothRuns.length} segments):`);
  if (comparison.inBothRuns.length === 0) {
    lines.push('  (none)');
  } else {
    for (const diff of comparison.scoreDifferences.slice(0, 5)) {
      lines.push(
        `  - ${diff.segmentId} (Run1: ${diff.run1Score}, Run2: ${diff.run2Score}, diff: ${diff.difference >= 0 ? '+' : ''}${diff.difference})`
      );
    }
    if (comparison.scoreDifferences.length > 5) {
      lines.push(`  ... and ${comparison.scoreDifferences.length - 5} more`);
    }
  }
  lines.push('');

  lines.push(`Explanation: ${comparison.explanation}`);

  return lines.join('\n');
}

/**
 * Format general diagnostic report
 *
 * Routes to specialized formatter based on diagnosis type
 *
 * @param report - Diagnostic report
 * @returns Formatted report string
 */
export function formatDiagnosticReport(report: DiagnosticReport): string {
  switch (report.diagnosis) {
    case 'zero_results':
      return formatZeroResultDiagnostic(report);
    case 'filtered_out':
      return formatFilterDiagnostic(report);
    case 'success':
      return formatSuccessDiagnostic(report);
    case 'low_relevance':
      return formatLowRelevanceDiagnostic(report);
    default:
      return 'DIAGNOSIS: Unknown';
  }
}

/**
 * Format success diagnostic report
 */
function formatSuccessDiagnostic(report: DiagnosticReport): string {
  const lines: string[] = [];

  lines.push('DIAGNOSIS: Success');
  lines.push(`Query: "${report.details.query}"`);
  lines.push(`Results Found: ${report.details.topResults.length} segments`);
  lines.push('');

  if (report.details.topResults.length > 0) {
    lines.push('Top Results:');
    for (const result of report.details.topResults) {
      lines.push(
        `  - ${result.id} (score=${result.score}, age=${result.age}, tags=${result.tags.join(',')})`
      );
    }
  }

  return lines.join('\n');
}

/**
 * Format low relevance diagnostic report
 */
function formatLowRelevanceDiagnostic(report: DiagnosticReport): string {
  const lines: string[] = [];

  lines.push('DIAGNOSIS: Low Relevance');
  lines.push(`Query: "${report.details.query}"`);
  lines.push(
    `Candidates Found: ${report.details.candidatesAfterImportance} segments`
  );

  if (report.rootCause) {
    lines.push(`Root Cause: ${report.rootCause}`);
  }
  if (report.recommendation) {
    lines.push(`Recommendation: ${report.recommendation}`);
  }

  return lines.join('\n');
}
