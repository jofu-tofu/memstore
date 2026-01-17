/**
 * Segment Provider Interface for the PAI Memory System
 *
 * Defines the contract for segmentation providers that split session transcripts
 * into individual memory segments.
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
 * @module providers/segment/interface
 * @version 1.0.0
 */

import type { Provider, ProviderError, Result } from '../../types/common';
import type { MemorySegment } from '../../types/segment';

/**
 * Error type for segmentation failures.
 *
 * ## Error Codes
 *
 * - **SEGMENT_EXTRACTION_FAILED**: Failed to parse or segment the transcript
 * - **SEGMENT_INVALID_TRANSCRIPT**: Transcript is invalid (null, not a string, malformed)
 *
 * @example
 * ```typescript
 * const result = await segment.segment(transcript, sessionId);
 * if (!result.ok) {
 *   switch (result.error.code) {
 *     case 'SEGMENT_EXTRACTION_FAILED':
 *       console.error('Failed to parse transcript');
 *       break;
 *     case 'SEGMENT_INVALID_TRANSCRIPT':
 *       console.error('Transcript format is invalid');
 *       break;
 *     default:
 *       console.error(`Segmentation failed: ${result.error.message}`);
 *   }
 * }
 * ```
 */
export interface SegmentError extends ProviderError {
  code: 'SEGMENT_EXTRACTION_FAILED' | 'SEGMENT_INVALID_TRANSCRIPT';
}

/**
 * Segment error code constants.
 *
 * Use these constants instead of hardcoding error strings to prevent typos.
 *
 * @example
 * ```typescript
 * import { SEGMENT_ERROR_CODES } from './interface';
 *
 * return {
 *   ok: false,
 *   error: {
 *     code: SEGMENT_ERROR_CODES.EXTRACTION_FAILED,
 *     message: 'Failed to segment transcript'
 *   }
 * };
 * ```
 */
export const SEGMENT_ERROR_CODES = {
  EXTRACTION_FAILED: 'SEGMENT_EXTRACTION_FAILED' as const,
  INVALID_TRANSCRIPT: 'SEGMENT_INVALID_TRANSCRIPT' as const,
} as const;

/**
 * Segment provider interface for splitting transcripts into memory segments.
 *
 * Implementations support different segmentation strategies:
 * - **per-message**: One segment per user/assistant turn pair (current, Story 1.6)
 * - **semantic**: Group messages by topic/context boundaries (future)
 * - **time-based**: Split by time intervals (e.g., 5-minute chunks) (future)
 *
 * @example
 * ```typescript
 * const segment: SegmentProvider = new PerMessage();
 * await segment.initialize();
 *
 * const transcript = '...<user>...</user><assistant>...</assistant>...';
 * const result = await segment.segment(transcript, 'mem_1704912340000_b2c3d4e5');
 *
 * if (result.ok) {
 *   console.log(`Created ${result.value.length} segments`);
 *   result.value.forEach(seg => {
 *     console.log(`${seg.id}: ${seg.content.substring(0, 50)}...`);
 *   });
 * }
 * ```
 */
export interface SegmentProvider extends Provider {
  /**
   * Split a session transcript into individual memory segments.
   *
   * ## Behavior by Implementation Strategy
   *
   * **per-message** (current):
   * - Splits on `<user>` and `<assistant>` XML tags
   * - Each user/assistant exchange becomes one segment
   * - Preserves message boundaries exactly
   *
   * **semantic** (future):
   * - Groups related messages by topic
   * - Uses embeddings or keyword clustering
   * - May span multiple user/assistant turns
   *
   * **time-based** (future):
   * - Splits by fixed time intervals
   * - May split mid-conversation
   * - Good for continuous logging scenarios
   *
   * ## Return Value
   *
   * Returns array of MemorySegment objects:
   * - **Empty array** for empty transcript (not an error)
   * - Each segment has unique ID, timestamp, content, sourceRange
   * - Segments are ordered chronologically
   *
   * @param transcript - Full session transcript text to segment
   * @param sessionId - Parent session identifier (e.g., 'mem_1704912340000_b2c3d4e5')
   * @returns Result containing array of segments (empty for empty transcript), or error
   *
   * @example
   * ```typescript
   * const transcript = `
   *   <user>How do I implement a storage provider?</user>
   *   <assistant>To implement a storage provider, you need to...</assistant>
   *   <user>What about error handling?</user>
   *   <assistant>Error handling should use Result types...</assistant>
   * `;
   *
   * const result = await segment.segment(transcript, 'mem_1704912340000_b2c3d4e5');
   *
   * if (result.ok) {
   *   // result.value is array of MemorySegments
   *   console.log(`Created ${result.value.length} segments`); // "Created 2 segments"
   *
   *   for (const seg of result.value) {
   *     console.log(`\n${seg.id}:`);
   *     console.log(`  Content: ${seg.content.substring(0, 100)}...`);
   *     console.log(`  Range: ${seg.sourceRange.start}-${seg.sourceRange.end}`);
   *   }
   * }
   *
   * // Empty transcript returns empty array (not error)
   * const emptyResult = await segment.segment('', 'mem_1704912340000_b2c3d4e5');
   * if (emptyResult.ok) {
   *   console.log(`Segments: ${emptyResult.value.length}`); // "Segments: 0"
   * }
   * ```
   */
  segment(transcript: string, sessionId: string): Promise<Result<MemorySegment[], SegmentError>>;
}
