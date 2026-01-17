/**
 * Retrieval Comparison Tool
 *
 * Compares two retrieval runs with different configurations to analyze differences.
 * Helps optimize retrieval settings by showing impact of config changes.
 *
 * Story 4.6.3: Diagnostic Analysis Tools (AC5)
 */

import { Result, ProviderError } from '../types/common';
import { ComparisonReport } from './lib/report-formatter';

/**
 * Retrieval run result for comparison
 */
export interface RetrievalRun {
  label: string; // e.g., "recency=7d" or "importance=40"
  results: Array<{
    segmentId: string;
    score: number;
  }>;
}

/**
 * Compare two retrieval runs and identify differences
 *
 * Implements AC5: Shows unique segments, score differences, and explanations.
 *
 * @param run1 - First retrieval run
 * @param run2 - Second retrieval run
 * @returns Result containing comparison report
 *
 * @example
 * ```typescript
 * const run1 = {
 *   label: 'recency=7d',
 *   results: [{ segmentId: 'seg_001', score: 85 }]
 * };
 * const run2 = {
 *   label: 'recency=30d',
 *   results: [
 *     { segmentId: 'seg_001', score: 85 },
 *     { segmentId: 'seg_002', score: 78 }
 *   ]
 * };
 *
 * const result = await compareRetrievals(run1, run2);
 * if (result.ok) {
 *   console.log(result.value.explanation);
 * }
 * ```
 */
export function compareRetrievals(
  run1: RetrievalRun,
  run2: RetrievalRun
): Result<ComparisonReport, ProviderError> {
  try {
    // Build segment ID sets and score maps in single pass (MEDIUM-6)
    const run1Ids = new Set<string>();
    const run1Scores = new Map<string, number>();
    for (const r of run1.results) {
      run1Ids.add(r.segmentId);
      run1Scores.set(r.segmentId, r.score);
    }

    const run2Ids = new Set<string>();
    const run2Scores = new Map<string, number>();
    for (const r of run2.results) {
      run2Ids.add(r.segmentId);
      run2Scores.set(r.segmentId, r.score);
    }

    // AC5: Identify segments unique to each run and in both (single pass, MEDIUM-6)
    const uniqueToRun1: string[] = [];
    const inBothRuns: string[] = [];

    for (const r of run1.results) {
      if (run2Ids.has(r.segmentId)) {
        inBothRuns.push(r.segmentId);
      } else {
        uniqueToRun1.push(r.segmentId);
      }
    }

    const uniqueToRun2: string[] = [];
    for (const r of run2.results) {
      if (!run1Ids.has(r.segmentId)) {
        uniqueToRun2.push(r.segmentId);
      }
    }

    // AC5: Calculate score differences for segments in both runs
    const scoreDifferences = inBothRuns.map((segmentId) => ({
      segmentId,
      run1Score: run1Scores.get(segmentId) || 0,
      run2Score: run2Scores.get(segmentId) || 0,
      difference:
        (run2Scores.get(segmentId) || 0) - (run1Scores.get(segmentId) || 0),
    }));

    // Sort by absolute difference (largest changes first)
    scoreDifferences.sort(
      (a, b) => Math.abs(b.difference) - Math.abs(a.difference)
    );

    // AC5: Generate explanation
    const explanation = generateExplanation({
      run1Label: run1.label,
      run2Label: run2.label,
      uniqueToRun1Count: uniqueToRun1.length,
      uniqueToRun2Count: uniqueToRun2.length,
      inBothCount: inBothRuns.length,
      run1Total: run1.results.length,
      run2Total: run2.results.length,
    });

    return {
      ok: true,
      value: {
        run1Label: run1.label,
        run2Label: run2.label,
        uniqueToRun1,
        uniqueToRun2,
        inBothRuns,
        scoreDifferences,
        explanation,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'COMPARISON_FAILED',
        message: `Failed to compare retrievals: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}

/**
 * Generate human-readable explanation of comparison results
 */
function generateExplanation(params: {
  run1Label: string;
  run2Label: string;
  uniqueToRun1Count: number;
  uniqueToRun2Count: number;
  inBothCount: number;
  run1Total: number;
  run2Total: number;
}): string {
  const {
    run1Label,
    run2Label,
    uniqueToRun1Count,
    uniqueToRun2Count,
    inBothCount,
    run1Total,
    run2Total,
  } = params;

  // No differences
  if (uniqueToRun1Count === 0 && uniqueToRun2Count === 0) {
    return 'Both runs returned identical results with no differences';
  }

  // Run 2 has more results
  if (uniqueToRun2Count > uniqueToRun1Count) {
    const diff = uniqueToRun2Count - uniqueToRun1Count;
    return `Run 2 (${run2Label}) found ${diff} additional segment${diff > 1 ? 's' : ''} compared to Run 1 (${run1Label})`;
  }

  // Run 1 has more results
  if (uniqueToRun1Count > uniqueToRun2Count) {
    const diff = uniqueToRun1Count - uniqueToRun2Count;
    return `Run 1 (${run1Label}) found ${diff} additional segment${diff > 1 ? 's' : ''} compared to Run 2 (${run2Label})`;
  }

  // Same count but different segments
  return `Both runs found ${run1Total} and ${run2Total} segments respectively, with ${uniqueToRun1Count} unique to each run and ${inBothCount} in common`;
}
