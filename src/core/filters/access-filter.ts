// Access count filtering for search results
// Filters segments by minimum access count

import { SegmentMetadata } from '../../types/filters';

export function filterByAccessCount(
  candidates: SegmentMetadata[],
  minCount: number
): SegmentMetadata[] {
  return candidates.filter(segment => {
    // Handle missing accessCount (default to 0)
    const accessCount = segment.accessCount ?? 0;
    return accessCount >= minCount;
  });
}
