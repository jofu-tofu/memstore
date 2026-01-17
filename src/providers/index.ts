/**
 * Provider Implementations Module
 *
 * Memory system provider implementations.
 *
 * @module providers
 */

// Storage providers
export { FileBackend } from './storage/file-backend';
export type { StorageProvider, StorageConfig } from './storage/interface';

// Search providers
export { KeywordSearch } from './search/keyword-search';
export type { SearchProvider, SearchConfig } from './search/interface';

// Segment providers
export { PerMessageSegmenter } from './segment/per-message';
export type { SegmentProvider, SegmentConfig } from './segment/interface';

// Extract providers
export { KeywordTagger } from './extract/keyword-tagger';
export { FrontmatterGen } from './extract/frontmatter-gen';
export type { ExtractProvider, ExtractConfig } from './extract/interface';

// Summarize providers
export { SimpleExtract } from './summarize/simple-extract';
export type { SummarizeProvider, SummarizeConfig } from './summarize/interface';

// Organize providers
export { FlatByDate } from './organize/flat-by-date';
export type { OrganizeProvider, OrganizeConfig } from './organize/interface';

// Test harness
export * from './test-harness';
