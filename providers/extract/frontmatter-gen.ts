import type { ExtractProvider, ExtractError } from './interface';
import type { MemorySegment } from '../../types/segment';
import type { Result } from '../../types/result';
import type { ProviderError, HealthStatus } from '../../types/provider';

/**
 * FrontmatterGenProvider - Ensures all required frontmatter fields are present with defaults
 *
 * Responsibility:
 * - Validates and sets core metadata fields (id, sessionId, timestamp, etc.)
 * - Applies defaults for optional fields (importanceScore, accessCount, lastAccessed)
 * - Ensures consistent structure across all segments
 *
 * Note: Most fields are already set by segmentation provider, this ensures completeness
 */
export class FrontmatterGenProvider implements ExtractProvider {
  readonly name = 'frontmatter-gen';
  readonly version = '1.0.0';

  async initialize(): Promise<Result<void, ProviderError>> {
    return { ok: true, value: undefined };
  }

  async healthCheck(): Promise<HealthStatus> {
    return { healthy: true };
  }

  async shutdown(): Promise<void> {
    // No cleanup needed
  }

  /**
   * Extract and enrich frontmatter metadata
   *
   * @param segment - Segment to enrich
   * @returns Result with enriched MemorySegment
   */
  async extract(segment: MemorySegment): Promise<Result<MemorySegment, ExtractError>> {
    try {
      // Ensure all required fields are present with defaults
      const enriched: MemorySegment = {
        ...segment,
        // Core identifiers (should already be set, but validate)
        id: segment.id,
        sessionId: segment.sessionId,
        timestamp: segment.timestamp || Date.now(),

        // Metadata defaults
        importanceScore: segment.importanceScore ?? 0,
        accessCount: segment.accessCount ?? 0,
        lastAccessed: segment.lastAccessed ?? null,
        tags: segment.tags ?? [],

        // Memory type (should be set by segmentation)
        memoryType: segment.memoryType || 'episodic',

        // Source range (should be set by segmentation)
        sourceRange: segment.sourceRange || { start: 0, end: 0 },

        // Content (required)
        content: segment.content
      };

      return { ok: true, value: enriched };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'EXTRACT_FRONTMATTER_FAILED',
          message: `Failed to generate frontmatter: ${(error as Error).message}`,
          cause: error as Error
        }
      };
    }
  }
}
