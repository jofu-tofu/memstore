/**
 * Usage Tracker Tests
 *
 * Tests for usage signal tracking module (Story 4.4).
 * Verifies accessCount increments and lastAccessed updates.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { updateUsageSignals, resetStorageInstance } from '../usage-tracker';
import { FileBackend } from '../../providers/storage/file-backend';
import { MemorySegment } from '../../types/segment';

const TEST_MEMSTORE_DIR = join(homedir(), '.memstore-test-usage-tracker');

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

describe('UsageTracker', () => {
  let storage: FileBackend;

  beforeEach(async () => {
    // Create isolated test directory
    mkdirSync(TEST_MEMSTORE_DIR, { recursive: true });
    process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;

    // Reset the usage-tracker's singleton so it uses the new MEMSTORE_DIR
    resetStorageInstance();

    // Initialize storage provider
    storage = new FileBackend();
    await storage.initialize();
  });

  afterEach(async () => {
    // ALWAYS clean up
    if (existsSync(TEST_MEMSTORE_DIR)) {
      rmSync(TEST_MEMSTORE_DIR, { recursive: true, force: true });
    }
    delete process.env.MEMSTORE_DIR;
  });

  test('should increment accessCount by 1 when segment is used', async () => {
    // Arrange: Create segment with accessCount: 0
    const segment = createTestSegment({ accessCount: 0, lastAccessed: null });
    await storage.store(segment);

    // Act: Update usage signals
    const result = await updateUsageSignals([segment.id]);

    // Assert: Update succeeded
    expect(result.ok).toBe(true);

    // Verify accessCount incremented
    const updated = await storage.retrieve(segment.id);
    expect(updated.ok).toBe(true);
    expect(updated.value).not.toBeNull();
    if (updated.value) {
      expect(updated.value.accessCount).toBe(1);
      expect(updated.value.lastAccessed).toBeGreaterThan(0);
    }
  });

  test('should update lastAccessed to current timestamp when segment is retrieved', async () => {
    // Arrange
    const segment = createTestSegment({ lastAccessed: null });
    await storage.store(segment);

    const beforeUpdate = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay

    // Act
    const result = await updateUsageSignals([segment.id]);

    // Assert
    expect(result.ok).toBe(true);

    const updated = await storage.retrieve(segment.id);
    expect(updated.ok).toBe(true);
    if (updated.value) {
      expect(updated.value.lastAccessed).toBeGreaterThanOrEqual(beforeUpdate);
    }
  });

  test('should handle batch updates for multiple segments when list provided', async () => {
    // Arrange: Create 3 segments
    const seg1 = createTestSegment({ id: 'seg_batch_1', accessCount: 0 });
    const seg2 = createTestSegment({ id: 'seg_batch_2', accessCount: 0 });
    const seg3 = createTestSegment({ id: 'seg_batch_3', accessCount: 0 });
    await storage.store(seg1);
    await storage.store(seg2);
    await storage.store(seg3);

    // Act: Batch update
    const result = await updateUsageSignals(['seg_batch_1', 'seg_batch_2', 'seg_batch_3']);

    // Assert: All updated
    expect(result.ok).toBe(true);

    const updated1 = await storage.retrieve('seg_batch_1');
    const updated2 = await storage.retrieve('seg_batch_2');
    const updated3 = await storage.retrieve('seg_batch_3');

    expect(updated1.value?.accessCount).toBe(1);
    expect(updated2.value?.accessCount).toBe(1);
    expect(updated3.value?.accessCount).toBe(1);
  });

  test('should continue on error when one segment update fails', async () => {
    // Arrange: Create 2 valid segments + 1 non-existent
    const seg1 = createTestSegment({ id: 'seg_partial_1', accessCount: 0 });
    const seg2 = createTestSegment({ id: 'seg_partial_2', accessCount: 0 });
    await storage.store(seg1);
    await storage.store(seg2);

    // Act: Update with one invalid ID
    const result = await updateUsageSignals([
      'seg_partial_1',
      'seg_nonexistent', // This will fail
      'seg_partial_2',
    ]);

    // Assert: Partial success (not complete failure)
    // Function returns ok:true even with partial failures (graceful degradation)
    expect(result.ok).toBe(true);

    // Verify valid segments were updated
    const updated1 = await storage.retrieve('seg_partial_1');
    const updated2 = await storage.retrieve('seg_partial_2');
    expect(updated1.value?.accessCount).toBe(1);
    expect(updated2.value?.accessCount).toBe(1);
  });

  test('should return error when all segment updates fail', async () => {
    // Act: Update non-existent segments
    const result = await updateUsageSignals(['seg_none_1', 'seg_none_2', 'seg_none_3']);

    // Assert: Error returned when ALL fail
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('USAGE_UPDATE_FAILED');
      expect(result.error.message).toContain('All updates failed');
    }
  });

  test('should return success immediately when empty segment list provided', async () => {
    // Act: Update empty list
    const result = await updateUsageSignals([]);

    // Assert: Success (no-op)
    expect(result.ok).toBe(true);
  });
});
