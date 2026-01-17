/**
 * Example: How to test a new StorageProvider implementation
 *
 * This example shows how to use the test harness to validate
 * a custom storage provider implementation.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { runStorageProviderTests } from '../storage-harness';

// Import your custom StorageProvider implementation
// import { MyCustomStorageBackend } from './my-custom-storage-backend';

/**
 * Example: Minimal StorageProvider implementation for demonstration
 *
 * Replace this with your actual implementation.
 */
class ExampleStorageBackend {
  readonly name = 'example-storage';
  readonly version = '1.0.0';
  private data = new Map<string, any>();

  async initialize() {
    return { ok: true as const, value: undefined };
  }

  async healthCheck() {
    return { healthy: true, message: 'Example storage operational' };
  }

  async shutdown() {
    this.data.clear();
    return { ok: true as const, value: undefined };
  }

  async store(segment: any) {
    this.data.set(segment.id, segment);
    return {
      ok: true as const,
      value: {
        id: segment.id,
        path: `example/${segment.id}.md`,
        timestamp: Date.now()
      }
    };
  }

  async retrieve(id: string) {
    const segment = this.data.get(id);
    return { ok: true as const, value: segment || null };
  }

  async query(options: any = {}) {
    let results = Array.from(this.data.values());

    // Apply filters
    if (options.tags) {
      results = results.filter(s =>
        options.tags.some((tag: string) => s.tags?.includes(tag))
      );
    }

    if (options.recency) {
      const recencyMs = this.parseRecency(options.recency);
      const cutoff = Date.now() - recencyMs;
      results = results.filter(s => s.timestamp >= cutoff);
    }

    if (options.minImportance !== undefined) {
      results = results.filter(s => s.importanceScore >= options.minImportance);
    }

    if (options.minAccessCount !== undefined) {
      results = results.filter(s => s.accessCount >= options.minAccessCount);
    }

    const total = results.length;

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return {
      ok: true as const,
      value: {
        segments: results,
        total
      }
    };
  }

  private parseRecency(recency: string): number {
    const match = recency.match(/^(\d+)([dhm])$/);
    if (!match) return 0;
    const [, value, unit] = match;
    const num = parseInt(value, 10);
    switch (unit) {
      case 'd': return num * 86400000;
      case 'h': return num * 3600000;
      case 'm': return num * 60000;
      default: return 0;
    }
  }

  async update(id: string, updates: any) {
    const existing = this.data.get(id);
    if (!existing) {
      return {
        ok: false as const,
        error: {
          code: 'STORAGE_NOT_FOUND' as const,
          message: `Segment ${id} not found`,
        }
      };
    }

    // Special handling for accessCount: INCREMENT, not replace
    const { accessCount, ...otherUpdates } = updates;
    const updated = {
      ...existing,
      ...otherUpdates,
      accessCount: accessCount !== undefined
        ? existing.accessCount + accessCount
        : existing.accessCount
    };

    this.data.set(id, updated);
    return { ok: true as const, value: updated };
  }

  async delete(id: string) {
    const existed = this.data.delete(id);
    return { ok: true as const, value: existed };
  }
}

/**
 * Test suite for your custom storage provider
 */
describe('ExampleStorageBackend', () => {
  /**
   * Step 1: Run contract tests
   *
   * This validates that your implementation complies with
   * the StorageProvider interface contract.
   */
  runStorageProviderTests(ExampleStorageBackend, {
    cleanupBeforeEach: true,
    testDataPath: join(homedir(), 'pai-test-example-storage')
  });

  /**
   * Step 2: Add custom implementation-specific tests
   *
   * Contract tests validate the interface. Add custom tests
   * for implementation-specific behavior.
   */
  describe('example-specific behavior', () => {
    let backend: ExampleStorageBackend;

    beforeAll(() => {
      backend = new ExampleStorageBackend();
    });

    test('should use in-memory Map for storage', async () => {
      await backend.initialize();

      const segment = {
        id: 'test-seg-1',
        sessionId: 'test-session',
        timestamp: Date.now(),
        content: 'Test content',
        tags: ['test'],
        importanceScore: 50,
        accessCount: 0,
        lastAccessed: null,
        memoryType: 'episodic' as const,
        sourceRange: { start: 0, end: 100 }
      };

      const storeResult = await backend.store(segment);
      expect(storeResult.ok).toBe(true);

      const retrieveResult = await backend.retrieve('test-seg-1');
      expect(retrieveResult.ok).toBe(true);
      expect(retrieveResult.value).toEqual(segment);
    });

    test('should handle concurrent operations', async () => {
      await backend.initialize();

      // Test that multiple operations work correctly
      const operations = Array.from({ length: 10 }, (_, i) => ({
        id: `concurrent-${i}`,
        sessionId: 'test',
        timestamp: Date.now(),
        content: `Content ${i}`,
        tags: ['concurrent'],
        importanceScore: 50,
        accessCount: 0,
        lastAccessed: null,
        memoryType: 'episodic' as const,
        sourceRange: { start: 0, end: 100 }
      }));

      // Store all segments
      await Promise.all(operations.map(op => backend.store(op)));

      // Verify all were stored
      for (const op of operations) {
        const result = await backend.retrieve(op.id);
        expect(result.ok).toBe(true);
        expect(result.value).not.toBeNull();
      }
    });
  });
});

/**
 * Next steps:
 *
 * 1. Replace ExampleStorageBackend with your actual implementation
 * 2. Run tests: bun test path/to/your/provider.test.ts
 * 3. Fix any contract violations shown in test failures
 * 4. Add custom tests for your specific implementation
 * 5. Ensure all tests pass before using provider in production
 */
