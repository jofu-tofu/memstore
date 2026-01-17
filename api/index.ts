/**
 * Memory Segment API
 *
 * Public API for programmatic memory segment manipulation.
 * Enables create, update, delete, and summarization operations
 * outside the normal capture flow.
 *
 * @module api
 * @see Story 5.1 - Segment CRUD API
 *
 * @example
 * ```typescript
 * import { SegmentApi } from './api';
 *
 * const api = new SegmentApi();
 * await api.initialize();
 *
 * const result = await api.addSegment({
 *   sessionId: 'mem_001',
 *   content: 'User prefers TypeScript',
 *   tags: ['preference'],
 *   memoryType: 'semantic',
 *   sourceRange: { start: 0, end: 100 }
 * });
 * ```
 */

export { SegmentApi } from './segment-api';
export type {
  SegmentError,
  SummarizeOptions,
  Entity,
  Relation
} from './segment-api';
