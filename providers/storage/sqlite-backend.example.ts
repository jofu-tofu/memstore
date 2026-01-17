/**
 * SQLite Storage Backend Example for the PAI Memory System
 *
 * This is an EXAMPLE implementation showing how to create a SQLite storage provider
 * for persisting memory segments in a relational database.
 *
 * ## Purpose
 *
 * This example demonstrates:
 * - How to implement the StorageProvider interface with SQLite
 * - Schema design for segments, metadata, and indexes
 * - Connection management with better-sqlite3
 * - WAL (Write-Ahead Logging) mode for concurrent writes
 * - Migration patterns for schema changes
 * - Proper Result<T, E> error handling
 *
 * ## When to Use SQLite Storage
 *
 * - Need structured queries beyond simple key-value lookup
 * - Want ACID transactions for data integrity
 * - Need to query by multiple dimensions (tags, importance, date range, etc.)
 * - Prefer a single-file database over many small files
 * - Working with tens of thousands to millions of segments
 *
 * ## When to Use File Backend Instead
 *
 * - Prefer human-readable markdown files
 * - Want version control integration (git-friendly)
 * - Need simple grep-based search
 * - Working with hundreds to low thousands of segments
 *
 * ## Integration Steps
 *
 * 1. Install better-sqlite3:
 *    ```bash
 *    bun add better-sqlite3
 *    bun add -d @types/better-sqlite3
 *    ```
 *
 * 2. Copy this file to sqlite-backend.ts (remove .example)
 *
 * 3. Register in hooks/memory/core/config.ts:
 *    ```typescript
 *    storage: {
 *      provider: 'sqlite-backend',
 *      dbPath: join(getPaiDir(), 'mem-store', 'segments.db')
 *    }
 *    ```
 *
 * 4. Run contract tests (see sqlite-backend.example.test.ts)
 * 5. Set up A/B testing to compare with file backend (Story 5.4)
 *
 * @module providers/storage/sqlite-backend.example
 * @version 1.0.0
 */

import { StorageProvider, StoreResult, QueryFilters, QueryResult, StorageError } from './interface';
import { Result, HealthStatus } from '../../types/common';
import { MemorySegment } from '../../types/segment';
import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { getPaiDir } from '../../lib/utils';
import { debugLog } from '../../lib/debug-utils';

/**
 * Configuration for SQLite storage backend
 */
export interface SQLiteBackendConfig {
  /**
   * Path to SQLite database file
   * Default: {paiDir}/mem-store/segments.db
   */
  dbPath?: string;

  /**
   * PAI directory override (for testing)
   */
  paiDir?: string;

  /**
   * Enable WAL (Write-Ahead Logging) mode for better concurrency
   * Default: true
   *
   * WAL mode allows concurrent readers while a write is in progress,
   * improving performance for multi-process access.
   */
  useWAL?: boolean;

  /**
   * Set busy timeout in milliseconds
   * Default: 5000 (5 seconds)
   *
   * How long to wait for a locked database before timing out.
   */
  busyTimeout?: number;
}

/**
 * SQLite storage backend implementation
 *
 * ## Schema Design
 *
 * ### segments table
 * - id (TEXT PRIMARY KEY): Segment ID
 * - session_id (TEXT): Session this segment belongs to
 * - timestamp (INTEGER): Creation time in Unix milliseconds
 * - importance_score (INTEGER): 0-100 importance rating
 * - access_count (INTEGER): Number of times retrieved
 * - last_accessed (INTEGER): Last access timestamp (nullable)
 * - memory_type (TEXT): episodic, semantic, or procedural
 * - content (TEXT): Actual segment text content
 * - source_range_start (INTEGER): Start position in transcript
 * - source_range_end (INTEGER): End position in transcript
 *
 * ### tags table
 * - segment_id (TEXT): Foreign key to segments.id
 * - tag (TEXT): Tag name
 * - PRIMARY KEY (segment_id, tag)
 *
 * ### Indexes
 * - idx_segments_session: ON segments(session_id)
 * - idx_segments_timestamp: ON segments(timestamp DESC)
 * - idx_segments_importance: ON segments(importance_score DESC)
 * - idx_segments_access: ON segments(access_count DESC, last_accessed DESC)
 * - idx_tags_tag: ON tags(tag)
 *
 * ## Performance Optimizations
 *
 * 1. **WAL mode**: Enables concurrent reads during writes
 * 2. **Connection pooling**: Reuse database connection (better-sqlite3 uses single connection)
 * 3. **Prepared statements**: Pre-compiled queries for faster execution
 * 4. **Indexes**: Speed up common queries (by tag, importance, recency)
 * 5. **PRAGMA optimizations**: journal_mode=WAL, synchronous=NORMAL, cache_size, temp_store=MEMORY
 *
 * @example
 * ```typescript
 * const storage = new SQLiteBackendProvider({
 *   dbPath: '/path/to/segments.db',
 *   useWAL: true
 * });
 *
 * await storage.initialize();
 *
 * const result = await storage.store(segment);
 * if (result.ok) {
 *   console.log(`Stored: ${result.value.id}`);
 * }
 * ```
 */
export class SQLiteBackendProvider implements StorageProvider {
  readonly name = 'sqlite-backend';
  readonly version = '1.0.0';

  private config: Required<SQLiteBackendConfig>;
  private db: Database.Database | null = null;
  private initialized = false;

  // Prepared statements for performance
  private stmtInsertSegment: Database.Statement | null = null;
  private stmtInsertTag: Database.Statement | null = null;
  private stmtSelectSegment: Database.Statement | null = null;
  private stmtDeleteSegment: Database.Statement | null = null;
  private stmtDeleteTags: Database.Statement | null = null;
  private stmtUpdateSegment: Database.Statement | null = null;
  private stmtIncrementAccess: Database.Statement | null = null;

  constructor(config: SQLiteBackendConfig = {}) {
    const paiDir = config.paiDir || getPaiDir();
    this.config = {
      dbPath: config.dbPath || join(paiDir, 'mem-store', 'segments.db'),
      paiDir,
      useWAL: config.useWAL ?? true,
      busyTimeout: config.busyTimeout ?? 5000
    };
  }

  /**
   * Initialize the storage backend
   *
   * Creates database file, tables, indexes, and prepares statements.
   */
  async initialize(): Promise<Result<void, StorageError>> {
    try {
      // Create database directory if it doesn't exist
      const dbDir = this.config.dbPath.substring(0, this.config.dbPath.lastIndexOf('/'));
      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
      }

      // Open database connection
      this.db = new Database(this.config.dbPath);

      // Configure database for optimal performance
      this.configurePragmas();

      // Create schema if it doesn't exist
      this.createSchema();

      // Prepare statements for reuse
      this.prepareStatements();

      this.initialized = true;
      debugLog('SQLiteBackend', `Initialized database at ${this.config.dbPath}`);

      return { ok: true, value: undefined };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'STORAGE_INIT_FAILED',
          message: `Failed to initialize SQLite backend: ${(error as Error).message}`,
          cause: error as Error
        }
      };
    }
  }

  /**
   * Check storage health
   */
  async healthCheck(): Promise<HealthStatus> {
    try {
      if (!this.db || !this.initialized) {
        return {
          healthy: false,
          message: 'Database not initialized',
          details: { dbPath: this.config.dbPath }
        };
      }

      // Check database is responsive
      const result = this.db.prepare('SELECT COUNT(*) as count FROM segments').get() as { count: number };
      const segmentCount = result.count;

      return {
        healthy: true,
        message: `SQLite backend operational (${segmentCount} segments)`,
        details: {
          dbPath: this.config.dbPath,
          segmentCount,
          walEnabled: this.config.useWAL
        }
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Database error: ${(error as Error).message}`,
        details: {
          dbPath: this.config.dbPath,
          error: (error as Error).message
        }
      };
    }
  }

  /**
   * Gracefully shutdown the storage backend
   */
  async shutdown(): Promise<void> {
    if (this.db) {
      // Close all prepared statements
      this.stmtInsertSegment?.finalize();
      this.stmtInsertTag?.finalize();
      this.stmtSelectSegment?.finalize();
      this.stmtDeleteSegment?.finalize();
      this.stmtDeleteTags?.finalize();
      this.stmtUpdateSegment?.finalize();
      this.stmtIncrementAccess?.finalize();

      // Close database connection
      this.db.close();
      this.db = null;
    }

    this.initialized = false;
  }

  /**
   * Store a memory segment in the database
   */
  async store(segment: MemorySegment): Promise<Result<StoreResult, StorageError>> {
    try {
      if (!this.db || !this.stmtInsertSegment || !this.stmtInsertTag) {
        return {
          ok: false,
          error: {
            code: 'STORAGE_WRITE_FAILED',
            message: 'Database not initialized'
          }
        };
      }

      // Use transaction for atomicity
      const insertTransaction = this.db.transaction((seg: MemorySegment) => {
        // Insert segment
        this.stmtInsertSegment!.run({
          id: seg.id,
          session_id: seg.sessionId,
          timestamp: seg.timestamp,
          importance_score: seg.importanceScore,
          access_count: seg.accessCount,
          last_accessed: seg.lastAccessed,
          memory_type: seg.memoryType,
          content: seg.content,
          source_range_start: seg.sourceRange.start,
          source_range_end: seg.sourceRange.end
        });

        // Insert tags
        for (const tag of seg.tags) {
          this.stmtInsertTag!.run({
            segment_id: seg.id,
            tag
          });
        }
      });

      insertTransaction(segment);

      debugLog('SQLiteBackend', `Stored segment ${segment.id}`);

      return {
        ok: true,
        value: {
          id: segment.id,
          path: this.config.dbPath, // SQLite stores everything in one file
          timestamp: Date.now()
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'STORAGE_WRITE_FAILED',
          message: `Failed to store segment: ${(error as Error).message}`,
          cause: error as Error
        }
      };
    }
  }

  /**
   * Retrieve a segment by ID
   */
  async retrieve(id: string): Promise<Result<MemorySegment | null, StorageError>> {
    try {
      if (!this.db || !this.stmtSelectSegment) {
        return {
          ok: false,
          error: {
            code: 'STORAGE_READ_FAILED',
            message: 'Database not initialized'
          }
        };
      }

      // Fetch segment
      const row = this.stmtSelectSegment.get({ id }) as any;

      if (!row) {
        return { ok: true, value: null };
      }

      // Fetch tags
      const tagRows = this.db.prepare('SELECT tag FROM tags WHERE segment_id = ?').all(id) as Array<{ tag: string }>;
      const tags = tagRows.map(r => r.tag);

      // Reconstruct segment object
      const segment: MemorySegment = {
        id: row.id,
        sessionId: row.session_id,
        timestamp: row.timestamp,
        importanceScore: row.importance_score,
        accessCount: row.access_count,
        lastAccessed: row.last_accessed,
        memoryType: row.memory_type,
        content: row.content,
        sourceRange: {
          start: row.source_range_start,
          end: row.source_range_end
        },
        tags
      };

      return { ok: true, value: segment };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'STORAGE_READ_FAILED',
          message: `Failed to retrieve segment: ${(error as Error).message}`,
          cause: error as Error
        }
      };
    }
  }

  /**
   * Query segments with filters
   */
  async query(filters: QueryFilters): Promise<Result<QueryResult, StorageError>> {
    try {
      if (!this.db) {
        return {
          ok: false,
          error: {
            code: 'STORAGE_QUERY_FAILED',
            message: 'Database not initialized'
          }
        };
      }

      // Build query dynamically based on filters
      let sql = 'SELECT DISTINCT s.* FROM segments s';
      const params: any[] = [];
      const conditions: string[] = [];

      // Join with tags if filtering by tags
      if (filters.tags && filters.tags.length > 0) {
        sql += ' INNER JOIN tags t ON s.id = t.segment_id';
        const placeholders = filters.tags.map(() => '?').join(',');
        conditions.push(`t.tag IN (${placeholders})`);
        params.push(...filters.tags);
      }

      // Filter by importance
      if (filters.minImportance !== undefined) {
        conditions.push('s.importance_score >= ?');
        params.push(filters.minImportance);
      }

      // Filter by access count
      if (filters.minAccessCount !== undefined) {
        conditions.push('s.access_count >= ?');
        params.push(filters.minAccessCount);
      }

      // Filter by recency (e.g., "7d", "30d", "2h")
      if (filters.recency) {
        const cutoffTime = this.parseRecency(filters.recency);
        if (cutoffTime) {
          conditions.push('s.timestamp >= ?');
          params.push(cutoffTime);
        }
      }

      // Add WHERE clause if we have conditions
      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      // Order by importance and recency
      sql += ' ORDER BY s.importance_score DESC, s.timestamp DESC';

      // Apply limit
      const limit = filters.limit ?? 10;
      sql += ' LIMIT ?';
      params.push(limit);

      // Execute query
      const rows = this.db.prepare(sql).all(...params) as any[];

      // Fetch tags for each segment
      const segments: MemorySegment[] = [];
      for (const row of rows) {
        const tagRows = this.db.prepare('SELECT tag FROM tags WHERE segment_id = ?').all(row.id) as Array<{ tag: string }>;
        const tags = tagRows.map(r => r.tag);

        segments.push({
          id: row.id,
          sessionId: row.session_id,
          timestamp: row.timestamp,
          importanceScore: row.importance_score,
          accessCount: row.access_count,
          lastAccessed: row.last_accessed,
          memoryType: row.memory_type,
          content: row.content,
          sourceRange: {
            start: row.source_range_start,
            end: row.source_range_end
          },
          tags
        });
      }

      return {
        ok: true,
        value: {
          segments,
          total: segments.length
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'STORAGE_QUERY_FAILED',
          message: `Query failed: ${(error as Error).message}`,
          cause: error as Error
        }
      };
    }
  }

  /**
   * Delete a segment from storage
   */
  async delete(id: string): Promise<Result<boolean, StorageError>> {
    try {
      if (!this.db || !this.stmtDeleteSegment || !this.stmtDeleteTags) {
        return {
          ok: false,
          error: {
            code: 'STORAGE_DELETE_FAILED',
            message: 'Database not initialized'
          }
        };
      }

      // Use transaction for atomicity
      const deleteTransaction = this.db.transaction((segmentId: string) => {
        // Delete tags first (foreign key constraint)
        this.stmtDeleteTags!.run({ segment_id: segmentId });

        // Delete segment
        const result = this.stmtDeleteSegment!.run({ id: segmentId });
        return result.changes > 0;
      });

      const deleted = deleteTransaction(id);

      debugLog('SQLiteBackend', `Deleted segment ${id}: ${deleted}`);

      return { ok: true, value: deleted };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'STORAGE_DELETE_FAILED',
          message: `Failed to delete segment: ${(error as Error).message}`,
          cause: error as Error
        }
      };
    }
  }

  /**
   * Update a segment with partial updates
   */
  async update(id: string, updates: Partial<MemorySegment>): Promise<Result<MemorySegment, StorageError>> {
    try {
      if (!this.db) {
        return {
          ok: false,
          error: {
            code: 'STORAGE_UPDATE_FAILED',
            message: 'Database not initialized'
          }
        };
      }

      // Special handling for accessCount increment
      if (updates.accessCount !== undefined && this.stmtIncrementAccess) {
        this.stmtIncrementAccess.run({
          increment: updates.accessCount,
          last_accessed: updates.lastAccessed || Date.now(),
          id
        });
      } else if (this.stmtUpdateSegment) {
        // General update
        const setClauses: string[] = [];
        const params: any = { id };

        if (updates.importanceScore !== undefined) {
          setClauses.push('importance_score = $importance_score');
          params.importance_score = updates.importanceScore;
        }
        if (updates.lastAccessed !== undefined) {
          setClauses.push('last_accessed = $last_accessed');
          params.last_accessed = updates.lastAccessed;
        }

        if (setClauses.length > 0) {
          const sql = `UPDATE segments SET ${setClauses.join(', ')} WHERE id = $id`;
          this.db.prepare(sql).run(params);
        }
      }

      // Retrieve updated segment
      const retrieveResult = await this.retrieve(id);
      if (!retrieveResult.ok || retrieveResult.value === null) {
        return {
          ok: false,
          error: {
            code: 'STORAGE_NOT_FOUND',
            message: `Segment ${id} not found after update`
          }
        };
      }

      return { ok: true, value: retrieveResult.value };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'STORAGE_UPDATE_FAILED',
          message: `Failed to update segment: ${(error as Error).message}`,
          cause: error as Error
        }
      };
    }
  }

  /**
   * Configure SQLite pragmas for optimal performance
   */
  private configurePragmas(): void {
    if (!this.db) return;

    // WAL mode for better concurrency
    if (this.config.useWAL) {
      this.db.pragma('journal_mode = WAL');
    }

    // Faster synchronization (still safe with WAL)
    this.db.pragma('synchronous = NORMAL');

    // Busy timeout for locked database
    this.db.pragma(`busy_timeout = ${this.config.busyTimeout}`);

    // Larger cache for better performance
    this.db.pragma('cache_size = -64000'); // 64MB cache

    // Use memory for temp tables
    this.db.pragma('temp_store = MEMORY');
  }

  /**
   * Create database schema
   */
  private createSchema(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS segments (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        importance_score INTEGER NOT NULL DEFAULT 0,
        access_count INTEGER NOT NULL DEFAULT 0,
        last_accessed INTEGER,
        memory_type TEXT NOT NULL,
        content TEXT NOT NULL,
        source_range_start INTEGER NOT NULL,
        source_range_end INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tags (
        segment_id TEXT NOT NULL,
        tag TEXT NOT NULL,
        PRIMARY KEY (segment_id, tag),
        FOREIGN KEY (segment_id) REFERENCES segments(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_segments_session ON segments(session_id);
      CREATE INDEX IF NOT EXISTS idx_segments_timestamp ON segments(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_segments_importance ON segments(importance_score DESC);
      CREATE INDEX IF NOT EXISTS idx_segments_access ON segments(access_count DESC, last_accessed DESC);
      CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
    `);
  }

  /**
   * Prepare SQL statements for reuse
   */
  private prepareStatements(): void {
    if (!this.db) return;

    this.stmtInsertSegment = this.db.prepare(`
      INSERT INTO segments (id, session_id, timestamp, importance_score, access_count, last_accessed, memory_type, content, source_range_start, source_range_end)
      VALUES ($id, $session_id, $timestamp, $importance_score, $access_count, $last_accessed, $memory_type, $content, $source_range_start, $source_range_end)
    `);

    this.stmtInsertTag = this.db.prepare(`
      INSERT INTO tags (segment_id, tag) VALUES ($segment_id, $tag)
    `);

    this.stmtSelectSegment = this.db.prepare(`
      SELECT * FROM segments WHERE id = $id
    `);

    this.stmtDeleteSegment = this.db.prepare(`
      DELETE FROM segments WHERE id = $id
    `);

    this.stmtDeleteTags = this.db.prepare(`
      DELETE FROM tags WHERE segment_id = $segment_id
    `);

    this.stmtIncrementAccess = this.db.prepare(`
      UPDATE segments
      SET access_count = access_count + $increment,
          last_accessed = $last_accessed
      WHERE id = $id
    `);
  }

  /**
   * Parse recency filter (e.g., "7d", "30d", "2h") to Unix timestamp
   */
  private parseRecency(recency: string): number | null {
    const match = recency.match(/^(\d+)([dhm])$/);
    if (!match) return null;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const now = Date.now();
    const msPerUnit: Record<string, number> = {
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000
    };

    const ms = value * msPerUnit[unit];
    return now - ms;
  }
}
