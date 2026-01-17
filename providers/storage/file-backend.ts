/**
 * File-based Storage Provider
 *
 * Persists memory segments as markdown files with YAML frontmatter.
 * Organizes files by YYYY-MM and maintains a session registry for fast querying.
 *
 * File structure:
 *   $PAI_DIR/mem-store/
 *   ├── segments/
 *   │   └── 2026-01/
 *   │       ├── seg_1704912345000_a1b2c3d4.md
 *   │       └── seg_1704912567000_b2c3d4e5.md
 *   └── structured/
 *       └── session-registry.json
 *
 * @module providers/storage/file-backend
 */

import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { Result } from '../../types/common';
import { MemorySegment } from '../../types/segment';
import {
  StorageProvider,
  StoreResult,
  QueryFilters,
  QueryResult,
  StorageError,
} from './interface';
import { parseFrontmatter, serializeFrontmatter } from '../../lib/frontmatter';
import { KeywordIndexManager } from './keyword-index';
import { FlatByDateOrganizeProvider } from '../organize/flat-by-date';

/**
 * Get the PAI directory path.
 * Uses PAI_DIR environment variable if set, otherwise defaults to ~/pai
 */
function getPaiDir(): string {
  return process.env.PAI_DIR || join(homedir(), 'pai');
}

/**
 * Extract YYYY-MM from timestamp for directory organization.
 */
function getYearMonth(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Parse duration string (e.g., "7d", "2h", "30m") to milliseconds.
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([dhms])$/);
  if (!match) return 0;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
}

/**
 * File-based storage provider implementation.
 */
export class FileBackend implements StorageProvider {
  name = 'FileBackend';
  version = '1.0.0';

  private keywordIndex: KeywordIndexManager;
  private organizer: FlatByDateOrganizeProvider;
  private basePath: string;

  constructor(config?: { storePath?: string }) {
    this.basePath = config?.storePath || getPaiDir();
    this.keywordIndex = new KeywordIndexManager(this.basePath);
    this.organizer = new FlatByDateOrganizeProvider();
  }

  /**
   * Initialize the file backend.
   * Verifies that the mem-store directories exist and creates them if needed.
   */
  async initialize(): Promise<Result<void, StorageError>> {
    try {
      const memStoreDir = join(this.basePath, 'mem-store');
      const segmentsDir = join(memStoreDir, 'segments');
      const structuredDir = join(memStoreDir, 'structured');

      // Create directories if they don't exist
      await fs.mkdir(segmentsDir, { recursive: true });
      await fs.mkdir(structuredDir, { recursive: true });

      // Initialize keyword index
      await this.keywordIndex.initialize();

      // Initialize organizer
      const organizeInit = await this.organizer.initialize();
      if (!organizeInit.ok) {
        console.error(`[Memory:FileBackend] Organizer init failed: ${organizeInit.error.message}`);
        // Non-fatal - can fall back to default path
      }

      console.log(`[Memory:FileBackend] Initialized at ${memStoreDir}`);

      return { ok: true, value: undefined };
    } catch (error) {
      return {
        ok: false,
        error: {
          name: 'StorageError',
          code: 'STORAGE_INIT_FAILED',
          message: `Failed to initialize file backend: ${(error as Error).message}`,
          cause: error as Error,
        },
      };
    }
  }

  /**
   * Store a memory segment as a markdown file with frontmatter.
   */
  async store(segment: MemorySegment): Promise<Result<StoreResult, StorageError>> {
    try {
      // Get organized path from organize provider
      const organizeResult = await this.organizer.organize(segment);
      let dirPath: string;

      if (!organizeResult.ok) {
        // Fall back to default path if organization fails
        console.error(`[Memory:FileBackend] Organization failed, using default: ${organizeResult.error.message}`);
        dirPath = 'segments'; // Flat default
      } else {
        dirPath = organizeResult.value;
      }

      // Full directory path
      const fullDirPath = join(this.basePath, 'mem-store', dirPath);

      // Create directory if it doesn't exist
      await fs.mkdir(fullDirPath, { recursive: true });

      // Construct file path
      const filePath = join(fullDirPath, `${segment.id}.md`);

      // Serialize segment to markdown with frontmatter
      const markdownResult = serializeFrontmatter(segment);
      if (!markdownResult.ok) {
        return {
          ok: false,
          error: {
            name: 'StorageError',
            code: 'STORAGE_SERIALIZE_FAILED',
            message: `Failed to serialize segment ${segment.id}`,
            cause: markdownResult.error,
          },
        };
      }

      // Write to file
      await fs.writeFile(filePath, markdownResult.value, 'utf-8');

      // Update session registry
      const registryResult = await this.updateSessionRegistry(segment, 'add');
      if (!registryResult.ok) {
        console.error(
          `[Memory:FileBackend] Failed to update registry: ${registryResult.error.message}`
        );
        // Don't fail the operation, just log the warning
      }

      // Update keyword index
      if (segment.tags && segment.tags.length > 0) {
        try {
          await this.keywordIndex.addToIndex(segment.id, segment.tags);
        } catch (indexError) {
          console.error(
            `[Memory:FileBackend] Failed to update keyword index: ${(indexError as Error).message}`
          );
          // Index update failure should not fail storage operation
        }
      }

      console.log(`[Memory:FileBackend] Stored segment ${segment.id} at ${filePath}`);

      return {
        ok: true,
        value: {
          id: segment.id,
          path: filePath,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          name: 'StorageError',
          code: 'STORAGE_WRITE_FAILED',
          message: `Failed to write segment ${segment.id}: ${(error as Error).message}`,
          cause: error as Error,
        },
      };
    }
  }

  /**
   * Retrieve a memory segment by ID.
   * Returns null (not an error) if the segment doesn't exist.
   */
  async retrieve(id: string): Promise<Result<MemorySegment | null, StorageError>> {
    try {
      // Strategy 1: Check session registry first for the path (fast)
      const registryPath = join(this.basePath, 'mem-store', 'structured', 'session-registry.json');

      if (existsSync(registryPath)) {
        const registryContent = await fs.readFile(registryPath, 'utf-8');
        const registry = JSON.parse(registryContent);

        // Search all sessions for this segment
        for (const session of Object.values(registry.sessions || {})) {
          const segmentMeta = (session as any).segments.find((s: any) => s.id === id);
          if (segmentMeta) {
            const filePath = join(this.basePath, 'mem-store', segmentMeta.path);
            if (existsSync(filePath)) {
              const content = await fs.readFile(filePath, 'utf-8');
              const parseResult = parseFrontmatter(content);

              if (!parseResult.ok) {
                return {
                  ok: false,
                  error: {
                    name: 'StorageError',
                    code: 'STORAGE_PARSE_FAILED',
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

              return { ok: true, value: segment };
            }
          }
        }
      }

      // Strategy 2: Registry miss - scan directories (fallback for race conditions)
      // This handles cases where file exists but registry update failed
      const segmentsBaseDir = join(this.basePath, 'mem-store', 'segments');
      if (existsSync(segmentsBaseDir)) {
        const yearMonths = await fs.readdir(segmentsBaseDir);
        for (const yearMonth of yearMonths) {
          const filePath = join(segmentsBaseDir, yearMonth, `${id}.md`);
          if (existsSync(filePath)) {
            const content = await fs.readFile(filePath, 'utf-8');
            const parseResult = parseFrontmatter(content);

            if (!parseResult.ok) {
              return {
                ok: false,
                error: {
                  code: 'STORAGE_PARSE_FAILED',
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

            return { ok: true, value: segment };
          }
        }
      }

      // Not found in registry or file doesn't exist - return null (not an error)
      return { ok: true, value: null };
    } catch (error) {
      return {
        ok: false,
        error: {
          name: 'StorageError',
          code: 'STORAGE_READ_FAILED',
          message: `Failed to retrieve segment ${id}: ${(error as Error).message}`,
          cause: error as Error,
        },
      };
    }
  }

  /**
   * Query segments matching the given filters.
   */
  async query(filters: QueryFilters): Promise<Result<QueryResult, StorageError>> {
    try {
      const registryPath = join(this.basePath, 'mem-store', 'structured', 'session-registry.json');

      // If registry doesn't exist, return empty result (not an error)
      if (!existsSync(registryPath)) {
        return {
          ok: true,
          value: { segments: [], total: 0 },
        };
      }

      const registryContent = await fs.readFile(registryPath, 'utf-8');
      const registry = JSON.parse(registryContent);

      let candidateIds: Set<string> = new Set();

      // Filter by tags if specified
      if (filters.tags && filters.tags.length > 0) {
        for (const tag of filters.tags) {
          const segmentIds = registry.indexes?.byTag?.[tag] || [];
          segmentIds.forEach((id: string) => candidateIds.add(id));
        }
      } else {
        // No tag filter - get all segments
        Object.values(registry.sessions || {}).forEach((session: any) => {
          session.segments.forEach((seg: any) => candidateIds.add(seg.id));
        });
      }

      // Load full segments
      const segments: MemorySegment[] = [];
      for (const id of candidateIds) {
        const retrieveResult = await this.retrieve(id);
        if (retrieveResult.ok && retrieveResult.value !== null) {
          segments.push(retrieveResult.value);
        }
      }

      // Apply additional filters
      let filtered = segments;

      if (filters.minImportance !== undefined) {
        filtered = filtered.filter((s) => s.importanceScore >= filters.minImportance!);
      }

      if (filters.minAccessCount !== undefined) {
        filtered = filtered.filter((s) => s.accessCount >= filters.minAccessCount!);
      }

      if (filters.recency) {
        const cutoffMs = parseDuration(filters.recency);
        const cutoffTime = Date.now() - cutoffMs;
        filtered = filtered.filter((s) => s.timestamp >= cutoffTime);
      }

      // Apply limit
      const limit = filters.limit || 10;
      const limited = filtered.slice(0, limit);

      return {
        ok: true,
        value: {
          segments: limited,
          total: filtered.length,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          name: 'StorageError',
          code: 'STORAGE_QUERY_FAILED',
          message: `Query failed: ${(error as Error).message}`,
          cause: error as Error,
        },
      };
    }
  }

  /**
   * Update a memory segment with partial updates.
   * Uses atomic read-modify-write pattern with temp file + rename.
   * Special handling for accessCount - increments instead of replaces.
   */
  async update(
    id: string,
    updates: Partial<MemorySegment>
  ): Promise<Result<MemorySegment, StorageError>> {
    try {
      // Read current segment
      const retrieveResult = await this.retrieve(id);
      if (!retrieveResult.ok) {
        return {
          ok: false,
          error: retrieveResult.error,
        };
      }

      if (retrieveResult.value === null) {
        return {
          ok: false,
          error: {
            name: 'StorageError',
            code: 'STORAGE_NOT_FOUND',
            message: `Segment ${id} not found`,
          },
        };
      }

      const current = retrieveResult.value;

      // Merge updates with special handling for accessCount
      const updated: MemorySegment = {
        ...current,
        ...updates,
      };

      // Special handling for accessCount - increment not replace
      if (updates.accessCount !== undefined) {
        updated.accessCount = current.accessCount + updates.accessCount;
      }

      // Determine file path
      const yearMonth = getYearMonth(current.timestamp);
      const filePath = join(
        this.basePath,
        'mem-store',
        'segments',
        yearMonth,
        `${id}.md`
      );

      // Serialize updated segment
      const markdownResult = serializeFrontmatter(updated);
      if (!markdownResult.ok) {
        return {
          ok: false,
          error: {
            name: 'StorageError',
            code: 'STORAGE_SERIALIZE_FAILED',
            message: `Failed to serialize updated segment ${id}`,
            cause: markdownResult.error,
          },
        };
      }

      // Atomic write: temp file + rename
      const tempPath = `${filePath}.tmp.${process.pid}`;
      await fs.writeFile(tempPath, markdownResult.value, 'utf-8');
      await fs.rename(tempPath, filePath);

      // Update keyword index if tags changed (AC2 requirement for Story 5.1)
      const oldTags = current.tags || [];
      const newTags = updated.tags || [];
      const tagsChanged = JSON.stringify(oldTags.sort()) !== JSON.stringify(newTags.sort());

      if (tagsChanged) {
        let removalSucceeded = false;
        try {
          // Remove from old tags
          if (oldTags.length > 0) {
            await this.keywordIndex.removeFromIndex(id, oldTags);
            removalSucceeded = true;
          }
          // Add to new tags
          if (newTags.length > 0) {
            await this.keywordIndex.addToIndex(id, newTags);
          }
        } catch (indexError) {
          console.error(
            `[Memory:FileBackend] Failed to update keyword index on tag change: ${(indexError as Error).message}`
          );

          // Attempt rollback if removal succeeded but addition failed
          if (removalSucceeded && oldTags.length > 0) {
            try {
              await this.keywordIndex.addToIndex(id, oldTags);
              console.log(`[Memory:FileBackend] Successfully rolled back index to old tags for segment ${id}`);
            } catch (rollbackError) {
              console.error(
                `[Memory:FileBackend] CRITICAL: Failed to rollback index for segment ${id}: ${(rollbackError as Error).message}`
              );
              // Rollback failed - index is now corrupted, must return error
              return {
                ok: false,
                error: {
                  name: 'StorageError',
                  code: 'STORAGE_INDEX_CORRUPTION',
                  message: `Failed to update keyword index and rollback failed for segment ${id}`,
                  cause: indexError as Error,
                },
              };
            }
          }
        }
      }

      console.log(`[Memory:FileBackend] Updated segment ${id}`);

      return { ok: true, value: updated };
    } catch (error) {
      return {
        ok: false,
        error: {
          name: 'StorageError',
          code: 'STORAGE_UPDATE_FAILED',
          message: `Failed to update segment ${id}: ${(error as Error).message}`,
          cause: error as Error,
        },
      };
    }
  }

  /**
   * Delete a memory segment from storage.
   */
  async delete(id: string): Promise<Result<boolean, StorageError>> {
    try {
      // First retrieve the segment to get its metadata
      const retrieveResult = await this.retrieve(id);
      if (!retrieveResult.ok) {
        return {
          ok: false,
          error: retrieveResult.error,
        };
      }

      if (retrieveResult.value === null) {
        // Segment doesn't exist - return true (idempotent delete)
        return { ok: true, value: true };
      }

      const segment = retrieveResult.value;

      // Remove from keyword index BEFORE deleting file
      if (segment.tags && segment.tags.length > 0) {
        try {
          await this.keywordIndex.removeFromIndex(segment.id, segment.tags);
        } catch (indexError) {
          console.error(
            `[Memory:FileBackend] Failed to remove from keyword index: ${(indexError as Error).message}`
          );
          // Index update failure should not fail delete operation
        }
      }

      // Determine file path
      const yearMonth = getYearMonth(segment.timestamp);
      const filePath = join(this.basePath, 'mem-store', 'segments', yearMonth, `${id}.md`);

      // Delete the file
      if (existsSync(filePath)) {
        await fs.unlink(filePath);
      }

      // Update session registry
      const registryResult = await this.updateSessionRegistry(segment, 'remove');
      if (!registryResult.ok) {
        console.error(
          `[Memory:FileBackend] Failed to update registry on delete: ${registryResult.error.message}`
        );
        // Don't fail the operation, just log the warning
      }

      console.log(`[Memory:FileBackend] Deleted segment ${id}`);

      return { ok: true, value: true };
    } catch (error) {
      return {
        ok: false,
        error: {
          name: 'StorageError',
          code: 'STORAGE_DELETE_FAILED',
          message: `Failed to delete segment ${id}: ${(error as Error).message}`,
          cause: error as Error,
        },
      };
    }
  }

  /**
   * Check health of the storage backend.
   */
  async healthCheck(): Promise<Result<boolean, StorageError>> {
    try {
      const memStoreDir = join(this.basePath, 'mem-store');

      // Check if directories exist and are accessible
      const segmentsDir = join(memStoreDir, 'segments');
      const structuredDir = join(memStoreDir, 'structured');

      const segmentsExists = existsSync(segmentsDir);
      const structuredExists = existsSync(structuredDir);

      if (!segmentsExists || !structuredExists) {
        return {
          ok: false,
          error: {
            name: 'StorageError',
            code: 'STORAGE_HEALTH_CHECK_FAILED',
            message: 'Required directories do not exist',
          },
        };
      }

      return { ok: true, value: true };
    } catch (error) {
      return {
        ok: false,
        error: {
          name: 'StorageError',
          code: 'STORAGE_HEALTH_CHECK_FAILED',
          message: `Health check failed: ${(error as Error).message}`,
          cause: error as Error,
        },
      };
    }
  }

  /**
   * Shutdown the storage backend (cleanup).
   */
  async shutdown(): Promise<Result<void, StorageError>> {
    try {
      console.log('[Memory:FileBackend] Shutdown complete');
      return { ok: true, value: undefined };
    } catch (error) {
      return {
        ok: false,
        error: {
          name: 'StorageError',
          code: 'STORAGE_SHUTDOWN_FAILED',
          message: `Shutdown failed: ${(error as Error).message}`,
          cause: error as Error,
        },
      };
    }
  }

  /**
   * Update the session registry when storing or deleting segments.
   * Private helper method.
   */
  private async updateSessionRegistry(
    segment: MemorySegment,
    operation: 'add' | 'remove'
  ): Promise<Result<void, StorageError>> {
    try {
      const registryPath = join(this.basePath, 'mem-store', 'structured', 'session-registry.json');
      const registryDir = dirname(registryPath);

      // Create directory if it doesn't exist
      await fs.mkdir(registryDir, { recursive: true });

      // Load existing registry or create new one
      let registry: any = {
        sessions: {},
        indexes: { byTag: {}, bySession: {} },
      };

      if (existsSync(registryPath)) {
        const content = await fs.readFile(registryPath, 'utf-8');
        registry = JSON.parse(content);
      }

      if (operation === 'add') {
        // Ensure session exists
        if (!registry.sessions[segment.sessionId]) {
          registry.sessions[segment.sessionId] = {
            sessionId: segment.sessionId,
            capturedAt: segment.timestamp,
            segmentCount: 0,
            segments: [],
            tags: [],
            // Retention metadata (Story 1.8)
            archived: false,
            consolidatedAt: null,
            totalSize: 0,
            lastAccessed: null
          };
        }

        const session = registry.sessions[segment.sessionId];

        // Get organized path for segment
        const organizeResult = await this.organizer.organize(segment);
        const relativePath = organizeResult.ok ? organizeResult.value : `segments/${getYearMonth(segment.timestamp)}`;

        // Add segment metadata (Story 6.2: must include accessCount for ranking)
        const segmentMeta = {
          id: segment.id,
          sessionId: segment.sessionId,
          path: `${relativePath}/${segment.id}.md`,
          tags: segment.tags,
          timestamp: segment.timestamp,
          importanceScore: segment.importanceScore,
          accessCount: segment.accessCount,
          lastAccessed: segment.lastAccessed,
          memoryType: segment.memoryType,
        };

        session.segments.push(segmentMeta);
        session.segmentCount++;

        // Update totalSize metadata (estimate based on content length)
        const segmentSize = Buffer.byteLength(segment.content, 'utf-8');
        session.totalSize = (session.totalSize || 0) + segmentSize;

        // Update tag indexes
        for (const tag of segment.tags) {
          if (!registry.indexes.byTag[tag]) {
            registry.indexes.byTag[tag] = [];
          }
          if (!registry.indexes.byTag[tag].includes(segment.id)) {
            registry.indexes.byTag[tag].push(segment.id);
          }

          if (!session.tags.includes(tag)) {
            session.tags.push(tag);
          }
        }

        // Update session index
        if (!registry.indexes.bySession[segment.sessionId]) {
          registry.indexes.bySession[segment.sessionId] = [];
        }
        registry.indexes.bySession[segment.sessionId].push(segment.id);
      } else if (operation === 'remove') {
        // Remove from session
        const session = registry.sessions[segment.sessionId];
        if (session) {
          // Update totalSize metadata (decrease by segment size)
          const segmentSize = Buffer.byteLength(segment.content, 'utf-8');
          session.totalSize = Math.max(0, (session.totalSize || 0) - segmentSize);

          session.segments = session.segments.filter((s: any) => s.id !== segment.id);
          session.segmentCount = session.segments.length;

          // Remove from tag indexes
          for (const tag of segment.tags) {
            if (registry.indexes.byTag[tag]) {
              registry.indexes.byTag[tag] = registry.indexes.byTag[tag].filter(
                (id: string) => id !== segment.id
              );
              if (registry.indexes.byTag[tag].length === 0) {
                delete registry.indexes.byTag[tag];
              }
            }
          }

          // Remove from session index
          if (registry.indexes.bySession[segment.sessionId]) {
            registry.indexes.bySession[segment.sessionId] = registry.indexes.bySession[
              segment.sessionId
            ].filter((id: string) => id !== segment.id);
          }

          // If session is empty, remove it
          if (session.segmentCount === 0) {
            delete registry.sessions[segment.sessionId];
          }
        }
      }

      // Write back to file
      await fs.writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf-8');

      return { ok: true, value: undefined };
    } catch (error) {
      return {
        ok: false,
        error: {
          name: 'StorageError',
          code: 'STORAGE_REGISTRY_UPDATE_FAILED',
          message: `Failed to update session registry: ${(error as Error).message}`,
          cause: error as Error,
        },
      };
    }
  }
}
