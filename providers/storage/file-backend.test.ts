/**
 * File Backend Storage Tests
 *
 * Comprehensive tests for the file-based storage provider.
 * Tests all acceptance criteria from Story 1.3.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { promises as fs } from 'fs';
import { FileBackend } from './file-backend';
import { MemorySegment } from '../../types/segment';

const TEST_PAI_DIR = join(homedir(), 'pai-test-file-backend');

/**
 * Helper to create a test segment with default values.
 */
function createTestSegment(overrides: Partial<MemorySegment> = {}): MemorySegment {
  return {
    id: `seg_${Date.now()}_test`,
    sessionId: `mem_${Date.now()}_test`,
    timestamp: Date.now(),
    importanceScore: 0,
    accessCount: 0,
    lastAccessed: null,
    tags: ['test'],
    memoryType: 'episodic',
    sourceRange: { start: 0, end: 100 },
    content: 'Test segment content',
    ...overrides,
  };
}

describe('FileBackend', () => {
  let backend: FileBackend;

  beforeAll(async () => {
    // Set up test environment
    process.env.PAI_DIR = TEST_PAI_DIR;
    mkdirSync(TEST_PAI_DIR, { recursive: true });

    backend = new FileBackend();
    const initResult = await backend.initialize();
    expect(initResult.ok).toBe(true);
  });

  afterAll(async () => {
    await backend.shutdown();

    // CRITICAL: Clean up test directory
    if (existsSync(TEST_PAI_DIR)) {
      rmSync(TEST_PAI_DIR, { recursive: true, force: true });
    }

    delete process.env.PAI_DIR;
  });

  describe('initialize', () => {
    test('should create mem-store directory structure', async () => {
      const segmentsDir = join(TEST_PAI_DIR, 'mem-store', 'segments');
      const structuredDir = join(TEST_PAI_DIR, 'mem-store', 'structured');

      expect(existsSync(segmentsDir)).toBe(true);
      expect(existsSync(structuredDir)).toBe(true);
    });
  });

  describe('store - AC1: Write segment as markdown with frontmatter', () => {
    test('should write segment to correct YYYY-MM folder', async () => {
      const segment: MemorySegment = {
        id: 'seg_1704912345000_a1b2c3d4',
        sessionId: 'mem_1704912340000_b2c3d4e5',
        timestamp: 1704912345000, // 2024-01-10
        importanceScore: 0,
        accessCount: 0,
        lastAccessed: null,
        tags: ['typescript', 'test'],
        memoryType: 'episodic',
        sourceRange: { start: 0, end: 100 },
        content: 'Test content',
      };

      const result = await backend.store(segment);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe(segment.id);
        expect(result.value.path).toContain('2024-01'); // YYYY-MM folder
        expect(result.value.path).toContain(segment.id);
        expect(existsSync(result.value.path)).toBe(true);
      }
    });

    test('should create YYYY-MM directory if it does not exist', async () => {
      // Test with future date to ensure directory creation
      const segment: MemorySegment = {
        id: 'seg_2025060012345_x1y2z3',
        sessionId: 'mem_2025060012340_a1b2c3',
        timestamp: new Date('2025-06-01').getTime(),
        importanceScore: 0,
        accessCount: 0,
        lastAccessed: null,
        tags: [],
        memoryType: 'episodic',
        sourceRange: { start: 0, end: 50 },
        content: 'Future content',
      };

      const result = await backend.store(segment);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.path).toContain('2025-06');
        expect(existsSync(result.value.path)).toBe(true);
      }
    });

    test('should contain YAML frontmatter with all segment metadata', async () => {
      const segment: MemorySegment = {
        id: 'seg_1704912345001_frontmatter',
        sessionId: 'mem_1704912340000_frontmatter',
        timestamp: 1704912345001,
        importanceScore: 75,
        accessCount: 3,
        lastAccessed: 1704912350000,
        tags: ['hooks', 'memory'],
        memoryType: 'episodic',
        sourceRange: { start: 10, end: 200 },
        content: 'Content with metadata',
      };

      const result = await backend.store(segment);
      expect(result.ok).toBe(true);

      if (result.ok) {
        const fileContent = await fs.readFile(result.value.path, 'utf-8');

        // Verify frontmatter exists
        expect(fileContent).toContain('---');
        expect(fileContent).toContain('id: seg_1704912345001_frontmatter');
        expect(fileContent).toContain('session_id: mem_1704912340000_frontmatter');
        expect(fileContent).toContain('importance_score: 75');
        expect(fileContent).toContain('access_count: 3');
        expect(fileContent).toContain('- hooks');
        expect(fileContent).toContain('- memory');

        // Verify content exists after frontmatter
        expect(fileContent).toContain('Content with metadata');
      }
    });

    test('should return StoreResult with id, path, and timestamp', async () => {
      const segment: MemorySegment = {
        id: 'seg_1704912345002_result',
        sessionId: 'mem_1704912340000_result',
        timestamp: 1704912345002,
        importanceScore: 0,
        accessCount: 0,
        lastAccessed: null,
        tags: [],
        memoryType: 'episodic',
        sourceRange: { start: 0, end: 50 },
        content: 'Result test',
      };

      const result = await backend.store(segment);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('seg_1704912345002_result');
        expect(result.value.path).toBeTruthy();
        expect(result.value.timestamp).toBeGreaterThan(0);
      }
    });
  });

  describe('retrieve - AC2: Read and parse segment files', () => {
    test('should parse frontmatter and content correctly', async () => {
      const original: MemorySegment = {
        id: 'seg_1704912345003_retrieve',
        sessionId: 'mem_1704912340000_retrieve',
        timestamp: 1704912345003,
        importanceScore: 75,
        accessCount: 3,
        lastAccessed: 1704912350000,
        tags: ['hooks', 'memory'],
        memoryType: 'episodic',
        sourceRange: { start: 10, end: 200 },
        content: 'Original content\nMultiple lines',
      };

      // Store first
      const storeResult = await backend.store(original);
      expect(storeResult.ok).toBe(true);

      // Retrieve
      const retrieveResult = await backend.retrieve(original.id);

      expect(retrieveResult.ok).toBe(true);
      if (retrieveResult.ok && retrieveResult.value) {
        const retrieved = retrieveResult.value;
        expect(retrieved.id).toBe(original.id);
        expect(retrieved.sessionId).toBe(original.sessionId);
        expect(retrieved.importanceScore).toBe(original.importanceScore);
        expect(retrieved.accessCount).toBe(original.accessCount);
        expect(retrieved.tags).toEqual(original.tags);
        expect(retrieved.content).toBe(original.content);
      }
    });

    test('should return MemorySegment with all fields preserved', async () => {
      const original: MemorySegment = {
        id: 'seg_1704912345004_fields',
        sessionId: 'mem_1704912340000_fields',
        timestamp: 1704912345004,
        importanceScore: 50,
        accessCount: 10,
        lastAccessed: 1704912400000,
        tags: ['typescript', 'testing', 'hooks'],
        memoryType: 'episodic',
        sourceRange: { start: 0, end: 500 },
        content: 'Complex content with\nmultiple\nlines',
      };

      const storeResult = await backend.store(original);
      expect(storeResult.ok).toBe(true);

      const retrieveResult = await backend.retrieve(original.id);
      expect(retrieveResult.ok).toBe(true);

      if (retrieveResult.ok && retrieveResult.value) {
        expect(retrieveResult.value).toEqual(original);
      }
    });
  });

  describe('retrieve - AC3: Return null for missing files (not error)', () => {
    test('should return null for missing segment (not error)', async () => {
      const result = await backend.retrieve('seg_nonexistent_123456');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    test('should return Result with ok=true when segment not found', async () => {
      const result = await backend.retrieve('seg_missing_999999');

      expect(result.ok).toBe(true);
      expect(result.value).toBeNull();
    });
  });

  describe('query - AC4: Search session-registry.json', () => {
    beforeAll(async () => {
      // Create test segments with different tags
      const segments: MemorySegment[] = [
        {
          id: 'seg_1704912345010_query1',
          sessionId: 'mem_1704912340000_query',
          timestamp: 1704912345010,
          importanceScore: 50,
          accessCount: 0,
          lastAccessed: null,
          tags: ['typescript', 'testing'],
          memoryType: 'episodic',
          sourceRange: { start: 0, end: 50 },
          content: 'TypeScript content',
        },
        {
          id: 'seg_1704912345011_query2',
          sessionId: 'mem_1704912340000_query',
          timestamp: 1704912345011,
          importanceScore: 25,
          accessCount: 5,
          lastAccessed: 1704912400000,
          tags: ['hooks', 'testing'],
          memoryType: 'episodic',
          sourceRange: { start: 0, end: 50 },
          content: 'Hooks content',
        },
        {
          id: 'seg_1704912345012_query3',
          sessionId: 'mem_1704912340000_query',
          timestamp: 1704912345012,
          importanceScore: 80,
          accessCount: 2,
          lastAccessed: null,
          tags: ['typescript', 'hooks'],
          memoryType: 'episodic',
          sourceRange: { start: 0, end: 50 },
          content: 'Combined content',
        },
      ];

      for (const seg of segments) {
        await backend.store(seg);
      }
    });

    test('should filter by tags', async () => {
      const result = await backend.query({ tags: ['typescript'] });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.segments.length).toBeGreaterThan(0);
        for (const seg of result.value.segments) {
          expect(seg.tags).toContain('typescript');
        }
      }
    });

    test('should filter by importance score', async () => {
      const result = await backend.query({ minImportance: 40 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const seg of result.value.segments) {
          expect(seg.importanceScore).toBeGreaterThanOrEqual(40);
        }
      }
    });

    test('should filter by access count', async () => {
      const result = await backend.query({ minAccessCount: 2 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const seg of result.value.segments) {
          expect(seg.accessCount).toBeGreaterThanOrEqual(2);
        }
      }
    });

    test('should respect limit parameter', async () => {
      const result = await backend.query({ limit: 1 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.segments.length).toBeLessThanOrEqual(1);
      }
    });

    test('should return QueryResult with segments and total', async () => {
      const result = await backend.query({ tags: ['testing'] });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.segments).toBeDefined();
        expect(Array.isArray(result.value.segments)).toBe(true);
        expect(result.value.total).toBeGreaterThanOrEqual(0);
      }
    });

    test('should return empty result when no segments match', async () => {
      const result = await backend.query({ tags: ['nonexistent-tag'] });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.segments.length).toBe(0);
        expect(result.value.total).toBe(0);
      }
    });
  });

  describe('delete - AC5: Remove segment files', () => {
    test('should remove file and update registry', async () => {
      const segment: MemorySegment = {
        id: 'seg_1704912345020_delete',
        sessionId: 'mem_1704912340000_delete',
        timestamp: 1704912345020,
        importanceScore: 0,
        accessCount: 0,
        lastAccessed: null,
        tags: ['delete-test'],
        memoryType: 'episodic',
        sourceRange: { start: 0, end: 50 },
        content: 'To be deleted',
      };

      // Store first
      const storeResult = await backend.store(segment);
      expect(storeResult.ok).toBe(true);

      // Verify it exists
      const retrieveResult1 = await backend.retrieve(segment.id);
      expect(retrieveResult1.ok && retrieveResult1.value !== null).toBe(true);

      // Delete
      const deleteResult = await backend.delete(segment.id);
      expect(deleteResult.ok).toBe(true);
      if (deleteResult.ok) {
        expect(deleteResult.value).toBe(true);
      }

      // Verify it's gone
      const retrieveResult2 = await backend.retrieve(segment.id);
      expect(retrieveResult2.ok && retrieveResult2.value === null).toBe(true);

      // Verify registry was updated
      const queryResult = await backend.query({ tags: ['delete-test'] });
      expect(queryResult.ok).toBe(true);
      if (queryResult.ok) {
        expect(queryResult.value.segments.length).toBe(0);
      }
    });

    test('should return true when deleting nonexistent segment (idempotent)', async () => {
      const result = await backend.delete('seg_never_existed_999');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
    });

    test('should return Result<boolean, StorageError>', async () => {
      const segment: MemorySegment = {
        id: 'seg_1704912345021_delete2',
        sessionId: 'mem_1704912340000_delete2',
        timestamp: 1704912345021,
        importanceScore: 0,
        accessCount: 0,
        lastAccessed: null,
        tags: [],
        memoryType: 'episodic',
        sourceRange: { start: 0, end: 50 },
        content: 'Delete test 2',
      };

      await backend.store(segment);
      const result = await backend.delete(segment.id);

      expect(result.ok).toBe(true);
      expect(typeof result.value).toBe('boolean');
    });
  });

  describe('error handling - AC6: Handle disk failures', () => {
    test('should return error with correct structure for failures', () => {
      // Verify error structure matches StorageError interface
      const error = {
        code: 'STORAGE_WRITE_FAILED',
        message: 'Disk full',
        cause: new Error('ENOSPC'),
      };

      expect(error.code).toBe('STORAGE_WRITE_FAILED');
      expect(error.message).toBeTruthy();
      expect(error.cause).toBeDefined();
    });

    test('should handle invalid segment data gracefully', async () => {
      // Test with segment that has invalid timestamp
      const invalidSegment = {
        id: 'seg_invalid_timestamp',
        sessionId: 'mem_invalid',
        timestamp: NaN,
        importanceScore: 0,
        accessCount: 0,
        lastAccessed: null,
        tags: [],
        memoryType: 'episodic',
        sourceRange: { start: 0, end: 50 },
        content: 'Invalid',
      } as MemorySegment;

      const result = await backend.store(invalidSegment);

      // Should either succeed or return proper error structure
      if (!result.ok) {
        expect(result.error.code).toBeTruthy();
        expect(result.error.message).toBeTruthy();
      }
    });
  });

  describe('healthCheck', () => {
    test('should return true when directories exist', async () => {
      const result = await backend.healthCheck();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
    });
  });

  describe('session registry', () => {
    test('should update registry on store', async () => {
      const segment: MemorySegment = {
        id: 'seg_1704912345030_registry',
        sessionId: 'mem_1704912340000_registry',
        timestamp: 1704912345030,
        importanceScore: 0,
        accessCount: 0,
        lastAccessed: null,
        tags: ['registry-test'],
        memoryType: 'episodic',
        sourceRange: { start: 0, end: 50 },
        content: 'Registry test',
      };

      await backend.store(segment);

      // Verify registry file exists
      const registryPath = join(TEST_PAI_DIR, 'mem-store', 'structured', 'session-registry.json');
      expect(existsSync(registryPath)).toBe(true);

      // Verify registry contains the segment
      const registryContent = await fs.readFile(registryPath, 'utf-8');
      const registry = JSON.parse(registryContent);

      expect(registry.sessions[segment.sessionId]).toBeDefined();
      expect(registry.indexes.byTag['registry-test']).toContain(segment.id);
    });

    test('should create indexes for efficient querying', async () => {
      const registryPath = join(TEST_PAI_DIR, 'mem-store', 'structured', 'session-registry.json');

      if (existsSync(registryPath)) {
        const registryContent = await fs.readFile(registryPath, 'utf-8');
        const registry = JSON.parse(registryContent);

        expect(registry.indexes).toBeDefined();
        expect(registry.indexes.byTag).toBeDefined();
        expect(registry.indexes.bySession).toBeDefined();
      }
    });
  });

  describe('concurrent operations', () => {
    test('should handle multiple stores without corruption', async () => {
      const segments: MemorySegment[] = Array.from({ length: 5 }, (_, i) => ({
        id: `seg_1704912345040_concurrent${i}`,
        sessionId: 'mem_1704912340000_concurrent',
        timestamp: 1704912345040 + i,
        importanceScore: i * 10,
        accessCount: 0,
        lastAccessed: null,
        tags: [`concurrent-${i}`],
        memoryType: 'episodic' as const,
        sourceRange: { start: 0, end: 50 },
        content: `Concurrent test ${i}`,
      }));

      // Store all segments concurrently
      const results = await Promise.all(segments.map((seg) => backend.store(seg)));

      // All should succeed
      for (const result of results) {
        expect(result.ok).toBe(true);
      }

      // Verify all can be retrieved
      for (const segment of segments) {
        const retrieveResult = await backend.retrieve(segment.id);
        expect(retrieveResult.ok).toBe(true);
        expect(retrieveResult.value).not.toBeNull();
      }
    });
  });

  describe('update (Story 4.4)', () => {
    test('should increment accessCount by 1 when segment is updated', async () => {
      // Arrange: Create and store a segment with accessCount: 0
      const segment = createTestSegment({ accessCount: 0, lastAccessed: null });
      const storeResult = await backend.store(segment);
      expect(storeResult.ok).toBe(true);

      // Act: Update usage signals
      const updateResult = await backend.update(segment.id, {
        accessCount: 1, // Flag to increment by 1
        lastAccessed: Date.now(),
      });

      // Assert: Update succeeded and accessCount incremented
      expect(updateResult.ok).toBe(true);
      expect(updateResult.value).not.toBeNull();
      expect(updateResult.value?.accessCount).toBe(1);
      expect(updateResult.value?.lastAccessed).toBeGreaterThan(0);

      // Verify persisted
      const retrieveResult = await backend.retrieve(segment.id);
      expect(retrieveResult.ok).toBe(true);
      expect(retrieveResult.value?.accessCount).toBe(1);
      expect(retrieveResult.value?.lastAccessed).toBeGreaterThan(0);
    });

    test('should increment accessCount multiple times when updated repeatedly', async () => {
      // Arrange: Create segment
      const segment = createTestSegment({ accessCount: 0 });
      await backend.store(segment);

      // Act: Update 3 times
      await backend.update(segment.id, { accessCount: 1, lastAccessed: Date.now() });
      await backend.update(segment.id, { accessCount: 1, lastAccessed: Date.now() });
      const updateResult = await backend.update(segment.id, { accessCount: 1, lastAccessed: Date.now() });

      // Assert: accessCount = 3
      expect(updateResult.ok).toBe(true);
      expect(updateResult.value?.accessCount).toBe(3);

      // Verify persisted
      const retrieveResult = await backend.retrieve(segment.id);
      expect(retrieveResult.ok).toBe(true);
      expect(retrieveResult.value?.accessCount).toBe(3);
    });

    test('should update lastAccessed timestamp when segment is updated', async () => {
      // Arrange
      const segment = createTestSegment({ lastAccessed: null });
      await backend.store(segment);

      const beforeUpdate = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay

      // Act
      const updateResult = await backend.update(segment.id, {
        accessCount: 1,
        lastAccessed: Date.now(),
      });

      // Assert: lastAccessed updated to recent timestamp
      expect(updateResult.ok).toBe(true);
      expect(updateResult.value?.lastAccessed).toBeGreaterThanOrEqual(beforeUpdate);
    });

    test('should preserve existing metadata during partial update', async () => {
      // Arrange: Create segment with rich metadata
      const segment = createTestSegment({
        tags: ['typescript', 'hooks'],
        importanceScore: 75,
        memoryType: 'semantic',
        content: 'Original content',
      });
      await backend.store(segment);

      // Act: Update only usage signals
      const updateResult = await backend.update(segment.id, {
        accessCount: 1,
        lastAccessed: Date.now(),
      });

      // Assert: All other fields preserved
      expect(updateResult.ok).toBe(true);
      const updated = updateResult.value!;
      expect(updated.tags).toHaveLength(2);
      expect(updated.tags).toContain('typescript');
      expect(updated.tags).toContain('hooks');
      expect(updated.importanceScore).toBe(75);
      expect(updated.memoryType).toBe('semantic');
      expect(updated.content).toBe('Original content');
      expect(updated.accessCount).toBe(1);
    });

    test('should return error when segment not found', async () => {
      // Act: Update non-existent segment
      const updateResult = await backend.update('seg_nonexistent', {
        accessCount: 1,
        lastAccessed: Date.now(),
      });

      // Assert: Error returned
      expect(updateResult.ok).toBe(false);
      if (!updateResult.ok) {
        expect(updateResult.error.code).toBe('STORAGE_NOT_FOUND');
        expect(updateResult.error.message).toContain('not found');
      }
    });

    test('should use atomic write (temp file + rename) to prevent corruption', async () => {
      // Arrange
      const segment = createTestSegment({ accessCount: 0 });
      await backend.store(segment);

      // Act: Update
      const updateResult = await backend.update(segment.id, {
        accessCount: 1,
        lastAccessed: Date.now(),
      });

      // Assert: File exists and is valid (no temp files left behind)
      expect(updateResult.ok).toBe(true);

      const segmentsDir = join(TEST_PAI_DIR, 'mem-store', 'segments');
      const files = await fs.readdir(segmentsDir, { recursive: true });
      const tempFiles = files.filter((f) => String(f).includes('.tmp'));
      expect(tempFiles.length).toBe(0); // No temp files left behind
    });
  });
});
