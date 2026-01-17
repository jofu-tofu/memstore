/**
 * Extract Provider Interface for MemStore
 *
 * Defines the contract for extraction providers that extract and enrich
 * segment metadata (tags, keywords, entities, etc.).
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
 * @module providers/extract/interface
 * @version 1.0.0
 */

import type { Provider, ProviderError, Result } from '../../types/common';
import type { MemorySegment } from '../../types/segment';

/**
 * Error type for metadata extraction failures.
 *
 * ## Error Codes
 *
 * - **EXTRACT_FRONTMATTER_FAILED**: Failed to generate or parse frontmatter
 * - **EXTRACT_KEYWORDS_FAILED**: Keyword extraction algorithm failed
 * - **EXTRACT_INVALID_SEGMENT**: Segment is missing required fields (id, content)
 *
 * @example
 * ```typescript
 * const result = await extract.extract(segment);
 * if (!result.ok) {
 *   switch (result.error.code) {
 *     case 'EXTRACT_KEYWORDS_FAILED':
 *       console.error('Keyword extraction failed');
 *       break;
 *     case 'EXTRACT_INVALID_SEGMENT':
 *       console.error('Segment is missing required fields');
 *       break;
 *     default:
 *       console.error(`Extraction failed: ${result.error.message}`);
 *   }
 * }
 * ```
 */
export interface ExtractError extends ProviderError {
  code: 'EXTRACT_FRONTMATTER_FAILED' | 'EXTRACT_KEYWORDS_FAILED' | 'EXTRACT_INVALID_SEGMENT';
}

/**
 * Extract error code constants.
 *
 * Use these constants instead of hardcoding error strings to prevent typos.
 *
 * @example
 * ```typescript
 * import { EXTRACT_ERROR_CODES } from './interface';
 *
 * return {
 *   ok: false,
 *   error: {
 *     code: EXTRACT_ERROR_CODES.KEYWORDS_FAILED,
 *     message: 'Failed to extract keywords'
 *   }
 * };
 * ```
 */
export const EXTRACT_ERROR_CODES = {
  FRONTMATTER_FAILED: 'EXTRACT_FRONTMATTER_FAILED' as const,
  KEYWORDS_FAILED: 'EXTRACT_KEYWORDS_FAILED' as const,
  INVALID_SEGMENT: 'EXTRACT_INVALID_SEGMENT' as const,
} as const;

/**
 * Extract provider interface for extracting and enriching segment metadata.
 *
 * Implementations support different extraction strategies:
 * - **frontmatter-gen**: Sets core metadata fields with defaults
 * - **keyword-tagger**: Sophisticated keyword extraction (Story 1.7)
 * - **entity-extractor**: Named entity recognition - people, places, etc. (future)
 *
 * ## What Metadata Fields Are Extracted
 *
 * The extract() method enriches these segment fields:
 * - **tags**: Array of keywords/topics extracted from content
 * - **memoryType**: Classification (episodic, semantic, procedural)
 * - **importanceScore**: Calculated importance (0-100)
 * - Custom metadata fields (implementation-specific)
 *
 * Other fields (id, content, timestamp, etc.) are preserved unchanged.
 *
 * @example
 * ```typescript
 * const extract: ExtractProvider = new KeywordTagger();
 * await extract.initialize();
 *
 * const segment: MemorySegment = {
 *   id: 'seg_1704912345000_a1b2c3d4',
 *   content: 'The TypeScript provider system uses interfaces...',
 *   tags: [],  // Will be enriched
 *   // ... other fields
 * };
 *
 * const result = await extract.extract(segment);
 * if (result.ok) {
 *   console.log(`Tags: ${result.value.tags.join(', ')}`);
 *   console.log(`Type: ${result.value.memoryType}`);
 *   console.log(`Importance: ${result.value.importanceScore}`);
 * }
 * ```
 */
export interface ExtractProvider extends Provider {
  /**
   * Extract metadata and enrich a memory segment.
   *
   * This method enriches the segment with extracted metadata:
   * - **tags**: Keywords/topics from content analysis
   * - **memoryType**: Classification (episodic/semantic/procedural)
   * - **importanceScore**: Calculated relevance score (0-100)
   *
   * ## Behavior by Implementation Strategy
   *
   * **frontmatter-gen**:
   * - Sets default values for all metadata fields
   * - memoryType: defaults to 'episodic'
   * - importanceScore: defaults to 50
   * - tags: empty array
   *
   * **keyword-tagger** (current, Story 1.7):
   * - Extracts keywords using TF-IDF and scoring
   * - Filters common words (stopwords)
   * - Ranks by relevance and frequency
   * - Returns top N keywords as tags
   *
   * **entity-extractor** (future):
   * - Uses NER (Named Entity Recognition)
   * - Extracts people, places, organizations
   * - Structured metadata with entity types
   *
   * @param segment - The segment to enrich with metadata (must have id and content)
   * @returns Result containing enriched segment with metadata, or error
   *
   * @example
   * ```typescript
   * const segment: MemorySegment = {
   *   id: 'seg_1704912345000_a1b2c3d4',
   *   sessionId: 'mem_1704912340000_b2c3d4e5',
   *   timestamp: 1704912345000,
   *   content: 'The memory system implements a provider-based architecture. ' +
   *            'Storage providers handle persistence, search providers handle ' +
   *            'querying, and extract providers handle metadata extraction.',
   *   tags: [],
   *   memoryType: 'episodic',
   *   importanceScore: 0,
   *   // ... other fields
   * };
   *
   * const result = await extract.extract(segment);
   * if (result.ok) {
   *   // result.value is the enriched segment
   *   console.log(`Extracted tags: ${result.value.tags.join(', ')}`);
   *   // "memory, system, provider, architecture, storage, search, extraction"
   *
   *   console.log(`Memory type: ${result.value.memoryType}`);
   *   // "episodic" or "semantic" or "procedural"
   *
   *   console.log(`Importance: ${result.value.importanceScore}`);
   *   // 0-100 score based on content analysis
   * }
   * ```
   */
  extract(segment: MemorySegment): Promise<Result<MemorySegment, ExtractError>>;
}
