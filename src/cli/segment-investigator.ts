/**
 * Segment Investigation Tool
 *
 * Investigates why a specific segment wasn't retrieved for a query.
 * Checks existence, tag matching, filters, and relevance scoring.
 *
 * Story 4.6.3: Diagnostic Analysis Tools (AC4)
 */

import { Result, ProviderError } from '../types/common';
import { MemorySegment } from '../types/segment';
import { globalProviderRegistry } from '../core/provider-registry';
import { StorageProvider, StorageError } from '../providers/storage/interface';
import { extractKeywords } from '../lib/keyword-extractor';
import { getMemoryConfig } from '../core/config';
import { SegmentInvestigation } from './lib/report-formatter';

/**
 * MEDIUM-2: Threshold for determining low relevance scores
 * Segments scoring below this threshold are considered poorly matched
 */
const LOW_RELEVANCE_THRESHOLD = 50;

/**
 * Validate segment ID format
 *
 * HIGH-4: Segment IDs must match pattern: seg_{timestamp}_{random}
 *
 * @param segmentId - Segment ID to validate
 * @returns true if valid format
 */
function isValidSegmentId(segmentId: string): boolean {
  // Pattern: seg_<lowercase alphanumeric>_<lowercase alphanumeric>
  // Segment IDs are always lowercase
  return /^seg_[a-z0-9]+_[a-z0-9]+$/.test(segmentId);
}

/**
 * Extract search terms from query using simple tokenization
 *
 * Similar to extractKeywords but preserves all meaningful terms
 */
function extractSearchTerms(query: string): string[] {
  const terms = extractKeywords(query, 10);
  // Also add original words (lowercase) for broader matching
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2); // Filter very short words

  return [...new Set([...terms, ...words])]; // Dedupe
}

/**
 * Calculate simple relevance score for segment vs query terms
 *
 * Score = (matching tags / total query terms) * 100
 */
function scoreSegment(segment: MemorySegment, queryTerms: string[]): number {
  if (queryTerms.length === 0) return 0;

  const matchingCount = queryTerms.filter((term) =>
    segment.tags.some(
      (tag) =>
        tag.toLowerCase().includes(term.toLowerCase()) ||
        term.toLowerCase().includes(tag.toLowerCase())
    )
  ).length;

  return Math.round((matchingCount / queryTerms.length) * 100);
}

/**
 * Investigate why a specific segment wasn't retrieved for a query
 *
 * Implements AC4: Checks existence, tags, filters, and score.
 *
 * @param segmentId - Segment ID to investigate (e.g., "seg_123456_abc")
 * @param query - Query that should have matched
 * @returns Result containing investigation report
 *
 * @example
 * ```typescript
 * const result = await investigateSegment('seg_001', 'typescript hook');
 * if (result.ok) {
 *   console.log(result.value.diagnosis);
 *   console.log(result.value.recommendation);
 * }
 * ```
 */
export async function investigateSegment(
  segmentId: string,
  query: string
): Promise<Result<SegmentInvestigation, ProviderError>> {
  // HIGH-4: Validate segment ID format before proceeding
  if (!isValidSegmentId(segmentId)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_SEGMENT_ID',
        message: `Invalid segment ID format: ${segmentId}. Expected format: seg_<timestamp>_<random>`,
      },
    };
  }

  // Get storage provider
  const providerResult =
    await globalProviderRegistry.getProvider<StorageProvider>(
      'storage',
      'FileBackend'
    );

  if (!providerResult.ok) {
    return {
      ok: false,
      error: {
        code: 'PROVIDER_NOT_FOUND',
        message: `Failed to get storage provider: ${providerResult.error.message}`,
        cause: providerResult.error as Error,
      },
    };
  }

  const storage = providerResult.value;

  // AC4.1: Check existence
  const segmentResult = await storage.retrieve(segmentId);
  if (!segmentResult.ok) {
    return {
      ok: false,
      error: {
        code: 'SEGMENT_READ_FAILED',
        message: `Failed to retrieve segment: ${segmentResult.error.message}`,
        cause: segmentResult.error as Error,
      },
    };
  }

  const segment = segmentResult.value;

  if (!segment) {
    return {
      ok: true,
      value: {
        segmentId,
        query,
        exists: false,
        diagnosis: `Segment ${segmentId} does not exist in storage`,
        recommendation:
          'Verify segment ID is correct and segment was captured',
      },
    };
  }

  // AC4.2: Check tags vs query terms
  const queryTerms = extractSearchTerms(query);
  const matchingTags = segment.tags.filter((tag) =>
    queryTerms.some(
      (term) =>
        tag.toLowerCase().includes(term.toLowerCase()) ||
        term.toLowerCase().includes(tag.toLowerCase())
    )
  );

  if (matchingTags.length === 0) {
    return {
      ok: true,
      value: {
        segmentId,
        query,
        exists: true,
        tags: segment.tags,
        matchingTags: [],
        diagnosis: `No tag overlap between segment and query`,
        recommendation: `Segment tags: [${segment.tags.join(', ')}]. Query terms: [${queryTerms.join(', ')}]. No matching keywords.`,
      },
    };
  }

  // AC4.3: Check recency filter
  const config = await getMemoryConfig();
  const recencyWindow = config.ok
    ? config.value.search.recency_window_days
    : undefined;

  // HIGH-6: Use capturedAt field, not timestamp
  const segmentAge = Date.now() - segment.capturedAt;
  const segmentAgeDays = segmentAge / (1000 * 60 * 60 * 24);
  const wouldBeFilteredByRecency =
    recencyWindow !== undefined && segmentAgeDays > recencyWindow;

  if (wouldBeFilteredByRecency) {
    return {
      ok: true,
      value: {
        segmentId,
        query,
        exists: true,
        tags: segment.tags,
        matchingTags,
        wouldBeFilteredByRecency: true,
        diagnosis: `Segment filtered out by recency (age: ${Math.floor(segmentAgeDays)}d, limit: ${recencyWindow}d)`,
        recommendation: `Increase recency_window_days to at least ${Math.ceil(segmentAgeDays)} days`,
      },
    };
  }

  // AC4.4: Check importance filter
  const minImportance = config.ok
    ? config.value.search.min_importance_score
    : undefined;
  const wouldBeFilteredByImportance =
    minImportance !== undefined && segment.importanceScore < minImportance;

  if (wouldBeFilteredByImportance) {
    return {
      ok: true,
      value: {
        segmentId,
        query,
        exists: true,
        tags: segment.tags,
        matchingTags,
        wouldBeFilteredByRecency: false,
        wouldBeFilteredByImportance: true,
        diagnosis: `Segment filtered out by importance (score: ${segment.importanceScore}, min: ${minImportance})`,
        recommendation: `Lower min_importance_score to ${segment.importanceScore} or below`,
      },
    };
  }

  // AC4.5: Check relevance score
  const relevanceScore = scoreSegment(segment, queryTerms);

  return {
    ok: true,
    value: {
      segmentId,
      query,
      exists: true,
      tags: segment.tags,
      matchingTags,
      wouldBeFilteredByRecency: false,
      wouldBeFilteredByImportance: false,
      relevanceScore,
      diagnosis: `Segment passed all filters (score: ${relevanceScore})`,
      recommendation:
        relevanceScore < LOW_RELEVANCE_THRESHOLD
          ? 'Low relevance score - consider adding more relevant tags'
          : 'Segment should have been retrieved - check retrieval logic',
    },
  };
}
