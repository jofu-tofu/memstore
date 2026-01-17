import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Result } from '../types';

/**
 * Get MemStore directory from environment or default
 */
function getMemstoreDir(): string {
  return process.env.MEMSTORE_DIR || join(homedir(), '.memstore');
}

/**
 * Session metadata from registry
 */
export interface SessionMetadata {
  sessionId: string;
  capturedAt: number;
  segmentCount: number;
  tags: string[];
  archived: boolean;
}

/**
 * Session registry structure
 */
export interface Registry {
  version: string;
  sessions: SessionMetadata[];
}

/**
 * Query error type
 */
export interface QueryError {
  code: string;
  message: string;
  cause?: Error;
}

/**
 * Query options for pagination and filtering
 */
export interface QueryOptions {
  limit?: number;          // Max results to return (default: 100)
  offset?: number;         // Skip first N results (default: 0)
  includeArchived?: boolean;  // Include archived sessions (default: false)
}

/**
 * In-memory cache for registry
 */
let cachedRegistry: Registry | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 60000; // 1 minute

/**
 * Clear the registry cache (useful for testing)
 */
export function clearRegistryCache(): void {
  cachedRegistry = null;
  cacheTimestamp = 0;
}

/**
 * Load registry from disk
 */
function loadRegistryFromDisk(): Result<Registry, QueryError> {
  try {
    const registryPath = join(getMemstoreDir(), 'mem-store', 'structured', 'session-registry.json');

    if (!existsSync(registryPath)) {
      return {
        ok: false,
        error: {
          code: 'QUERY_REGISTRY_NOT_FOUND',
          message: `Registry file not found: ${registryPath}`
        }
      };
    }

    const content = readFileSync(registryPath, 'utf-8');
    const registry = JSON.parse(content) as Registry;

    return { ok: true, value: registry };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        ok: false,
        error: {
          code: 'QUERY_REGISTRY_CORRUPT',
          message: 'Failed to parse registry JSON',
          cause: error
        }
      };
    }

    return {
      ok: false,
      error: {
        code: 'QUERY_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error loading registry',
        cause: error instanceof Error ? error : undefined
      }
    };
  }
}

/**
 * Load registry with caching
 */
export function loadRegistry(): Result<Registry, QueryError> {
  const now = Date.now();
  if (cachedRegistry && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return { ok: true, value: cachedRegistry };
  }

  const result = loadRegistryFromDisk();
  if (result.ok) {
    cachedRegistry = result.value;
    cacheTimestamp = now;
    console.error(`[Memory:RegistryQuery] Loaded registry with ${result.value.sessions.length} sessions`);
  }

  return result;
}

/**
 * Query sessions by date range
 *
 * @param startMs Start timestamp (inclusive)
 * @param endMs End timestamp (inclusive)
 * @param options Query options (limit, offset, includeArchived)
 * @returns Sessions within date range
 */
export function querySessionsByDate(
  startMs: number,
  endMs: number,
  options: QueryOptions = {}
): Result<SessionMetadata[], QueryError> {
  try {
    const registryResult = loadRegistry();
    if (!registryResult.ok) {
      return { ok: false, error: registryResult.error };
    }

    const { limit = 100, offset = 0, includeArchived = false } = options;

    // Filter by date range and archived status
    let filtered = registryResult.value.sessions
      .filter(s => s.capturedAt >= startMs && s.capturedAt <= endMs);

    if (!includeArchived) {
      filtered = filtered.filter(s => !s.archived);
    }

    // Apply pagination
    const paginated = filtered.slice(offset, offset + limit);

    console.error(`[Memory:RegistryQuery] Found ${paginated.length} sessions from ${new Date(startMs).toISOString().split('T')[0]} to ${new Date(endMs).toISOString().split('T')[0]}`);

    return { ok: true, value: paginated };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'QUERY_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error querying sessions by date',
        cause: error instanceof Error ? error : undefined
      }
    };
  }
}

/**
 * Query sessions by tag(s)
 *
 * @param tag Single tag string or array of tags
 * @param matchMode 'any' (OR) or 'all' (AND) logic for multiple tags
 * @param options Query options (limit, offset, includeArchived)
 * @returns Sessions matching tag criteria
 */
export function querySessionsByTag(
  tag: string | string[],
  matchMode: 'all' | 'any' = 'any',
  options: QueryOptions = {}
): Result<SessionMetadata[], QueryError> {
  try {
    const registryResult = loadRegistry();
    if (!registryResult.ok) {
      return { ok: false, error: registryResult.error };
    }

    const { limit = 100, offset = 0, includeArchived = false } = options;
    const tags = Array.isArray(tag) ? tag : [tag];

    // Filter by tags and archived status
    let filtered = registryResult.value.sessions;

    if (!includeArchived) {
      filtered = filtered.filter(s => !s.archived);
    }

    if (matchMode === 'all') {
      // All tags must match (AND logic)
      filtered = filtered.filter(s =>
        tags.every(t => s.tags.includes(t))
      );
    } else {
      // Any tag matches (OR logic)
      filtered = filtered.filter(s =>
        tags.some(t => s.tags.includes(t))
      );
    }

    // Apply pagination
    const paginated = filtered.slice(offset, offset + limit);

    console.error(`[Memory:RegistryQuery] Found ${paginated.length} sessions matching tag(s): ${tags.join(', ')} (${matchMode})`);

    return { ok: true, value: paginated };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'QUERY_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error querying sessions by tag',
        cause: error instanceof Error ? error : undefined
      }
    };
  }
}
