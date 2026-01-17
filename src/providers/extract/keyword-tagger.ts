/**
 * Keyword Tagger Extract Provider
 * Extracts meaningful keywords from segment content and adds them to tags
 */

import type { ExtractProvider, ExtractError } from './interface';
import type { MemorySegment } from '../../types/segment';
import type { Result, HealthStatus } from '../../types/common';
import { extractKeywords } from '../../lib/keyword-extractor';

export class KeywordTaggerProvider implements ExtractProvider {
  readonly name = 'keyword-tagger';
  readonly version = '1.0.0';

  async initialize(): Promise<Result<void, ExtractError>> {
    return { ok: true, value: undefined };
  }

  async healthCheck(): Promise<HealthStatus> {
    return { healthy: true, message: 'Keyword tagger is operational' };
  }

  async shutdown(): Promise<void> {
    // No cleanup needed for this provider
  }

  async extract(segment: MemorySegment): Promise<Result<MemorySegment, ExtractError>> {
    try {
      // Handle empty or whitespace-only content
      if (!segment.content || segment.content.trim().length === 0) {
        // Return segment as-is with existing tags
        return { ok: true, value: segment };
      }

      // Extract keywords from content (max 10)
      const keywords = extractKeywords(segment.content, 10);

      // Merge with existing tags (from simple-extract or other providers)
      const existingTags = segment.tags || [];

      // Combine tags: existing tags first (prioritize), then new keywords (if space remains)
      const allTags = [...existingTags];

      for (const keyword of keywords) {
        // Skip if already exists (prevent duplicates)
        if (allTags.includes(keyword)) continue;

        // Add keyword if we're under the limit
        if (allTags.length < 10) {
          allTags.push(keyword);
        }
      }

      // Create enriched segment
      const enriched: MemorySegment = {
        ...segment,
        tags: allTags
      };

      console.error(`[Memory:KeywordTagger] Extracted ${keywords.length} keywords for segment ${segment.id}, total tags: ${allTags.length}`);
      return { ok: true, value: enriched };

    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'EXTRACT_KEYWORDS_FAILED',
          message: `Failed to extract keywords: ${(error as Error).message}`,
          cause: error as Error
        }
      };
    }
  }
}
