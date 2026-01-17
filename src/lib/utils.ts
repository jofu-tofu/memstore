/**
 * Shared utility functions for the MemStore Memory System
 */

import { join } from 'path';
import { homedir } from 'os';

/**
 * Get the MemStore directory path.
 * Uses MEMSTORE_DIR environment variable if set, otherwise defaults to ~/.memstore
 *
 * @returns Absolute path to MemStore directory
 *
 * @example
 * ```typescript
 * const memstoreDir = getMemstoreDir();
 * // Returns: /home/user/.memstore (or value of MEMSTORE_DIR env var)
 * ```
 */
export function getMemstoreDir(): string {
  return process.env.MEMSTORE_DIR || join(homedir(), '.memstore');
}
