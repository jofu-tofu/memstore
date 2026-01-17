import type { OrganizeProvider, OrganizeError } from './interface';
import type { MemorySegment } from '../../types/segment';
import type { Result, HealthStatus } from '../../types/common';

/**
 * FlatByDateOrganizeProvider - Organizes segments by date in flat structure
 *
 * Strategy:
 * - Returns path: segments/{YYYY-MM}/
 * - Simple flat organization by month
 * - MVP approach - defers complex retention logic to Story 1.8
 *
 * Future: Replace with hierarchical retention provider (short-term/, long-term/, archive/)
 */
export class FlatByDateOrganizeProvider implements OrganizeProvider {
  readonly name = 'flat-by-date';
  readonly version = '1.0.0';

  async initialize(): Promise<Result<void, ProviderError>> {
    return { ok: true, value: undefined };
  }

  async healthCheck(): Promise<HealthStatus> {
    return { healthy: true, message: 'Flat-by-date organizer operational' };
  }

  async shutdown(): Promise<void> {
    // No cleanup needed for this provider
  }

  /**
   * Determine storage path for a segment
   *
   * @param segment - Segment to organize
   * @returns Result with relative path (e.g., "segments/2026-01")
   */
  async organize(segment: MemorySegment): Promise<Result<string, OrganizeError>> {
    try {
      // Extract timestamp from segment
      const timestamp = segment.timestamp;

      // Validate timestamp - if invalid (0, negative, or missing), use current time
      if (!timestamp || timestamp <= 0) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const yearMonth = `${year}-${month}`;
        return { ok: true, value: `segments/${yearMonth}` };
      }

      // Convert Unix timestamp to YYYY-MM format
      const date = new Date(timestamp);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const yearMonth = `${year}-${month}`;

      // Return relative path from mem-store/ root (no trailing slash)
      return { ok: true, value: `segments/${yearMonth}` };

    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'ORGANIZE_PATH_FAILED',
          message: `Failed to organize segment by date: ${(error as Error).message}`,
          cause: error as Error
        }
      };
    }
  }
}
