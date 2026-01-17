/**
 * Debug Utilities for Memory System Diagnostics
 *
 * Provides debug logging helpers for retrieval pipeline diagnostics (Story 4.6.2).
 * All logging is controlled by the memory.debug config flag.
 */

import { getDebugMode } from '../core/config';

/**
 * Cached debug mode value to avoid repeated async config reads
 * Initialized on first call (lazy loading)
 */
let debugModeCache: boolean | null = null;
let cacheInitPromise: Promise<boolean> | null = null;

/**
 * Initialize debug mode cache asynchronously
 * Uses a shared promise to avoid multiple concurrent config reads
 *
 * This should be called at module initialization to pre-warm the cache.
 */
export async function initDebugCache(): Promise<void> {
  if (debugModeCache !== null) {
    return; // Already initialized
  }

  if (cacheInitPromise === null) {
    cacheInitPromise = getDebugMode();
  }

  debugModeCache = await cacheInitPromise;
  cacheInitPromise = null;
}

/**
 * Check if debug mode is enabled (synchronous, O(1))
 *
 * Returns cached value for zero-overhead checking.
 * If cache not initialized, returns false (safe default).
 *
 * Call initDebugCache() at module initialization to pre-warm cache.
 *
 * @returns true if debug mode enabled, false otherwise
 *
 * @example
 * ```typescript
 * if (isDebugEnabled()) {
 *   // Expensive debug computation
 *   const details = generateDetailedDiagnostics();
 *   debugLog('Component', details);
 * }
 * ```
 */
export function isDebugEnabled(): boolean {
  // Return false if cache not initialized (safe default)
  return debugModeCache ?? false;
}

/**
 * Log debug message to stderr if debug mode is enabled (synchronous)
 *
 * Format: [Memory:{component}:Debug] {message}
 *
 * All debug logging goes to stderr to separate from normal output.
 * Logging never throws - errors are silently ignored.
 *
 * Uses cached debug mode for O(1) performance.
 * Call initDebugCache() at module initialization to pre-warm cache.
 *
 * @param component - Component name (e.g., 'Retrieve', 'KeywordSearch')
 * @param message - Debug message to log
 *
 * @example
 * ```typescript
 * debugLog('Retrieve', 'Query: "typescript hook error"');
 * debugLog('Retrieve', 'Terms extracted: ["typescript", "hook", "error"]');
 * ```
 */
export function debugLog(component: string, message: string): void {
  try {
    if (!isDebugEnabled()) {
      return; // Debug disabled, skip logging (O(1) check)
    }

    console.error(`[Memory:${component}:Debug] ${message}`);
  } catch (error) {
    // Logging never throws - silently ignore errors
  }
}

/**
 * Clear debug mode cache
 *
 * Used for testing or when configuration changes at runtime.
 * Forces next debugLog/isDebugEnabled call to reload config.
 */
export function clearDebugCache(): void {
  debugModeCache = null;
  cacheInitPromise = null;
}
