// Recency filtering for search results
// Filters segments by timestamp within specified duration

import { SegmentMetadata } from '../../types/filters';

function parseRecency(recencyStr: string): number | null {
  const match = recencyStr.match(/^(\d+)([dh])$/);

  if (!match) {
    console.error(`[Memory:Filters] Invalid recency format: ${recencyStr}`);
    return null;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const now = Date.now();

  switch (unit) {
    case 'd': // days
      return now - (value * 24 * 60 * 60 * 1000);
    case 'h': // hours
      return now - (value * 60 * 60 * 1000);
    default:
      return null;
  }
}

export function filterByRecency(
  candidates: SegmentMetadata[],
  recency: string
): SegmentMetadata[] {
  const cutoff = parseRecency(recency);

  if (cutoff === null) {
    // Invalid format - return all candidates (no filtering)
    return candidates;
  }

  return candidates.filter(segment => segment.timestamp >= cutoff);
}
