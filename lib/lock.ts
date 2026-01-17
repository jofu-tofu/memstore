import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { hostname } from 'os';
import type { Result } from '../types/common';

interface LockData {
  pid: number;
  started: number;
  hostname: string;
}

/**
 * Attempts to acquire a lock file.
 * Stale locks (older than staleMs) are automatically overwritten.
 *
 * @param lockPath - Path to lock file
 * @param staleMs - Lock age in milliseconds before considered stale (typically 60000)
 * @returns Result with true if lock acquired, false if held by another process, or error
 */
export function acquireLock(lockPath: string, staleMs: number): Result<boolean, Error> {
  try {
    // Check if lock exists
    if (existsSync(lockPath)) {
      try {
        const lockData: LockData = JSON.parse(readFileSync(lockPath, 'utf-8'));
        const age = Date.now() - lockData.started;

        // Lock is NOT stale - return false
        if (age < staleMs) {
          return { ok: true, value: false };
        }

        // Lock IS stale - will overwrite below
      } catch (error) {
        // Invalid lock file, overwrite it
        console.error(`[Memory:Lock] Invalid lock file, overwriting: ${error}`);
      }
    }

    // Create new lock
    const lockData: LockData = {
      pid: process.pid,
      started: Date.now(),
      hostname: hostname()
    };

    writeFileSync(lockPath, JSON.stringify(lockData, null, 2), 'utf-8');
    return { ok: true, value: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

/**
 * Releases a lock by deleting the lock file.
 * Safe to call even if lock doesn't exist.
 *
 * @param lockPath - Path to lock file
 * @returns Result indicating success or error
 */
export function releaseLock(lockPath: string): Result<void, Error> {
  try {
    if (existsSync(lockPath)) {
      unlinkSync(lockPath);
    }
    return { ok: true, value: undefined };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

/**
 * Checks if a processor is currently running (lock exists and is not stale).
 *
 * @param lockPath - Path to lock file
 * @param staleMs - Lock age in milliseconds before considered stale
 * @returns Result with true if processor is running (fresh lock exists), false otherwise, or error
 */
export function isProcessorRunning(lockPath: string, staleMs: number): Result<boolean, Error> {
  try {
    if (!existsSync(lockPath)) {
      return { ok: true, value: false };
    }

    try {
      const lockData: LockData = JSON.parse(readFileSync(lockPath, 'utf-8'));
      const age = Date.now() - lockData.started;

      return { ok: true, value: age < staleMs };
    } catch (error) {
      // Invalid lock file
      console.error(`[Memory:Lock] Invalid lock file in isProcessorRunning: ${error}`);
      return { ok: true, value: false };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}
