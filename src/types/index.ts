/**
 * Types module for MemStore
 *
 * This module re-exports all core types for convenient importing.
 *
 * @example
 * ```typescript
 * // Import from index
 * import type { Result, Provider, MemorySegment } from './types';
 *
 * // Or import from specific modules
 * import type { Result } from './types/common';
 * import type { MemorySegment } from './types/segment';
 * ```
 */

// Re-export all types from common
export type { Result, Provider, ProviderError, HealthStatus } from './common';

// Re-export all types from segment
export type {
  MemoryType,
  SourceRange,
  MemorySegment,
  SessionMetadata,
  SessionTranscript
} from './segment';

// Re-export all types from filters
export type {
  FilterOptions,
  SegmentMetadata,
  FilterResult,
  FilterError
} from './filters';

// Re-export all types from ranking
export type {
  RankingOptions,
  RankedResult,
  RankingError,
  ScoringComponents
} from './ranking';
