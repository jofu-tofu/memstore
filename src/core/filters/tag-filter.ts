// Tag filtering for search results
// Filters segments by tags using OR logic within tags

import { SegmentMetadata } from '../../types/filters';

export function filterByTags(
  candidates: SegmentMetadata[],
  filterTags: string[]
): SegmentMetadata[] {
  if (!filterTags || filterTags.length === 0) {
    return candidates; // No tag filter specified
  }

  // Keep segments that have AT LEAST ONE of the filter tags (OR logic)
  return candidates.filter(segment =>
    filterTags.some(filterTag => segment.tags.includes(filterTag))
  );
}
