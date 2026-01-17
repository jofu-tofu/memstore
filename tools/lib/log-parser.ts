/**
 * Debug Log Parsing Utilities
 *
 * Parses debug log output from stderr into structured diagnostic data.
 * Used by diagnostic-analyzer.ts to analyze retrieval failures.
 *
 * Story 4.6.3: Diagnostic Analysis Tools (AC1)
 */

import { Result, ProviderError } from '../../types/common';

/**
 * Structured diagnostic data parsed from debug logs
 */
export interface DiagnosticData {
  query: string;
  terms: string[];
  indexHits: Record<string, number>;
  candidatesBeforeFilter: number;
  candidatesAfterRecency: number;
  candidatesAfterImportance: number;
  topResults: Array<{
    id: string;
    score: number;
    age: string;
    tags: string[];
  }>;
  recencyWindow?: number;
  minImportance?: number;
}

/**
 * Parse debug log output into structured diagnostic data
 *
 * Extracts information from standardized [Memory:*:Debug] format logs.
 * Handles malformed or partial logs gracefully (AC1).
 *
 * @param logContent - Raw debug log from stderr
 * @returns Result containing parsed diagnostic data or error
 *
 * @example
 * ```typescript
 * const logContent = captureStderr();
 * const result = parseDebugLog(logContent);
 * if (result.ok) {
 *   console.log(`Query: ${result.value.query}`);
 *   console.log(`Candidates: ${result.value.candidatesBeforeFilter}`);
 * }
 * ```
 */
export function parseDebugLog(
  logContent: string
): Result<DiagnosticData, ProviderError> {
  try {
    const lines = logContent.split('\n').filter((l) => l.includes('[Memory:'));

    const data: Partial<DiagnosticData> = {
      terms: [],
      indexHits: {},
      topResults: [],
      candidatesBeforeFilter: 0,
      candidatesAfterRecency: 0,
      candidatesAfterImportance: 0,
    };

    // Extract query
    const queryLine = lines.find((l) => l.includes('Query:'));
    if (queryLine) {
      data.query = extractQuery(queryLine);
    } else {
      data.query = '';
    }

    // Extract terms
    const termsLine = lines.find((l) => l.includes('Terms extracted:'));
    if (termsLine) {
      data.terms = extractTerms(termsLine);
    }

    // Extract index hits
    const indexLine = lines.find((l) => l.includes('Index lookup:'));
    if (indexLine) {
      data.indexHits = extractIndexHits(indexLine);
    }

    // Extract candidate counts
    const beforeFilterLine = lines.find((l) =>
      l.includes('Total candidates before filtering:')
    );
    if (beforeFilterLine) {
      data.candidatesBeforeFilter = extractNumber(beforeFilterLine);
    }

    const afterRecencyLine = lines.find((l) =>
      l.includes('After recency filter')
    );
    if (afterRecencyLine) {
      data.candidatesAfterRecency = extractNumber(afterRecencyLine);
      data.recencyWindow = extractRecencyWindow(afterRecencyLine);
    } else {
      // If no recency filter line, assume same as before filter
      data.candidatesAfterRecency = data.candidatesBeforeFilter;
    }

    const afterImportanceLine = lines.find((l) =>
      l.includes('After importance filter')
    );
    if (afterImportanceLine) {
      data.candidatesAfterImportance = extractNumber(afterImportanceLine);
      data.minImportance = extractMinImportance(afterImportanceLine);
    } else {
      // If no importance filter line, assume same as after recency
      data.candidatesAfterImportance = data.candidatesAfterRecency;
    }

    // Extract top results
    const topResultsIndex = lines.findIndex((l) =>
      l.includes('Top 5 by relevance score:')
    );
    if (topResultsIndex >= 0) {
      data.topResults = extractTopResults(lines.slice(topResultsIndex + 1));
    }

    return { ok: true, value: data as DiagnosticData };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'LOG_PARSE_FAILED',
        message: `Failed to parse debug log: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}

/**
 * Extract query from debug log line
 *
 * Parse format: [Memory:Retrieve:Debug] Query: "test query"
 * HIGH-5: Fixed regex to handle queries with internal quotes
 */
function extractQuery(line: string): string {
  // Match everything between Query: " and the last " on the line
  const match = line.match(/Query: "(.+)"$/);
  return match ? match[1] : '';
}

/**
 * Extract search terms from debug log line
 *
 * Parse format: [Memory:Retrieve:Debug] Terms extracted: ["typescript", "hook"]
 */
function extractTerms(line: string): string[] {
  const match = line.match(/Terms extracted: \[(.+)\]/);
  if (!match) return [];

  // Parse quoted array: "typescript", "hook"
  return match[1].split(',').map((t) => t.trim().replace(/"/g, ''));
}

/**
 * Extract index hit counts from debug log line
 *
 * Parse format: [Memory:KeywordSearch:Debug] Index lookup: typescript=15 hits, hook=8 hits
 * MEDIUM-3: Added NaN validation for parseInt results
 */
function extractIndexHits(line: string): Record<string, number> {
  const match = line.match(/Index lookup: (.+)/);
  if (!match) return {};

  const hits: Record<string, number> = {};
  const pairs = match[1].split(',');

  for (const pair of pairs) {
    const [term, count] = pair.trim().split('=');
    if (term && count) {
      const parsed = parseInt(count.replace(' hits', '').trim());
      // Skip if parsing failed (NaN)
      if (!isNaN(parsed)) {
        hits[term] = parsed;
      }
    }
  }

  return hits;
}

/**
 * Extract number from debug log line containing "N segments"
 *
 * Parse format: "... 23 segments" → 23
 */
function extractNumber(line: string): number {
  const match = line.match(/(\d+) segments?/);
  return match ? parseInt(match[1]) : 0;
}

/**
 * Extract recency window from debug log line
 *
 * Parse format: "After recency filter (30d):" → 30
 */
function extractRecencyWindow(line: string): number | undefined {
  const match = line.match(/\((\d+)d\)/);
  return match ? parseInt(match[1]) : undefined;
}

/**
 * Extract minimum importance score from debug log line
 *
 * Parse format: "After importance filter (min=40):" → 40
 */
function extractMinImportance(line: string): number | undefined {
  const match = line.match(/min=(\d+)/);
  return match ? parseInt(match[1]) : undefined;
}

/**
 * Extract top results from debug log lines
 *
 * Parse format: "  - seg_001 (score=87, age=3d, tags=typescript,hooks)"
 */
function extractTopResults(
  lines: string[]
): DiagnosticData['topResults'] {
  const results: DiagnosticData['topResults'] = [];

  for (const line of lines) {
    // Stop when we hit a line that's not a result
    if (!line.includes(' - seg_')) break;

    const match = line.match(
      /seg_(\w+) \(score=(\d+), age=(.+?), tags=(.+?)\)/
    );
    if (match) {
      results.push({
        id: `seg_${match[1]}`,
        score: parseInt(match[2]),
        age: match[3],
        tags: match[4].split(',').map((t) => t.trim()),
      });
    }
  }

  return results;
}
