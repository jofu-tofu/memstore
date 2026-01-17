/**
 * Memory segment and session types for the PAI Memory System
 *
 * This module defines the core data structures for storing and retrieving
 * memory segments and session transcripts.
 */

/**
 * Classification of memory types based on cognitive psychology.
 *
 * - episodic: Event-based memories (e.g., "I helped user debug React hooks")
 * - semantic: Fact-based knowledge (e.g., "User prefers TypeScript over JavaScript")
 * - procedural: How-to knowledge (e.g., "Steps to deploy to production")
 */
export type MemoryType = 'episodic' | 'semantic' | 'procedural';

/**
 * Position range within a session transcript.
 *
 * Used to track where a segment originated in the original session.
 */
export interface SourceRange {
  /** Character offset where segment starts in transcript */
  start: number;

  /** Character offset where segment ends in transcript */
  end: number;
}

/**
 * Core memory segment with rich metadata.
 *
 * Segments are extracted from session transcripts and stored as markdown files
 * with YAML frontmatter containing all metadata fields.
 *
 * @example
 * ```yaml
 * ---
 * id: seg_1704567890123_a1b2c3d4
 * session_id: mem_1704567890123_e5f6g7h8
 * timestamp: 1704567890123
 * importance_score: 75
 * access_count: 0
 * last_accessed: null
 * tags: [typescript, memory-system]
 * memory_type: episodic
 * source_range:
 *   start: 0
 *   end: 1500
 * ---
 * This is the segment content extracted from the session.
 * It contains the actual conversation or knowledge to be remembered.
 * ```
 */
export interface MemorySegment {
  /**
   * Unique segment identifier.
   * Format: seg_{timestamp}_{random8hex}
   *
   * @example 'seg_1704567890123_a1b2c3d4'
   */
  id: string;

  /**
   * Session this segment was extracted from.
   * Format: mem_{timestamp}_{random8hex}
   *
   * @example 'mem_1704567890123_e5f6g7h8'
   */
  sessionId: string;

  /**
   * Creation timestamp in Unix milliseconds.
   *
   * @example 1704567890123
   */
  timestamp: number;

  /**
   * Importance score (0-100).
   *
   * Higher scores indicate more valuable memories that should be:
   * - Prioritized in retrieval
   * - Retained longer
   * - Surfaced more frequently
   *
   * Default: 0 (neutral importance)
   *
   * @example 75
   */
  importanceScore: number;

  /**
   * Number of times this segment has been retrieved.
   *
   * Used for usage tracking and importance reinforcement.
   *
   * Default: 0
   *
   * @example 5
   */
  accessCount: number;

  /**
   * Timestamp of last retrieval, or null if never retrieved.
   *
   * Used for recency scoring and decay calculations.
   *
   * @example 1704567890123 | null
   */
  lastAccessed: number | null;

  /**
   * Extracted keywords for search and retrieval.
   *
   * Tags are extracted during segment processing and used for keyword-based search.
   *
   * Default: []
   *
   * @example ['typescript', 'memory-system', 'hooks']
   */
  tags: string[];

  /**
   * Memory classification type.
   *
   * Default: 'episodic'
   *
   * @example 'episodic' | 'semantic' | 'procedural'
   */
  memoryType: MemoryType;

  /**
   * Source position in original session transcript.
   *
   * Tracks where this segment originated for debugging and traceability.
   *
   * @example { start: 0, end: 1500 }
   */
  sourceRange: SourceRange;

  /**
   * The actual content of the memory segment.
   *
   * This is the text that will be injected into context when the segment is retrieved.
   *
   * @example 'User prefers TypeScript with strict mode enabled...'
   */
  content: string;
}

/**
 * Session metadata for transcript storage.
 *
 * Optional fields for tracking session context and performance metrics.
 */
export interface SessionMetadata {
  /** Model used for the session (e.g., 'claude-sonnet-4.5') */
  model: string;

  /** Total tokens used in the session */
  totalTokens?: number;

  /** Session duration in milliseconds */
  duration?: number;
}

/**
 * Complete session transcript with metadata.
 *
 * Transcripts are the raw input to the segment extraction pipeline.
 *
 * @example
 * ```typescript
 * const transcript: SessionTranscript = {
 *   sessionId: 'mem_1704567890123_e5f6g7h8',
 *   timestamp: 1704567890123,
 *   content: 'Full conversation transcript...',
 *   metadata: {
 *     model: 'claude-sonnet-4.5',
 *     totalTokens: 15000,
 *     duration: 300000
 *   }
 * };
 * ```
 */
export interface SessionTranscript {
  /**
   * Unique session identifier.
   * Format: mem_{timestamp}_{random8hex}
   *
   * @example 'mem_1704567890123_e5f6g7h8'
   */
  sessionId: string;

  /**
   * Session start timestamp in Unix milliseconds.
   *
   * @example 1704567890123
   */
  timestamp: number;

  /**
   * Full session transcript content.
   *
   * @example 'User: How do I implement memory system?\nAssistant: ...'
   */
  content: string;

  /**
   * Optional session metadata for analytics and debugging.
   */
  metadata: SessionMetadata;
}
