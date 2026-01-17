import { existsSync } from 'fs';
import { readdir, stat, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { Result } from '../types';
import type { MemorySegment } from '../types/segment';
import { parseFrontmatter } from './frontmatter';

/**
 * Get PAI directory from environment or default
 */
function getPaiDir(): string {
  return process.env.PAI_DIR || join(homedir(), 'pai');
}

/**
 * Keyword index structure (keyword -> segment IDs)
 */
export interface KeywordIndex {
  [keyword: string]: string[];
}

/**
 * Segment match with score and matched keywords
 */
export interface SegmentMatch {
  segmentId: string;
  matchScore: number;      // How many keywords matched
  matchedKeywords: string[];
}

/**
 * Stale segment result with decay metrics.
 * Story 6.3: Used for identifying segments that haven't been accessed recently.
 */
export interface StaleSegment {
  /** Segment identifier */
  id: string;

  /** Last accessed timestamp (null if never accessed) */
  lastAccessed: number | null;

  /** Age in days since last access (null if never accessed) */
  ageDays: number | null;

  /** Number of times this segment has been accessed */
  accessCount: number;

  /** Segment tags for context */
  tags: string[];

  /** Creation timestamp */
  timestamp: number;
}

/**
 * Stale session result.
 * Story 6.3: Identifies sessions where all segments are stale.
 */
export interface StaleSession {
  /** Session identifier */
  sessionId: string;

  /** Number of segments in this session */
  segmentCount: number;

  /** Number of stale segments */
  staleCount: number;

  /** Oldest lastAccessed timestamp across all segments */
  oldestAccess: number | null;
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
 * In-memory cache for keyword index
 */
let cachedIndex: KeywordIndex | null = null;

/**
 * Clear the keyword index cache (useful for testing)
 */
export function clearKeywordIndexCache(): void {
  cachedIndex = null;
}

/**
 * Load keyword index from disk
 */
async function loadKeywordIndexFromDisk(): Promise<Result<KeywordIndex, QueryError>> {
  try {
    const indexPath = join(getPaiDir(), 'mem-store', 'indexes', 'keyword', 'index.json');

    if (!existsSync(indexPath)) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_SEARCH_INDEX_NOT_FOUND',
          message: `Keyword index not found: ${indexPath}`
        }
      };
    }

    const content = await readFile(indexPath, 'utf-8');
    const index = JSON.parse(content) as KeywordIndex;

    return { ok: true, value: index };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_SEARCH_INDEX_CORRUPT',
          message: 'Failed to parse keyword index JSON',
          cause: error
        }
      };
    }

    return {
      ok: false,
      error: {
        code: 'SEGMENT_SEARCH_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error loading keyword index',
        cause: error instanceof Error ? error : undefined
      }
    };
  }
}

/**
 * Load keyword index with caching
 */
export async function loadKeywordIndex(): Promise<Result<KeywordIndex, QueryError>> {
  if (cachedIndex) {
    return { ok: true, value: cachedIndex };
  }

  const result = await loadKeywordIndexFromDisk();
  if (result.ok) {
    cachedIndex = result.value;
    console.error(`[Memory:SegmentSearch] Loaded keyword index with ${Object.keys(result.value).length} keywords`);
  }

  return result;
}

/**
 * Find segments by single keyword
 *
 * @param keyword Keyword to search for (case-insensitive)
 * @returns Segment IDs matching the keyword
 */
export async function findSegmentsByKeyword(keyword: string): Promise<Result<string[], QueryError>> {
  try {
    const indexResult = await loadKeywordIndex();
    if (!indexResult.ok) {
      return { ok: false, error: indexResult.error };
    }

    // Case-insensitive lookup
    const normalizedKeyword = keyword.toLowerCase();
    const segmentIds = indexResult.value[normalizedKeyword] || [];

    console.error(`[Memory:SegmentSearch] Keyword '${keyword}' matched ${segmentIds.length} segments`);

    return { ok: true, value: segmentIds };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'SEGMENT_SEARCH_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error searching by keyword',
        cause: error instanceof Error ? error : undefined
      }
    };
  }
}

/**
 * Find segments by multiple keywords with scoring
 *
 * @param keywords Array of keywords to search for
 * @returns Segment matches with scores, sorted by score descending
 */
export async function findSegmentsByKeywords(keywords: string[]): Promise<Result<SegmentMatch[], QueryError>> {
  try {
    const indexResult = await loadKeywordIndex();
    if (!indexResult.ok) {
      return { ok: false, error: indexResult.error };
    }

    // Track segment matches
    const segmentMatches = new Map<string, SegmentMatch>();

    // For each keyword, find matching segments
    for (const keyword of keywords) {
      const normalizedKeyword = keyword.toLowerCase();
      const segmentIds = indexResult.value[normalizedKeyword] || [];

      for (const segmentId of segmentIds) {
        if (segmentMatches.has(segmentId)) {
          // Increment score and add keyword
          const match = segmentMatches.get(segmentId)!;
          match.matchScore++;
          match.matchedKeywords.push(keyword);
        } else {
          // New match
          segmentMatches.set(segmentId, {
            segmentId,
            matchScore: 1,
            matchedKeywords: [keyword]
          });
        }
      }
    }

    // Convert to array and sort by score descending
    const results = Array.from(segmentMatches.values()).sort((a, b) => b.matchScore - a.matchScore);

    console.error(`[Memory:SegmentSearch] Keywords [${keywords.join(', ')}] matched ${results.length} segments`);

    return { ok: true, value: results };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'SEGMENT_SEARCH_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error searching by keywords',
        cause: error instanceof Error ? error : undefined
      }
    };
  }
}

/**
 * Scan all segment files and load their metadata.
 * Story 6.3: Helper function for stale segment queries.
 *
 * @returns Array of memory segments with full metadata
 */
async function scanAllSegments(): Promise<MemorySegment[]> {
  const segments: MemorySegment[] = [];
  const paiDir = getPaiDir();
  const segmentsDir = join(paiDir, 'mem-store', 'segments');

  if (!existsSync(segmentsDir)) {
    return segments;
  }

  let parseFailures = 0;
  let totalFiles = 0;

  // Scan year-month directories (format: YYYY-MM)
  const allEntries = await readdir(segmentsDir, { withFileTypes: true });
  const monthDirs = allEntries
    .filter(entry => entry.isDirectory() && /^\d{4}-\d{2}$/.test(entry.name))
    .map(entry => entry.name);

  for (const monthDir of monthDirs) {
    const monthPath = join(segmentsDir, monthDir);
    const files = (await readdir(monthPath)).filter(f => f.endsWith('.md'));
    totalFiles += files.length;

    for (const file of files) {
      try {
        const filePath = join(monthPath, file);
        const content = await readFile(filePath, 'utf-8');
        const parseResult = parseFrontmatter(content);

        if (!parseResult.ok) {
          parseFailures++;
          console.error(`[Memory:SegmentSearch] Failed to parse ${file}: ${parseResult.error.message}`);
          continue;
        }

        const parsed = parseResult.value;

        // parseFrontmatter already converts snake_case to camelCase
        const segment: MemorySegment = {
          id: parsed.frontmatter.id,
          sessionId: parsed.frontmatter.sessionId,
          timestamp: parsed.frontmatter.timestamp,
          importanceScore: parsed.frontmatter.importanceScore || 0,
          accessCount: parsed.frontmatter.accessCount || 0,
          lastAccessed: parsed.frontmatter.lastAccessed || null,
          tags: parsed.frontmatter.tags || [],
          memoryType: parsed.frontmatter.memoryType || 'episodic',
          sourceRange: parsed.frontmatter.sourceRange || { start: 0, end: 0 },
          content: parsed.body
        };

        segments.push(segment);
      } catch (error) {
        parseFailures++;
        console.error(`[Memory:SegmentSearch] Failed to load ${file}: ${(error as Error).message}`);
        // Continue scanning other files
      }
    }
  }

  if (parseFailures > 0) {
    console.warn(
      `[Memory:SegmentSearch] Loaded ${segments.length}/${totalFiles} segments (${parseFailures} parse failures)`
    );
  }

  return segments;
}

/**
 * Find segments that haven't been accessed in N days.
 * Story 6.3 AC3: Query for stale memories.
 *
 * **Important:** Segments with `lastAccessed === null` (never accessed) are ALWAYS
 * considered stale, regardless of the `daysUnused` threshold. This means calling
 * `findStaleSegments(1)` will include never-accessed segments even if created today.
 *
 * @param daysUnused - Number of days without access to qualify as stale (must be >= 0)
 * @returns Array of stale segments with decay metrics
 *
 * @example
 * ```typescript
 * // Find segments not accessed in 90+ days (includes never-accessed)
 * const result = await findStaleSegments(90);
 * if (result.ok) {
 *   result.value.forEach(stale => {
 *     if (stale.ageDays === null) {
 *       console.log(`${stale.id}: Never accessed`);
 *     } else {
 *       console.log(`${stale.id}: ${stale.ageDays.toFixed(1)} days since last access`);
 *     }
 *   });
 * }
 * ```
 */
export async function findStaleSegments(
  daysUnused: number
): Promise<Result<StaleSegment[], QueryError>> {
  try {
    // Validate input
    if (daysUnused < 0) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_SEARCH_INVALID_PARAMETER',
          message: `daysUnused must be >= 0, got ${daysUnused}`
        }
      };
    }

    const segments = await scanAllSegments();
    const now = Date.now();
    const thresholdMs = now - (daysUnused * 24 * 60 * 60 * 1000);

    const staleSegments: StaleSegment[] = [];

    for (const segment of segments) {
      const lastAccessed = segment.lastAccessed;

      // Check if stale: never accessed OR accessed before threshold
      if (lastAccessed === null || lastAccessed < thresholdMs) {
        const ageDays = lastAccessed
          ? (now - lastAccessed) / (1000 * 60 * 60 * 24)
          : null;

        staleSegments.push({
          id: segment.id,
          lastAccessed: lastAccessed,
          ageDays: ageDays,
          accessCount: segment.accessCount,
          tags: segment.tags,
          timestamp: segment.timestamp
        });
      }
    }

    console.error(
      `[Memory:SegmentSearch] Found ${staleSegments.length} segments stale for ${daysUnused}+ days`
    );

    return { ok: true, value: staleSegments };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'SEGMENT_SEARCH_STALE_FAILED',
        message: `Failed to find stale segments: ${(error as Error).message}`,
        cause: error as Error
      }
    };
  }
}

/**
 * Find segments that have never been accessed.
 * Story 6.3 AC3: Identify never-used memories.
 *
 * @returns Array of memory segments with accessCount === 0 or lastAccessed === null
 *
 * @example
 * ```typescript
 * const result = await findNeverAccessedSegments();
 * if (result.ok) {
 *   console.log(`Found ${result.value.length} never-accessed segments`);
 * }
 * ```
 */
export async function findNeverAccessedSegments(): Promise<Result<MemorySegment[], QueryError>> {
  try {
    const segments = await scanAllSegments();

    const neverAccessed = segments.filter(segment =>
      segment.accessCount === 0 || segment.lastAccessed === null
    );

    console.error(
      `[Memory:SegmentSearch] Found ${neverAccessed.length} never-accessed segments`
    );

    return { ok: true, value: neverAccessed };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'SEGMENT_SEARCH_NEVER_ACCESSED_FAILED',
        message: `Failed to find never-accessed segments: ${(error as Error).message}`,
        cause: error as Error
      }
    };
  }
}

/**
 * Find sessions where all segments are stale.
 * Story 6.3 AC4: Identify stale sessions for lifecycle management.
 *
 * @param daysUnused - Number of days without access to qualify as stale
 * @returns Array of sessions with staleness metrics
 *
 * @example
 * ```typescript
 * const result = await findStaleSessions(90);
 * if (result.ok) {
 *   result.value.forEach(session => {
 *     console.log(`${session.sessionId}: ${session.staleCount}/${session.segmentCount} stale`);
 *   });
 * }
 * ```
 */
export async function findStaleSessions(
  daysUnused: number
): Promise<Result<StaleSession[], QueryError>> {
  try {
    const segments = await scanAllSegments();
    const now = Date.now();
    const thresholdMs = now - (daysUnused * 24 * 60 * 60 * 1000);

    // Group segments by session
    const sessionMap = new Map<string, MemorySegment[]>();
    for (const segment of segments) {
      const sessionId = segment.sessionId;
      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, []);
      }
      sessionMap.get(sessionId)!.push(segment);
    }

    const staleSessions: StaleSession[] = [];

    // Check each session for staleness
    for (const [sessionId, sessionSegments] of sessionMap.entries()) {
      const staleCount = sessionSegments.filter(seg =>
        seg.lastAccessed === null || seg.lastAccessed < thresholdMs
      ).length;

      // Only include sessions where ALL segments are stale
      if (staleCount === sessionSegments.length) {
        // Find oldest access timestamp
        const oldestAccess = sessionSegments.reduce<number | null>((oldest, seg) => {
          if (seg.lastAccessed === null) return oldest;
          if (oldest === null) return seg.lastAccessed;
          return Math.min(oldest, seg.lastAccessed);
        }, null);

        staleSessions.push({
          sessionId,
          segmentCount: sessionSegments.length,
          staleCount,
          oldestAccess
        });
      }
    }

    console.error(
      `[Memory:SegmentSearch] Found ${staleSessions.length} sessions with all segments stale (${daysUnused}+ days)`
    );

    return { ok: true, value: staleSessions };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'SEGMENT_SEARCH_STALE_SESSIONS_FAILED',
        message: `Failed to find stale sessions: ${(error as Error).message}`,
        cause: error as Error
      }
    };
  }
}
