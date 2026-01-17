# Storage Provider Documentation

**Provider Type:** `StorageProvider`
**Interface Version:** 1.0.0
**Purpose:** Persist memory segments to durable storage

## Table of Contents

1. [Overview](#overview)
2. [When to Use Different Implementations](#when-to-use-different-implementations)
3. [Interface Reference](#interface-reference)
4. [How to Implement a Storage Provider](#how-to-implement-a-storage-provider)
5. [Schema Design Principles](#schema-design-principles)
6. [Implementation Examples](#implementation-examples)
7. [Testing Your Provider](#testing-your-provider)
8. [Configuration & Registration](#configuration--registration)
9. [Performance Optimization](#performance-optimization)
10. [Common Pitfalls](#common-pitfalls)
11. [Validating Your Provider](#validating-your-provider)

## Overview

Storage providers persist memory segments to durable storage and enable retrieval through queries. Different storage backends offer trade-offs between simplicity, query capabilities, and scalability.

### What is a Storage Provider?

A storage provider implements the `StorageProvider` interface to:
1. **Store** segments to persistent storage
2. **Retrieve** segments by ID
3. **Query** segments using filters (tags, recency, importance)
4. **Update** segments (usage signals: accessCount, lastAccessed)
5. **Delete** segments (idempotent operation)

### Why Multiple Implementations?

Different projects need different storage characteristics:

| Backend | Complexity | Query Power | Scale | Best For |
|---------|------------|-------------|-------|----------|
| **File** | Low | Basic | 10K segments | Simple deployments, dev |
| **SQLite** | Medium | Rich | 100K+ segments | Single-user, local apps |
| **Graph DB** | High | Relationship queries | Large scale | Knowledge graphs, complex queries |

## When to Use Different Implementations

### File-Based Storage (`file-backend.ts`)

**Use when:**
- Simple deployment without database dependencies
- Segment count <10,000
- Query requirements are basic (tags, recency)
- Human-readable storage format preferred (markdown files)

**Examples:**
- Personal assistant on laptop
- Development and testing
- Small-scale prototypes

**Pros:**
- ✅ Zero dependencies (no database required)
- ✅ Human-readable format (markdown with YAML frontmatter)
- ✅ Easy backup (just copy .memstore directory)
- ✅ Simple debugging (inspect files directly)
- ✅ Git-friendly (can version control memories)

**Cons:**
- ❌ Query performance degrades with many segments
- ❌ Limited query capabilities (no SQL-style joins)
- ❌ File system I/O overhead
- ❌ No built-in data integrity checks

**Current Status:** ✅ Implemented (`file-backend.ts`)

---

### SQLite Storage (`sqlite-backend.example.ts`)

**Use when:**
- Segment count >10,000
- Rich query requirements (SQL capabilities)
- Single-user local application
- ACID properties required

**Examples:**
- Desktop applications with large memory stores
- Apps requiring complex queries (date ranges, multi-tag filters, scoring)
- Data analytics on memories

**Pros:**
- ✅ Fast queries with proper indexes
- ✅ Full SQL query capabilities
- ✅ ACID transactions
- ✅ Concurrent read access (WAL mode)
- ✅ Built-in data integrity
- ✅ Single-file database (easy backup)

**Cons:**
- ❌ Binary format (not human-readable)
- ❌ Requires SQLite library
- ❌ More complex schema management
- ❌ Migration complexity for schema changes

**Current Status:** 📝 Example implementation provided (`sqlite-backend.example.ts`)

---

### Graph Database Storage (Future)

**Use when:**
- Relationship queries are critical
- Knowledge graph use cases
- Multi-hop traversals needed

**Current Status:** 🔮 Future implementation

## Interface Reference

### StorageProvider Interface

```typescript
interface StorageProvider extends Provider {
  store(segment: MemorySegment): Promise<Result<StoreResult, StorageError>>;
  retrieve(id: string): Promise<Result<MemorySegment | null, StorageError>>;
  query(filters: QueryFilters): Promise<Result<QueryResult, StorageError>>;
  update(id: string, updates: Partial<MemorySegment>): Promise<Result<MemorySegment, StorageError>>;
  delete(id: string): Promise<Result<boolean, StorageError>>;
}
```

See [interface.ts](./interface.ts) for complete documentation.

### Key Types

**StoreResult:**
```typescript
interface StoreResult {
  id: string;        // Segment ID
  path: string;      // Where it was stored
  timestamp: number; // When stored
}
```

**QueryFilters:**
```typescript
interface QueryFilters {
  tags?: string[];          // Match ANY of these tags
  recency?: string;         // e.g., "7d", "30d", "2h"
  minImportance?: number;   // 0-100
  minAccessCount?: number;  // Minimum accesses
  limit?: number;           // Max results (default: 10)
}
```

**StorageError Codes:**
- `STORAGE_WRITE_FAILED` - Write to disk failed
- `STORAGE_READ_FAILED` - Read from disk failed
- `STORAGE_DELETE_FAILED` - Delete operation failed
- `STORAGE_QUERY_FAILED` - Query execution failed
- `STORAGE_UPDATE_FAILED` - Update operation failed
- `STORAGE_NOT_FOUND` - Segment not found

## How to Implement a Storage Provider

### Step-by-Step Guide

#### 1. Create Your Provider File

```typescript
// providers/storage/my-backend.ts
import type { Result } from '../../types/common';
import type { StorageProvider, StoreResult, QueryFilters, QueryResult, StorageError } from './interface';
import type { MemorySegment } from '../../types/segment';

export class MyBackend implements StorageProvider {
  readonly name = 'MyBackend';
  readonly version = '1.0.0';

  private initialized = false;
  private connection: any = null;

  async initialize(): Promise<Result<void, ProviderError>> {
    if (this.initialized) return { ok: true, value: undefined };

    try {
      this.connection = await this.createConnection();
      await this.ensureSchema();
      this.initialized = true;
      return { ok: true, value: undefined };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'STORAGE_INIT_FAILED',
          message: 'Failed to initialize storage',
          cause: error instanceof Error ? error : new Error(String(error))
        }
      };
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    return {
      healthy: this.initialized && this.connection !== null,
      message: this.initialized ? 'Operational' : 'Not initialized',
      details: { initialized: this.initialized }
    };
  }

  async shutdown(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
    this.initialized = false;
  }

  async store(segment: MemorySegment): Promise<Result<StoreResult, StorageError>> {
    if (!this.initialized) {
      return {
        ok: false,
        error: { code: 'STORAGE_NOT_INITIALIZED', message: 'Call initialize() first' }
      };
    }

    try {
      const path = await this.persistSegment(segment);
      return {
        ok: true,
        value: { id: segment.id, path, timestamp: Date.now() }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'STORAGE_WRITE_FAILED',
          message: 'Failed to store segment',
          cause: error instanceof Error ? error : new Error(String(error))
        }
      };
    }
  }

  // Implement retrieve, query, update, delete...
}
```

#### 2. Implement CRUD Operations

**Store Pattern:**
```typescript
async store(segment: MemorySegment): Promise<Result<StoreResult, StorageError>> {
  try {
    // For file backend: write markdown file
    const path = this.getSegmentPath(segment.id);
    const content = this.serializeSegment(segment);
    await writeFile(path, content, 'utf-8');

    // For SQL backend: INSERT INTO segments
    await this.db.run(
      'INSERT INTO segments VALUES (?, ?, ?, ?)',
      [segment.id, segment.sessionId, segment.timestamp, JSON.stringify(segment)]
    );

    return { ok: true, value: { id: segment.id, path, timestamp: Date.now() } };
  } catch (error) {
    return { ok: false, error: this.toStorageError(error, 'WRITE_FAILED') };
  }
}
```

**Retrieve Pattern:**
```typescript
async retrieve(id: string): Promise<Result<MemorySegment | null, StorageError>> {
  try {
    // For file backend: read markdown file
    const path = this.getSegmentPath(id);
    if (!existsSync(path)) {
      return { ok: true, value: null }; // Not found is OK, not an error
    }
    const content = await readFile(path, 'utf-8');
    const segment = this.deserializeSegment(content);

    // For SQL backend: SELECT * FROM segments WHERE id = ?
    const row = await this.db.get('SELECT * FROM segments WHERE id = ?', [id]);
    if (!row) {
      return { ok: true, value: null };
    }
    const segment = JSON.parse(row.data);

    return { ok: true, value: segment };
  } catch (error) {
    return { ok: false, error: this.toStorageError(error, 'READ_FAILED') };
  }
}
```

**Query Pattern:**
```typescript
async query(filters: QueryFilters): Promise<Result<QueryResult, StorageError>> {
  try {
    let segments = await this.getAllSegments();

    // Apply filters
    if (filters.tags) {
      segments = segments.filter(seg =>
        seg.tags.some(tag => filters.tags!.includes(tag))
      );
    }

    if (filters.minImportance !== undefined) {
      segments = segments.filter(seg => seg.importanceScore >= filters.minImportance!);
    }

    // For SQL backend, use WHERE clauses
    const sql = `
      SELECT * FROM segments
      WHERE importance >= ?
      AND tags IN (?)
      LIMIT ?
    `;

    const total = segments.length;
    const limited = segments.slice(0, filters.limit ?? 10);

    return { ok: true, value: { segments: limited, total } };
  } catch (error) {
    return { ok: false, error: this.toStorageError(error, 'QUERY_FAILED') };
  }
}
```

**Update Pattern (Special accessCount handling):**
```typescript
async update(id: string, updates: Partial<MemorySegment>): Promise<Result<MemorySegment, StorageError>> {
  try {
    const result = await this.retrieve(id);
    if (!result.ok) return result;
    if (result.value === null) {
      return { ok: false, error: { code: 'STORAGE_NOT_FOUND', message: 'Segment not found' } };
    }

    const segment = result.value;

    // Special: accessCount is INCREMENTED, not replaced
    if (updates.accessCount !== undefined) {
      segment.accessCount += updates.accessCount;
      delete updates.accessCount; // Don't apply as direct update
    }

    // Apply other updates
    Object.assign(segment, updates);

    // Re-store
    await this.store(segment);
    return { ok: true, value: segment };
  } catch (error) {
    return { ok: false, error: this.toStorageError(error, 'UPDATE_FAILED') };
  }
}
```

**Delete Pattern (Idempotent):**
```typescript
async delete(id: string): Promise<Result<boolean, StorageError>> {
  try {
    const exists = await this.exists(id);
    if (!exists) {
      return { ok: true, value: false }; // Already deleted = success
    }

    await this.removeSegment(id);
    return { ok: true, value: true }; // Deleted successfully
  } catch (error) {
    return { ok: false, error: this.toStorageError(error, 'DELETE_FAILED') };
  }
}
```

## Schema Design Principles

### File-Based Schema

**Directory Structure:**
```
~/.memstore/
├── sessions/
│   └── mem_1704912340000_a1b2c3d4/
│       ├── seg_1704912345000_b2c3d4e5.md
│       ├── seg_1704912350000_c3d4e5f6.md
│       └── ...
└── indexes/
    └── keyword-index.json
```

**Segment File Format (Markdown with YAML frontmatter):**
```markdown
---
id: seg_1704912345000_b2c3d4e5
session_id: mem_1704912340000_a1b2c3d4
timestamp: 1704912345000
importance_score: 75
access_count: 3
last_accessed: 1704912400000
tags:
  - typescript
  - hooks
memory_type: episodic
source_range:
  start: 0
  end: 150
---

The actual conversation content here...
```

### SQLite Schema

**Tables:**
```sql
CREATE TABLE segments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  importance_score INTEGER DEFAULT 0,
  access_count INTEGER DEFAULT 0,
  last_accessed INTEGER,
  memory_type TEXT DEFAULT 'episodic',
  tags TEXT,  -- JSON array
  content TEXT,
  source_range TEXT,  -- JSON object
  summary TEXT
);

CREATE INDEX idx_session ON segments(session_id);
CREATE INDEX idx_timestamp ON segments(timestamp DESC);
CREATE INDEX idx_importance ON segments(importance_score DESC);
CREATE INDEX idx_access_count ON segments(access_count DESC);

CREATE TABLE tags (
  segment_id TEXT,
  tag TEXT,
  PRIMARY KEY (segment_id, tag),
  FOREIGN KEY (segment_id) REFERENCES segments(id) ON DELETE CASCADE
);

CREATE INDEX idx_tag ON tags(tag);
```

**Why this schema?**
- Fast lookups by ID (PRIMARY KEY)
- Efficient sorting by recency (idx_timestamp)
- Quick tag filtering (tags table + index)
- Importance/access ranking (indexed)

## Implementation Examples

### Example 1: File Backend (Reference)

See [file-backend.ts](./file-backend.ts) for complete implementation.

**Key features:**
- Markdown files with YAML frontmatter
- Directory-based organization by session
- Keyword index for search
- Session registry for tracking

**Test coverage:** [file-backend.test.ts](./file-backend.test.ts)

### Example 2: SQLite Backend (Example Template)

See [sqlite-backend.example.ts](./sqlite-backend.example.ts) for working example.

**Key features:**
- Relational schema with indexes
- Connection pooling
- WAL mode for concurrent reads
- Migration pattern for schema changes
- Backup/restore helpers

**Test coverage:** [sqlite-backend.example.test.ts](./sqlite-backend.example.test.ts)

## Testing Your Provider

### Contract Tests

```typescript
import { runStorageProviderTests } from '../test-harness/storage-harness';
import { MyBackend } from './my-backend';

describe('MyBackend contract compliance', () => {
  runStorageProviderTests(MyBackend, {
    cleanupBeforeEach: true,
    testDataPath: './.test-data'
  });
});
```

This runs ~17 contract tests validating:
- ✅ Lifecycle (initialize, healthCheck, shutdown)
- ✅ store() persists segments
- ✅ retrieve() returns stored data or null
- ✅ query() filters correctly
- ✅ update() merges changes and increments accessCount
- ✅ delete() is idempotent
- ✅ Error handling returns Result errors

### Provider-Specific Tests

```typescript
describe('SQLite schema integrity', () => {
  test('should enforce foreign key constraints', async () => {
    // Test your schema-specific features
  });
});
```

## Configuration & Registration

See [Configuration & Registration](#configuration--registration) in search README - same pattern applies.

## Performance Optimization

### File Backend Optimization

1. **Lazy Index Loading:** Don't load keyword index until first search
2. **Batch Writes:** Buffer multiple stores, write once
3. **Caching:** Keep recently accessed segments in memory

### SQLite Optimization

1. **Indexes:** Create indexes on query columns
   ```sql
   CREATE INDEX idx_timestamp ON segments(timestamp DESC);
   CREATE INDEX idx_tags ON tags(tag);
   ```

2. **WAL Mode:** Enable Write-Ahead Logging for concurrent reads
   ```sql
   PRAGMA journal_mode=WAL;
   PRAGMA synchronous=NORMAL;
   ```

3. **Connection Pooling:** Reuse connections
   ```typescript
   private static connection: Database;

   async createConnection() {
     if (!MyBackend.connection) {
       MyBackend.connection = new Database(this.dbPath);
     }
     return MyBackend.connection;
   }
   ```

4. **Prepared Statements:** Reuse compiled queries
   ```typescript
   private storeStmt: Statement;

   async initialize() {
     this.storeStmt = this.db.prepare('INSERT INTO segments VALUES (?, ?, ?)');
   }
   ```

### Benchmarks

**File Backend:**
- store(): ~5-10ms per segment
- retrieve(): ~1-2ms per segment
- query(1000 segments): ~20-50ms

**SQLite Backend:**
- store(): ~1-2ms per segment
- retrieve(): ~0.5ms per segment (indexed)
- query(10K segments): ~5-15ms

## Common Pitfalls

### ❌ Pitfall 1: update() Replacing accessCount

**Wrong:**
```typescript
Object.assign(segment, updates); // Replaces accessCount!
```

**Correct:**
```typescript
if (updates.accessCount !== undefined) {
  segment.accessCount += updates.accessCount; // INCREMENT
  delete updates.accessCount;
}
Object.assign(segment, updates);
```

### ❌ Pitfall 2: retrieve() Throwing on Not Found

**Wrong:**
```typescript
if (!exists) throw new Error('Not found');
```

**Correct:**
```typescript
if (!exists) return { ok: true, value: null };
```

### ❌ Pitfall 3: delete() Failing on Second Call

**Wrong:**
```typescript
if (!exists) {
  return { ok: false, error: { code: 'NOT_FOUND', message: 'Already deleted' } };
}
```

**Correct:**
```typescript
if (!exists) {
  return { ok: true, value: false }; // Idempotent success
}
```

## Validating Your Provider

### A/B Testing Your Storage Backend

Test your storage provider against the current implementation:

```yaml
memory:
  experiments:
    sqlite-backend-trial:
      enabled: true
      variants:
        control: file-backend
        treatment: my-sqlite-backend
      splitPercent: 50
      metrics:
        - store_latency
        - query_latency
        - data_integrity
```

**Decision criteria:**
- **Performance:** Is SQLite faster for your workload?
- **Complexity:** Is the added complexity worth the benefits?
- **Scale:** Does file backend hit limits at your segment count?

See [experiments.md](../../docs/experiments.md) for complete guide.

## Related Documentation

- [StorageProvider Interface](./interface.ts) - Complete interface
- [Provider Test Harness](../test-harness/storage-harness.ts) - Contract tests
- [IMPLEMENTATION_GUIDE.md](../IMPLEMENTATION_GUIDE.md) - General guide
- [Experiments Framework](../../docs/experiments.md) - A/B testing
- [Project Context](../../../../_bmad-output/project-context.md) - Implementation rules

---

**Need help?** Open a GitHub issue or check the troubleshooting section in [IMPLEMENTATION_GUIDE.md](../IMPLEMENTATION_GUIDE.md).
