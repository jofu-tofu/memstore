/**
 * Memory System Hook Entry Points
 *
 * These hooks integrate with Claude Code's lifecycle events.
 *
 * @module hooks
 */

// Hook entry points are meant to be run directly, not imported
// Export path references for configuration
export const HOOK_PATHS = {
  capture: './capture.ts',
  retrieve: './retrieve.ts',
  processQueue: './process-queue.ts'
} as const;
