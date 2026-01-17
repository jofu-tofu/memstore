import type { SummarizeProvider, SummarizeError } from './interface';
import type { MemorySegment } from '../../types/segment';
import type { Result, ProviderError, HealthStatus } from '../../types/common';

/**
 * SimpleExtractProvider - Basic summarization using text extraction
 *
 * Strategy:
 * - Extracts first meaningful sentence as summary
 * - Identifies capitalized words and technical terms as keywords
 * - No LLM calls (fast, deterministic, no API dependencies)
 *
 * Future: Replaced/augmented by LLM-based summarization for better quality
 */
export class SimpleExtractProvider implements SummarizeProvider {
  readonly name = 'simple-extract';
  readonly version = '1.0.0';

  async initialize(): Promise<Result<void, ProviderError>> {
    return { ok: true, value: undefined };
  }

  async healthCheck(): Promise<HealthStatus> {
    return {
      healthy: true,
      message: 'Simple extract provider is operational'
    };
  }

  async shutdown(): Promise<Result<void, ProviderError>> {
    // No cleanup needed
    return { ok: true, value: undefined };
  }

  /**
   * Summarize a memory segment
   *
   * @param segment - Segment to summarize
   * @returns Result with summarized MemorySegment
   */
  async summarize(segment: MemorySegment): Promise<Result<MemorySegment, SummarizeError>> {
    try {
      // Extract first meaningful sentence as summary
      const summary = this.extractFirstSentence(segment.content);

      // Extract key noun phrases as initial tags
      const extractedTags = this.extractKeywords(segment.content);

      // Merge existing tags with extracted tags (deduplicate, limit to 10)
      const allTags = [...new Set([...segment.tags, ...extractedTags])].slice(0, 10);

      const summarized: MemorySegment = {
        ...segment,
        summary,
        tags: allTags
      };

      return { ok: true, value: summarized };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'SUMMARIZE_EXTRACTION_FAILED',
          message: `Failed to summarize segment: ${(error as Error).message}`,
          cause: error as Error
        }
      };
    }
  }

  /**
   * Extract first sentence from text
   *
   * @param text - Text to extract from
   * @returns First sentence or first 100 chars
   */
  private extractFirstSentence(text: string): string {
    // Find first sentence (up to . ! ?)
    const match = text.match(/^[^.!?]+[.!?]/);
    if (match) {
      return match[0].trim();
    }

    // Fallback: first 100 chars
    return text.substring(0, 100).trim() + (text.length > 100 ? '...' : '');
  }

  /**
   * Extract keywords from text
   *
   * Strategy:
   * - Find capitalized words (likely proper nouns or technical terms)
   * - Find words with special characters (camelCase, snake_case, etc.)
   * - Skip short words (< 4 chars)
   * - Deduplicate and limit to 5 keywords
   *
   * @param text - Text to extract keywords from
   * @returns Array of keywords (lowercase)
   */
  private extractKeywords(text: string): string[] {
    const words = text.split(/\s+/);
    const keywords: string[] = [];

    for (const word of words) {
      // Clean word (remove punctuation from edges)
      const cleaned = word.replace(/^[^\w]+|[^\w]+$/g, '');

      // Skip short words
      if (cleaned.length < 4) continue;

      // Keep capitalized words (likely proper nouns or technical terms)
      if (/^[A-Z]/.test(cleaned)) {
        keywords.push(cleaned.toLowerCase());
        continue;
      }

      // Keep words with special characters (camelCase, snake_case, kebab-case)
      if (/[A-Z_-]/.test(cleaned) && cleaned.length > 3) {
        keywords.push(cleaned.toLowerCase());
      }
    }

    // Deduplicate and limit to 5 keywords
    return [...new Set(keywords)].slice(0, 5);
  }
}
