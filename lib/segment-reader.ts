import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { parseFrontmatter } from './frontmatter';
import type { MemorySegment, Result } from '../types';

/**
 * Get PAI directory from environment or default
 */
function getPaiDir(): string {
  return process.env.PAI_DIR || join(homedir(), 'pai');
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
 * Validate segment ID format
 * Format: seg_{timestamp}_{random8hex}
 */
function validateSegmentId(id: string): boolean {
  return /^seg_\d+_[a-f0-9]{8}$/.test(id);
}

/**
 * Validate session ID format
 * Format: mem_{timestamp}_{random8hex}
 */
function validateSessionId(id: string): boolean {
  return /^mem_\d+_[a-f0-9]{8}$/.test(id);
}

/**
 * Get segment file path from segment ID
 *
 * @param segmentId Segment ID (format: seg_{timestamp}_{random})
 * @returns Path to segment file or error
 */
export function getSegmentPath(segmentId: string): Result<string, QueryError> {
  try {
    // Validate segment ID format
    if (!validateSegmentId(segmentId)) {
      return {
        ok: false,
        error: {
          code: 'QUERY_INVALID_PARAMS',
          message: `Invalid segment ID format: ${segmentId} (expected: seg_{timestamp}_{8hex})`
        }
      };
    }

    // Extract timestamp from ID (second part: seg_{timestamp}_{random})
    const parts = segmentId.split('_');
    const timestamp = parseInt(parts[1]);

    if (isNaN(timestamp)) {
      return {
        ok: false,
        error: {
          code: 'QUERY_INVALID_PARAMS',
          message: `Invalid timestamp in segment ID: ${segmentId} (timestamp must be numeric)`
        }
      };
    }

    // Calculate year-month directory
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const yearMonth = `${year}-${month}`;

    // Construct path
    const segmentPath = join(getPaiDir(), 'mem-store', 'segments', yearMonth, `${segmentId}.md`);

    return { ok: true, value: segmentPath };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'QUERY_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error getting segment path',
        cause: error instanceof Error ? error : undefined
      }
    };
  }
}

/**
 * Read segment content and parse frontmatter
 *
 * @param segmentId Segment ID to read
 * @returns Parsed memory segment or error
 */
export function readSegment(segmentId: string): Result<MemorySegment, QueryError> {
  try {
    // Get segment path
    const pathResult = getSegmentPath(segmentId);
    if (!pathResult.ok) {
      return { ok: false, error: pathResult.error };
    }

    const segmentPath = pathResult.value;

    // Check if file exists
    if (!existsSync(segmentPath)) {
      return {
        ok: false,
        error: {
          code: 'QUERY_SEGMENT_NOT_FOUND',
          message: `Segment file not found: ${segmentPath}`
        }
      };
    }

    // Read file content
    const content = readFileSync(segmentPath, 'utf-8');

    // Parse frontmatter
    const parseResult = parseFrontmatter(content);
    if (!parseResult.ok) {
      return {
        ok: false,
        error: {
          code: 'QUERY_SEGMENT_CORRUPT',
          message: `Failed to parse segment frontmatter: ${segmentId}`,
          cause: parseResult.error
        }
      };
    }

    const { frontmatter, body } = parseResult.value;

    // Convert frontmatter to MemorySegment
    const segment: MemorySegment = {
      id: frontmatter.id,
      sessionId: frontmatter.sessionId,
      timestamp: frontmatter.timestamp,
      importanceScore: frontmatter.importanceScore,
      accessCount: frontmatter.accessCount,
      lastAccessed: frontmatter.lastAccessed,
      tags: frontmatter.tags || [],
      memoryType: frontmatter.memoryType,
      sourceRange: frontmatter.sourceRange,
      content: body.trim()
    };

    console.error(`[Memory:SegmentReader] Loaded segment ${segmentId} from ${segmentPath.split(/[/\\]/).slice(-2).join('/')}`);

    return { ok: true, value: segment };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'QUERY_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error reading segment',
        cause: error instanceof Error ? error : undefined
      }
    };
  }
}

/**
 * Read all segments from a session
 *
 * Scans all date-based directories to find segments matching the session ID.
 *
 * @param sessionId Session ID to query
 * @param metadataOnly If true, only load frontmatter metadata (content will be empty string)
 * @returns Array of segments from the session or error
 */
export function readSessionSegments(
  sessionId: string,
  metadataOnly: boolean = false
): Result<MemorySegment[], QueryError> {
  try {
    // Validate session ID format
    if (!validateSessionId(sessionId)) {
      return {
        ok: false,
        error: {
          code: 'QUERY_INVALID_PARAMS',
          message: `Invalid session ID format: ${sessionId} (expected: mem_{timestamp}_{8hex})`
        }
      };
    }

    const segmentsBasePath = join(getPaiDir(), 'mem-store', 'segments');

    // Check if segments directory exists
    if (!existsSync(segmentsBasePath)) {
      console.error(`[Memory:SegmentReader] Segments directory not found: ${segmentsBasePath}`);
      return { ok: true, value: [] };
    }

    const segments: MemorySegment[] = [];

    // Scan all date folders
    const dateFolders = readdirSync(segmentsBasePath).filter(name => {
      const path = join(segmentsBasePath, name);
      return statSync(path).isDirectory();
    });

    for (const dateFolder of dateFolders) {
      const datePath = join(segmentsBasePath, dateFolder);
      const files = readdirSync(datePath).filter(f => f.endsWith('.md'));

      for (const file of files) {
        const filePath = join(datePath, file);

        try {
          // Read and parse segment
          const content = readFileSync(filePath, 'utf-8');
          const parseResult = parseFrontmatter(content);

          if (!parseResult.ok) {
            console.error(`[Memory:SegmentReader] Skipping corrupted segment: ${filePath}`);
            continue;
          }

          const { frontmatter, body } = parseResult.value;

          // Check if this segment belongs to the session
          if (frontmatter.sessionId === sessionId) {
            const segment: MemorySegment = {
              id: frontmatter.id,
              sessionId: frontmatter.sessionId,
              timestamp: frontmatter.timestamp,
              importanceScore: frontmatter.importanceScore,
              accessCount: frontmatter.accessCount,
              lastAccessed: frontmatter.lastAccessed,
              tags: frontmatter.tags || [],
              memoryType: frontmatter.memoryType,
              sourceRange: frontmatter.sourceRange,
              content: metadataOnly ? '' : body.trim()
            };

            segments.push(segment);
          }
        } catch (error) {
          // Skip corrupted files
          console.error(`[Memory:SegmentReader] Error reading segment ${filePath}: ${error}`);
          continue;
        }
      }
    }

    console.error(`[Memory:SegmentReader] Found ${segments.length} segments for session ${sessionId}`);

    return { ok: true, value: segments };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'QUERY_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error reading session segments',
        cause: error instanceof Error ? error : undefined
      }
    };
  }
}
