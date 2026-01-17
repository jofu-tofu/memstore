/**
 * Library Utilities Module
 *
 * Shared utilities for the memory system.
 *
 * @module lib
 */

// ID generation
export { generateSessionId, generateSegmentId } from './id-generator';

// Locking
export { acquireLock, releaseLock, isProcessorRunning } from './lock';

// Directory utilities
export { ensureMemStoreDirectories, getMemstoreDir } from './directory-utils';

// Usage tracking
export { updateUsageSignals, getUsageStats, resetStorageInstance } from './usage-tracker';
export type { UsageError, UsageStatsResult } from './usage-tracker';

// Retention policy
export { RetentionPolicyChecker } from './retention-policy';
export type { RetentionConfig, SessionEntry, RetentionCheckResult } from './retention-policy';

// Segment operations
export {
  loadKeywordIndex,
  findSegmentsByKeyword,
  findSegmentsByKeywords,
  findStaleSegments,
  findNeverAccessedSegments,
  findStaleSessions,
  clearKeywordIndexCache
} from './segment-search';
export type { KeywordIndex, SegmentMatch, StaleSegment, StaleSession } from './segment-search';

export { getSegmentPath, readSegment, readSessionSegments } from './segment-reader';

// Frontmatter
export { parseFrontmatter, serializeFrontmatter } from './frontmatter';

// Keyword extraction
export { extractKeywords } from './keyword-extractor';
export type { KeywordScore } from './keyword-extractor';

// Metadata
export { loadSegmentMetadata } from './metadata-loader';
export {
  listAllSessions,
  getSessionById,
  getSegmentMetadata,
  findSegmentsByTag,
  getTagIndex,
  formatSessionList,
  formatSegmentMetadata,
  formatTagIndex
} from './metadata-browser';
export type { SessionMeta, TagIndex, BrowserError } from './metadata-browser';

// Registry query
export {
  loadRegistry,
  querySessionsByDate,
  querySessionsByTag,
  clearRegistryCache
} from './registry-query';

// Debug utilities
export { debugLog, isDebugEnabled, initDebugCache, clearDebugCache } from './debug-utils';

// Re-export sub-modules
export * from './formatting';
export * from './logging';
export * from './scoring';
export * from './analytics';
