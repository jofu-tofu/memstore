/**
 * Memory Metadata Browser
 *
 * Provides utilities for browsing and inspecting memory metadata without
 * running queries or retrievals. Enables users to understand what's stored,
 * how it's tagged, and how the memory system is organized.
 *
 * Story 4.2: Memory Metadata Browser
 *
 * @module lib/metadata-browser
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { Result } from '../types/common';
import { MemorySegment } from '../types/segment';
import { parseFrontmatter } from './frontmatter';

/**
 * Get the PAI directory path.
 * Uses PAI_DIR environment variable if set, otherwise defaults to ~/pai
 */
function getPaiDir(): string {
  return process.env.PAI_DIR || join(homedir(), 'pai');
}

/**
 * Session metadata from session-registry.json
 */
export interface SessionMeta {
  sessionId: string;
  capturedAt: number;
  segmentCount: number;
  tags: string[];
  archived?: boolean;
}

/**
 * Tag index structure: tag → segment IDs
 */
export interface TagIndex {
  [tag: string]: string[];
}

/**
 * Browser error types
 */
export interface BrowserError {
  code: string;
  message: string;
  cause?: Error;
}

/**
 * Validate segment ID format to prevent path traversal attacks.
 * Valid format: seg_{timestamp}_{random_hex}
 *
 * @param id - Segment ID to validate
 * @returns true if valid, false otherwise
 */
function validateSegmentId(id: string): boolean {
  return /^seg_\d+_[a-fA-F0-9]+$/.test(id);
}

/**
 * Get the YYYY-MM folder for a segment based on its timestamp.
 *
 * @param id - Segment ID (format: seg_{timestamp}_{random})
 * @returns Result with folder name (YYYY-MM) or error
 */
function getSegmentMonthFolder(id: string): Result<string, BrowserError> {
  if (!validateSegmentId(id)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_SEGMENT_ID',
        message: 'Segment ID contains invalid characters or format',
      },
    };
  }

  try {
    const timestamp = parseInt(id.split('_')[1]);
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return { ok: true, value: `${year}-${month}` };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'INVALID_SEGMENT_ID',
        message: 'Failed to extract timestamp from segment ID',
        cause: error as Error,
      },
    };
  }
}

/**
 * List all sessions from the session registry.
 *
 * @returns Result with array of session metadata or error
 */
export function listAllSessions(): Result<SessionMeta[], BrowserError> {
  try {
    const registryPath = join(getPaiDir(), 'mem-store', 'structured', 'session-registry.json');

    if (!existsSync(registryPath)) {
      return {
        ok: false,
        error: {
          code: 'REGISTRY_NOT_FOUND',
          message: 'Session registry does not exist',
        },
      };
    }

    const data = readFileSync(registryPath, 'utf-8');
    const registry = JSON.parse(data);

    // Extract sessions array from registry.sessions object
    const sessions: SessionMeta[] = Object.values(registry.sessions || {}).map((session: any) => ({
      sessionId: session.sessionId,
      capturedAt: session.capturedAt,
      segmentCount: session.segmentCount,
      tags: session.tags || [],
      archived: session.archived,
    }));

    console.error(`[Memory:MetadataBrowser] Listed ${sessions.length} sessions`);

    return { ok: true, value: sessions };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'REGISTRY_READ_FAILED',
        message: `Failed to read session registry: ${(error as Error).message}`,
        cause: error as Error,
      },
    };
  }
}

/**
 * Get a specific session by ID.
 *
 * @param id - Session ID to retrieve
 * @returns Result with session metadata or null if not found, or error
 */
export function getSessionById(id: string): Result<SessionMeta | null, BrowserError> {
  const sessionsResult = listAllSessions();

  if (!sessionsResult.ok) {
    return sessionsResult;
  }

  const session = sessionsResult.value.find((s) => s.sessionId === id);

  if (!session) {
    return { ok: true, value: null };
  }

  console.error(`[Memory:MetadataBrowser] Retrieved session ${id}`);

  return { ok: true, value: session };
}

/**
 * Get metadata for a specific segment.
 *
 * @param id - Segment ID to retrieve
 * @returns Result with segment metadata or error
 */
export function getSegmentMetadata(id: string): Result<MemorySegment, BrowserError> {
  try {
    // Validate segment ID
    if (!validateSegmentId(id)) {
      return {
        ok: false,
        error: {
          code: 'INVALID_SEGMENT_ID',
          message: 'Segment ID contains invalid characters or format',
        },
      };
    }

    // Get month folder
    const monthResult = getSegmentMonthFolder(id);
    if (!monthResult.ok) {
      return { ok: false, error: monthResult.error };
    }

    const filePath = join(
      getPaiDir(),
      'mem-store',
      'segments',
      monthResult.value,
      `${id}.md`
    );

    if (!existsSync(filePath)) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_NOT_FOUND',
          message: `Segment ${id} not found`,
        },
      };
    }

    const content = readFileSync(filePath, 'utf-8');
    const parseResult = parseFrontmatter(content);

    if (!parseResult.ok) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_PARSE_FAILED',
          message: `Failed to parse segment ${id}`,
          cause: parseResult.error,
        },
      };
    }

    // Reconstruct MemorySegment from frontmatter and body
    const segment: MemorySegment = {
      ...parseResult.value.frontmatter,
      content: parseResult.value.body,
    };

    console.error(`[Memory:MetadataBrowser] Retrieved segment ${id}`);

    return { ok: true, value: segment };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'SEGMENT_READ_FAILED',
        message: `Failed to read segment ${id}: ${(error as Error).message}`,
        cause: error as Error,
      },
    };
  }
}

/**
 * Find all segment IDs that have a specific tag.
 *
 * @param tag - Tag to search for
 * @returns Result with array of segment IDs or error
 */
export function findSegmentsByTag(tag: string): Result<string[], BrowserError> {
  // Validate tag input
  if (!tag || !tag.trim()) {
    return {
      ok: false,
      error: {
        code: 'INVALID_TAG',
        message: 'Tag cannot be empty or whitespace',
      },
    };
  }

  try {
    const indexPath = join(getPaiDir(), 'mem-store', 'indexes', 'keyword', 'index.json');

    if (!existsSync(indexPath)) {
      return {
        ok: false,
        error: {
          code: 'INDEX_NOT_FOUND',
          message: 'Keyword index does not exist',
        },
      };
    }

    const data = readFileSync(indexPath, 'utf-8');
    const index: TagIndex = JSON.parse(data);

    const segmentIds = index[tag] || [];

    console.error(`[Memory:MetadataBrowser] Found ${segmentIds.length} segments with tag '${tag}'`);

    return { ok: true, value: segmentIds };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'INDEX_READ_FAILED',
        message: `Failed to read keyword index: ${(error as Error).message}`,
        cause: error as Error,
      },
    };
  }
}

/**
 * Get the complete tag index.
 *
 * @returns Result with tag index (tag → segment IDs mapping) or error
 */
export function getTagIndex(): Result<TagIndex, BrowserError> {
  try {
    const indexPath = join(getPaiDir(), 'mem-store', 'indexes', 'keyword', 'index.json');

    if (!existsSync(indexPath)) {
      return {
        ok: false,
        error: {
          code: 'INDEX_NOT_FOUND',
          message: 'Keyword index does not exist',
        },
      };
    }

    const data = readFileSync(indexPath, 'utf-8');
    const index: TagIndex = JSON.parse(data);

    const tagCount = Object.keys(index).length;
    console.error(`[Memory:MetadataBrowser] Retrieved tag index with ${tagCount} tags`);

    return { ok: true, value: index };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'INDEX_READ_FAILED',
        message: `Failed to read keyword index: ${(error as Error).message}`,
        cause: error as Error,
      },
    };
  }
}

/**
 * Format session list for human-readable display.
 *
 * @param sessions - Array of session metadata
 * @returns Formatted string table
 */
export function formatSessionList(sessions: SessionMeta[]): string {
  if (sessions.length === 0) {
    return 'No sessions found.';
  }

  const header = '┌─────────────────────────────┬─────────────────────────┬────────┬────────────┬──────────┐\n' +
                '│ Session ID                  │ Captured At             │ Segs   │ Tags       │ Archived │\n' +
                '├─────────────────────────────┼─────────────────────────┼────────┼────────────┼──────────┤';

  const rows = sessions.map((session) => {
    const capturedDate = new Date(session.capturedAt).toISOString();
    let tagsStr = '-';
    if (session.tags.length > 0) {
      const displayTags = session.tags.slice(0, 2);
      tagsStr = displayTags.join(', ');
      if (session.tags.length > 2) {
        tagsStr += '...';
      }
    }
    const archived = session.archived ? 'Yes' : 'No';

    return `│ ${session.sessionId.padEnd(27)} │ ${capturedDate.padEnd(23)} │ ${String(session.segmentCount).padEnd(6)} │ ${tagsStr.padEnd(10)} │ ${archived.padEnd(8)} │`;
  }).join('\n');

  const footer = '\n└─────────────────────────────┴─────────────────────────┴────────┴────────────┴──────────┘';

  return `${header}\n${rows}${footer}`;
}

/**
 * Format segment metadata for human-readable display.
 *
 * @param segment - Memory segment
 * @returns Formatted string
 */
export function formatSegmentMetadata(segment: MemorySegment): string {
  const timestamp = new Date(segment.timestamp).toISOString();
  const lastAccessed = segment.lastAccessed ? new Date(segment.lastAccessed).toISOString() : 'Never';
  const tags = segment.tags.length > 0 ? segment.tags.join(', ') : 'None';

  return `
╔════════════════════════════════════════════════════════════════
║ Segment Metadata
╠════════════════════════════════════════════════════════════════
║ ID:              ${segment.id}
║ Session ID:      ${segment.sessionId}
║ Timestamp:       ${timestamp}
║ Memory Type:     ${segment.memoryType}
║ Importance:      ${segment.importanceScore}
║ Access Count:    ${segment.accessCount}
║ Last Accessed:   ${lastAccessed}
║ Tags:            ${tags}
║ Source Range:    ${segment.sourceRange.start} - ${segment.sourceRange.end}
╚════════════════════════════════════════════════════════════════
`.trim();
}

/**
 * Format tag index for human-readable display.
 *
 * @param index - Tag index
 * @returns Formatted string table
 */
export function formatTagIndex(index: TagIndex): string {
  const entries = Object.entries(index).sort((a, b) => b[1].length - a[1].length);

  if (entries.length === 0) {
    return 'No tags found in index.';
  }

  const header = '┌──────────────────────────────────┬────────┐\n' +
                '│ Tag                              │ Count  │\n' +
                '├──────────────────────────────────┼────────┤';

  const rows = entries.map(([tag, segmentIds]) => {
    return `│ ${tag.padEnd(32)} │ ${String(segmentIds.length).padEnd(6)} │`;
  }).join('\n');

  const footer = '\n└──────────────────────────────────┴────────┘';

  return `${header}\n${rows}${footer}`;
}
