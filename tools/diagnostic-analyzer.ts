/**
 * Diagnostic Analyzer Tool
 *
 * Analyzes debug log output to diagnose retrieval failures.
 * Identifies zero-result failures, filter removals, and low relevance issues.
 *
 * Story 4.6.3: Diagnostic Analysis Tools (AC1, AC2, AC3)
 */

import { Result, ProviderError } from '../types/common';
import { parseDebugLog, DiagnosticData } from './lib/log-parser';
import { DiagnosticReport } from './lib/report-formatter';

/**
 * Analyze debug log output and generate diagnostic report
 *
 * Parses debug log from stderr and determines failure point.
 * Handles AC1 (log parsing), AC2 (zero results), AC3 (filter removal).
 *
 * LOW-2: Changed from async to synchronous (no await needed)
 *
 * @param logContent - Raw debug log output from stderr
 * @returns Result containing diagnostic report or error
 *
 * @example
 * ```typescript
 * const logContent = captureDebugOutput();
 * const result = analyzeDiagnostics(logContent);
 * if (result.ok) {
 *   console.log(formatDiagnosticReport(result.value));
 * }
 * ```
 */
export function analyzeDiagnostics(
  logContent: string
): Result<DiagnosticReport, ProviderError> {
  // Parse debug log into structured data
  const parseResult = parseDebugLog(logContent);
  if (!parseResult.ok) {
    return parseResult;
  }

  const data = parseResult.value;

  // Determine diagnosis type
  const diagnosis = determineDiagnosis(data);

  // Generate diagnostic report
  const report: DiagnosticReport = {
    diagnosis: diagnosis.type,
    failurePoint: diagnosis.failurePoint,
    rootCause: diagnosis.rootCause,
    recommendation: diagnosis.recommendation,
    details: data,
  };

  return { ok: true, value: report };
}


/**
 * Determine diagnosis type from diagnostic data
 *
 * Implements AC2 (zero results) and AC3 (filter removal) detection logic.
 *
 * @param data - Parsed diagnostic data
 * @returns Diagnosis with failure point, root cause, and recommendation
 */
function determineDiagnosis(data: DiagnosticData): {
  type: DiagnosticReport['diagnosis'];
  failurePoint?: string;
  rootCause?: string;
  recommendation?: string;
} {
  // AC2: Zero results - no index matches
  if (data.candidatesBeforeFilter === 0) {
    const zeroHitTerms = Object.entries(data.indexHits)
      .filter(([_, hits]) => hits === 0)
      .map(([term, _]) => term);

    const someHitTerms = Object.entries(data.indexHits)
      .filter(([_, hits]) => hits > 0)
      .map(([term, hits]) => `${term} (${hits} hits)`);

    // MEDIUM-1: Better analysis for partial matches
    if (zeroHitTerms.length === data.terms.length) {
      // All terms have zero hits
      return {
        type: 'zero_results' as const,
        failurePoint: 'No index matches',
        rootCause: 'None of the query terms exist in keyword index',
        recommendation:
          'Check if segments with these keywords exist, or try different search terms',
      };
    } else if (someHitTerms.length > 0 && zeroHitTerms.length > 0) {
      // Some terms matched but still zero candidates (partial match failure)
      return {
        type: 'zero_results' as const,
        failurePoint: 'Partial match insufficient',
        rootCause: `Some terms matched [${someHitTerms.join(', ')}] but terms with no hits [${zeroHitTerms.join(', ')}] prevented candidate creation. Keyword search requires ALL terms to match.`,
        recommendation:
          'Try removing some search terms or use more common keywords',
      };
    } else {
      // Shouldn't happen, but fallback
      return {
        type: 'zero_results' as const,
        failurePoint: 'No index matches',
        rootCause: `Terms with no hits: ${zeroHitTerms.join(', ')}`,
        recommendation:
          'Check if segments with these keywords exist, or try different search terms',
      };
    }
  }

  // AC3: Filtered out - recency filter removed all
  if (
    data.candidatesAfterRecency === 0 &&
    data.candidatesBeforeFilter > 0
  ) {
    return {
      type: 'filtered_out' as const,
      failurePoint: `Recency filter (${data.recencyWindow}d)`,
      rootCause: `All ${data.candidatesBeforeFilter} candidates older than ${data.recencyWindow} days`,
      recommendation: `Increase recency_window_days in config or check segment capture dates`,
    };
  }

  // AC3: Filtered out - importance filter removed all
  if (
    data.candidatesAfterImportance === 0 &&
    data.candidatesAfterRecency > 0
  ) {
    return {
      type: 'filtered_out' as const,
      failurePoint: `Importance filter (min=${data.minImportance})`,
      rootCause: `All ${data.candidatesAfterRecency} candidates scored below ${data.minImportance}`,
      recommendation: `Lower min_importance_score in config or check segment importance scores`,
    };
  }

  // Success
  if (data.topResults.length > 0) {
    return {
      type: 'success' as const,
      failurePoint: undefined,
      rootCause: undefined,
      recommendation: undefined,
    };
  }

  // Low relevance
  return {
    type: 'low_relevance' as const,
    failurePoint: 'Ranking',
    rootCause: 'Candidates found but scored too low',
    recommendation:
      'Check segment tags and query terms for better matching',
  };
}

