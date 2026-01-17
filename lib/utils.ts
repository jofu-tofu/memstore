/**
 * Shared utility functions for the PAI Memory System
 */

import { join } from 'path';
import { homedir } from 'os';

/**
 * Get the PAI directory path.
 * Uses PAI_DIR environment variable if set, otherwise defaults to ~/pai
 *
 * @returns Absolute path to PAI directory
 *
 * @example
 * ```typescript
 * const paiDir = getPaiDir();
 * // Returns: /home/user/pai (or value of PAI_DIR env var)
 * ```
 */
export function getPaiDir(): string {
  return process.env.PAI_DIR || join(homedir(), 'pai');
}
