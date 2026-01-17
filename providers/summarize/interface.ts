/**
 * Summarize Provider Interface for the PAI Memory System
 *
 * Defines the contract for summarization providers that generate concise summaries
 * and extract tags from memory segments.
 *
 * ## Version Stability Commitment
 *
 * This interface follows semantic versioning (SemVer):
 * - **Major version (X.0.0)**: Breaking changes (method signature changes, removed methods)
 * - **Minor version (1.X.0)**: Backward-compatible additions (new optional methods/parameters)
 * - **Patch version (1.0.X)**: Documentation improvements and clarifications
 *
 * **Current version: 1.0.0**
 *
 * We commit to:
 * 1. No breaking changes within a major version
 * 2. Deprecation warnings at least 1 minor version before removal
 * 3. Migration guides for all breaking changes
 * 4. Backward compatibility for all minor/patch versions
 *
 * @module providers/summarize/interface
 * @version 1.0.0
 */

import type { Provider, ProviderError, Result } from '../../types/common';
import type { MemorySegment } from '../../types/segment';

/**
 * Error type for summarization failures.
 *
 * ## Error Codes
 *
 * - **SUMMARIZE_EXTRACTION_FAILED**: Failed to extract summary from segment content
 * - **SUMMARIZE_LLM_FAILED**: LLM API call failed (for LLM-based summarization)
 * - **SUMMARIZE_INVALID_SEGMENT**: Segment is missing required fields (id, content)
 *
 * @example
 * ```typescript
 * const result = await summarize.summarize(segment);
 * if (!result.ok) {
 *   switch (result.error.code) {
 *     case 'SUMMARIZE_EXTRACTION_FAILED':
 *       console.error('Could not extract summary from content');
 *       break;
 *     case 'SUMMARIZE_INVALID_SEGMENT':
 *       console.error('Segment is missing required fields');
 *       break;
 *     default:
 *       console.error(`Summarization failed: ${result.error.message}`);
 *   }
 * }
 * ```
 */
export interface SummarizeError extends ProviderError {
  code: 'SUMMARIZE_EXTRACTION_FAILED' | 'SUMMARIZE_LLM_FAILED' | 'SUMMARIZE_INVALID_SEGMENT';
}

/**
 * Summarize error code constants.
 *
 * Use these constants instead of hardcoding error strings to prevent typos.
 *
 * @example
 * ```typescript
 * import { SUMMARIZE_ERROR_CODES } from './interface';
 *
 * return {
 *   ok: false,
 *   error: {
 *     code: SUMMARIZE_ERROR_CODES.EXTRACTION_FAILED,
 *     message: 'Failed to extract summary'
 *   }
 * };
 * ```
 */
export const SUMMARIZE_ERROR_CODES = {
  EXTRACTION_FAILED: 'SUMMARIZE_EXTRACTION_FAILED' as const,
  LLM_FAILED: 'SUMMARIZE_LLM_FAILED' as const,
  INVALID_SEGMENT: 'SUMMARIZE_INVALID_SEGMENT' as const,
} as const;

/**
 * Summarize provider interface for generating summaries and tags.
 *
 * Implementations support different summarization strategies:
 * - **simple-extract**: First sentence + basic keyword extraction (MVP, Story 2.5)
 * - **llm-summarize**: LLM-based abstractive summarization (future)
 * - **abstractive**: Advanced neural summarization models (future)
 *
 * ## What Fields Are Enriched
 *
 * The summarize() method enriches these segment fields:
 * - **summary**: A concise 1-2 sentence summary of the segment content
 * - **tags**: Array of relevant keywords/topics extracted from content
 *
 * Other fields (id, content, timestamp, etc.) are preserved unchanged.
 *
 * @example
 * ```typescript
 * const summarize: SummarizeProvider = new SimpleExtract();
 * await summarize.initialize();
 *
 * const segment: MemorySegment = {
 *   id: 'seg_1704912345000_a1b2c3d4',
 *   content: 'The TypeScript hooks system provides...',
 *   // ... other fields
 * };
 *
 * const result = await summarize.summarize(segment);
 * if (result.ok) {
 *   console.log(`Summary: ${result.value.summary}`);
 *   console.log(`Tags: ${result.value.tags.join(', ')}`);
 * }
 * ```
 */
export interface SummarizeProvider extends Provider {
  /**
   * Generate a summary and extract tags from a memory segment.
   *
   * This method enriches the segment with:
   * - **summary**: Concise 1-2 sentence summary of segment content
   * - **tags**: Array of relevant keywords/topics
   *
   * ## Behavior by Implementation Strategy
   *
   * **simple-extract** (current):
   * - Summary: First sentence of content (up to 150 chars)
   * - Tags: Simple keyword extraction (common words, technical terms)
   *
   * **llm-summarize** (future):
   * - Summary: LLM-generated abstractive summary
   * - Tags: LLM-extracted topics and entities
   *
   * @param segment - The segment to summarize (must have id and content)
   * @returns Result containing enriched segment with summary and tags, or error
   *
   * @example
   * ```typescript
   * const segment: MemorySegment = {
   *   id: 'seg_1704912345000_a1b2c3d4',
   *   sessionId: 'mem_1704912340000_b2c3d4e5',
   *   timestamp: 1704912345000,
   *   content: 'The memory system uses a provider-based architecture. ' +
   *            'Each provider implements a specific interface for storage, ' +
   *            'search, or extraction functionality.',
   *   tags: [],  // Will be enriched
   *   // ... other fields
   * };
   *
   * const result = await summarize.summarize(segment);
   * if (result.ok) {
   *   // result.value is the enriched segment
   *   console.log(`Summary: ${result.value.summary}`);
   *   // "The memory system uses a provider-based architecture."
   *
   *   console.log(`Tags: ${result.value.tags.join(', ')}`);
   *   // "memory, system, provider, architecture, interface"
   * }
   * ```
   */
  summarize(segment: MemorySegment): Promise<Result<MemorySegment, SummarizeError>>;
}
