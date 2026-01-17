/**
 * MemStore - Memory System for Claude Code
 *
 * A modular memory system with pluggable providers for storage,
 * search, segmentation, extraction, and summarization.
 *
 * @module memstore
 *
 * @example
 * ```typescript
 * import { retrieveMemories, SegmentApi } from 'memstore';
 *
 * // Retrieve relevant memories for a query
 * const result = await retrieveMemories('user preferences', {
 *   maxResults: 10,
 *   filters: { recency: '7d' }
 * });
 *
 * // Programmatic segment management
 * const api = new SegmentApi();
 * await api.initialize();
 * await api.addSegment({ content: 'User prefers TypeScript' });
 * ```
 */

// Core functionality
export {
  // Configuration
  getMemoryConfig,
  getDebugMode,
  type MemoryConfig,

  // Retrieval
  retrieveMemories,
  type RetrievalOptions,

  // Context formatting
  formatMemoryContext,

  // Pipeline
  processPipeline,
  loadPipelineProviders,

  // Provider registry
  ProviderRegistry,
  globalProviderRegistry,
  type Provider,

  // Filters and ranking
  applyFilters,
  rankResults,

  // Lifecycle
  identifyDecayCandidates,
  generateDecayReport,

  // Experiments
  getActiveExperiment,
  selectVariant,
  validateExperimentProvider
} from './core';

// Public API
export {
  SegmentApi,
  type SegmentError,
  type SummarizeOptions
} from './api';

// Types
export type {
  Result,
  MemorySegment,
  SessionMetadata,
  FilterOptions,
  RankedResult,
  RankingOptions
} from './types';

// Library utilities (selective exports)
export {
  generateSessionId,
  generateSegmentId,
  ensureMemStoreDirectories,
  findSegmentsByKeywords,
  readSegment,
  estimateTokens
} from './lib';
