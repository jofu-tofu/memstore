/**
 * Directory management utilities for memory system
 * Ensures required directories exist before operations
 */

import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface Result<T, E> {
  ok: true;
  value: T;
}

export interface ResultError<E> {
  ok: false;
  error: E;
}

export type ResultType<T, E> = Result<T, E> | ResultError<E>;

export interface StorageError {
  /** Error name for Error interface compatibility (default: 'StorageError') */
  name: string;
  code: string;
  message: string;
  cause?: Error;
}

/**
 * Get PAI directory from env or fallback to ~/pai
 */
export function getPaiDir(): string {
  return process.env.PAI_DIR || join(homedir(), 'pai');
}

/**
 * Ensure all required memory store directories exist
 * Creates directories if missing, returns error if creation fails
 *
 * @param paiDir - Optional PAI directory (uses env/default if not provided)
 * @returns Result indicating success or failure
 */
export function ensureMemStoreDirectories(
  paiDir?: string
): ResultType<void, StorageError> {
  try {
    const baseDir = paiDir || getPaiDir();
    const memStore = join(baseDir, 'mem-store');

    // Required directory structure
    const dirs = [
      memStore,
      join(memStore, 'segments'),
      join(memStore, 'structured'),
      join(memStore, 'indexes', 'keyword'),
      join(memStore, 'queue'),
      join(memStore, 'metrics'),
      join(memStore, 'cache')
    ];

    // Create each directory (recursive to handle nested paths)
    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    return { ok: true, value: undefined };
  } catch (error) {
    return {
      ok: false,
      error: {
        name: 'StorageError',
        code: 'STORAGE_INIT_FAILED',
        message: `Failed to create memory directories: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined
      }
    };
  }
}
