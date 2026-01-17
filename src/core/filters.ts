// Composite filter pipeline for search results
// Applies multiple filters with AND logic

import { Result } from '../types/common';
import {
  FilterOptions,
  SegmentMetadata,
  FilterResult,
  FilterError
} from '../types/filters';
import { SearchResult } from '../providers/search/interface';
import { loadSegmentMetadata } from '../lib/metadata-loader';
import { filterByTags } from './filters/tag-filter';
import { filterByRecency } from './filters/recency-filter';
import { filterByImportance } from './filters/importance-filter';
import { filterByAccessCount } from './filters/access-filter';

export async function applyFilters(
  searchResults: SearchResult[],
  options?: FilterOptions
): Promise<Result<FilterResult[], FilterError>> {
  try {
    // Extract segment IDs from search results
    const segmentIds = searchResults.map(r => r.segmentId);

    // Load metadata for all candidates
    const metadataResult = await loadSegmentMetadata(segmentIds);

    if (!metadataResult.ok) {
      return metadataResult as Result<FilterResult[], FilterError>;
    }

    let filtered = metadataResult.value;

    // If no filters specified, still return all candidates with metadata
    if (!options || Object.keys(options).length === 0) {
      console.error('[Memory:Filters] No filters specified, returning all candidates');
    } else {
      // Apply filters in sequence (AND logic)
      if (options?.tags && options.tags.length > 0) {
        filtered = filterByTags(filtered, options.tags);
        console.error(
          `[Memory:Filters] After tag filter: ${filtered.length} candidates`
        );
      }

      if (options?.recency) {
        filtered = filterByRecency(filtered, options.recency);
        console.error(
          `[Memory:Filters] After recency filter: ${filtered.length} candidates`
        );
      }

      if (options?.minImportance !== undefined) {
        filtered = filterByImportance(filtered, options.minImportance);
        console.error(
          `[Memory:Filters] After importance filter: ${filtered.length} candidates`
        );
      }

      if (options?.minAccessCount !== undefined) {
        filtered = filterByAccessCount(filtered, options.minAccessCount);
        console.error(
          `[Memory:Filters] After access count filter: ${filtered.length} candidates`
        );
      }
    }

    // Combine filtered metadata with original search match counts
    const results: FilterResult[] = filtered.map(metadata => {
      const searchResult = searchResults.find(r => r.segmentId === metadata.id);

      return {
        segmentId: metadata.id,
        matchCount: searchResult?.matchCount || 0,
        matchedTerms: searchResult?.matchedTerms || [],
        totalQueryTerms: searchResult?.totalQueryTerms || 0,
        metadata
      };
    });

    console.error(
      `[Memory:Filters] Final filtered results: ${results.length}/${searchResults.length}`
    );

    return { ok: true, value: results };

  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'FILTER_FAILED',
        message: `Filtering failed: ${(error as Error).message}`,
        cause: error as Error
      }
    };
  }
}
