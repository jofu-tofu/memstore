// Importance filtering for search results
// Filters segments by minimum importance score

import { SegmentMetadata } from '../../types/filters';

export function filterByImportance(
  candidates: SegmentMetadata[],
  minScore: number
): SegmentMetadata[] {
  return candidates.filter(segment => {
    // Handle missing importanceScore (default to 0)
    const importance = segment.importanceScore ?? 0;
    return importance >= minScore;
  });
}
