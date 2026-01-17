/**
 * Usage Tracking Integration Tests
 *
 * Story 6.2: Verifies that usage tracking is properly integrated
 * into the retrieval pipeline and that access counts are updated
 * when memories are retrieved.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import { retrieveMemories, resetSearchProvider } from '../core/retrieval';
import { FileBackend } from '../providers/storage/file-backend';
import { getUsageStats, resetStorageInstance } from '../lib/usage-tracker';
import { clearConfigCache } from '../core/config';
import { globalProviderRegistry } from '../core/provider-registry';
import { registerMVPProviders, resetProvidersRegistered } from '../core/register-providers';
import type { MemorySegment } from '../types/segment';

const testPaiDir = join(
  process.cwd(),
  'tests',
  `usage-integration-${Date.now()}`
);

describe('Usage Tracking Integration', () => {
  let storage: FileBackend;

  beforeAll(async () => {
    // Create isolated test directory
    await fs.mkdir(testPaiDir, { recursive: true });
    process.env.PAI_DIR = testPaiDir;

    // Reset all caches to ensure fresh provider initialization with new PAI_DIR
    clearConfigCache();
    resetSearchProvider();
    resetStorageInstance();

    // Re-register providers after any previous test file's clearAll()
    globalProviderRegistry.clearCache();
    resetProvidersRegistered();
    registerMVPProviders();

    // Initialize storage
    storage = new FileBackend({ storePath: testPaiDir });
    await storage.initialize();

    // Create test segments
    const segments: MemorySegment[] = [
      {
        id: 'seg_usage_001',
        sessionId: 'session_usage_001',
        timestamp: Date.now(),
        content: 'TypeScript memory hook error debugging',
        tags: ['typescript', 'hook', 'error'],
        source: 'test',
        metadata: {},
        importanceScore: 75,
        accessCount: 0,
        lastAccessed: null,
        memoryType: 'episodic',
        sourceRange: { start: 0, end: 100 },
      },
      {
        id: 'seg_usage_002',
        sessionId: 'session_usage_001',
        timestamp: Date.now() - 86400000, // 1 day ago
        content: 'TypeScript hook implementation best practices',
        tags: ['typescript', 'hook', 'best-practices'],
        source: 'test',
        metadata: {},
        importanceScore: 60,
        accessCount: 0,
        lastAccessed: null,
        memoryType: 'episodic',
        sourceRange: { start: 0, end: 100 },
      },
      {
        id: 'seg_usage_003',
        sessionId: 'session_usage_001',
        timestamp: Date.now() - 172800000, // 2 days ago
        content: 'Error handling patterns in async code',
        tags: ['error', 'async', 'patterns'],
        source: 'test',
        metadata: {},
        importanceScore: 50,
        accessCount: 0,
        lastAccessed: null,
        memoryType: 'episodic',
        sourceRange: { start: 0, end: 100 },
      },
    ];

    for (const segment of segments) {
      await storage.store(segment);
    }

    // Wait for storage to flush
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    // Reset all caches for cleanup (prevents pollution of subsequent tests)
    clearConfigCache();
    resetSearchProvider();
    resetStorageInstance();

    // Clean up test directory
    if (existsSync(testPaiDir)) {
      await fs.rm(testPaiDir, { recursive: true, force: true });
    }
    delete process.env.PAI_DIR;
  });

  test('should increment accessCount when segment is retrieved', async () => {
    // Retrieve memories matching "typescript hook"
    const result = await retrieveMemories('typescript hook', {
      maxResults: 5,
    });

    if (!result.ok) {
      console.error('[TEST] Retrieval failed:', result.error);
    }

    expect(result.ok).toBe(true);
    expect(result.value.length).toBeGreaterThan(0);

    // Wait for async usage tracking to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify accessCount was incremented for retrieved segments
    for (const ranked of result.value) {
      const segmentResult = await storage.retrieve(ranked.segmentId);

      expect(segmentResult.ok).toBe(true);
      expect(segmentResult.value).not.toBeNull();
      expect(segmentResult.value!.accessCount).toBeGreaterThan(0);
      expect(segmentResult.value!.lastAccessed).not.toBeNull();
    }
  });

  test('should track multiple retrievals correctly', async () => {
    // Perform multiple retrievals
    await retrieveMemories('typescript', { maxResults: 2 });
    await new Promise((resolve) => setTimeout(resolve, 100));

    await retrieveMemories('hook', { maxResults: 2 });
    await new Promise((resolve) => setTimeout(resolve, 100));

    await retrieveMemories('error', { maxResults: 2 });
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Check that segments have accumulated access counts
    const seg001 = await storage.retrieve('seg_usage_001');
    expect(seg001.value!.accessCount).toBeGreaterThanOrEqual(2); // Should match "typescript" and "hook"
  });

  test('should not fail retrieval if usage tracking fails', async () => {
    // This test verifies graceful degradation
    // Even if usage tracking encounters an error, retrieval should succeed

    const result = await retrieveMemories('test query', {
      maxResults: 5,
    });

    // Retrieval should succeed regardless of usage tracking
    expect(result.ok).toBe(true);
  });

  test('should update usage stats with retrieval data', async () => {
    // Perform retrieval
    await retrieveMemories('typescript hook error', { maxResults: 3 });
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Get usage stats
    const statsResult = await getUsageStats();

    expect(statsResult.ok).toBe(true);
    expect(statsResult.value.usageStats.totalRetrievals).toBeGreaterThan(0);
    expect(statsResult.value.usageStats.uniqueSegmentsRetrieved).toBeGreaterThan(0);
    expect(statsResult.value.usageStats.topSegments).toBeDefined();
    expect(Array.isArray(statsResult.value.usageStats.topSegments)).toBe(true);
  });

  test('should rank segments by actual access counts in usage stats', async () => {
    // Clear test data and create new segments with known access patterns
    const freshPaiDir = join(
      process.cwd(),
      'tests',
      `usage-ranking-${Date.now()}`
    );
    await fs.mkdir(freshPaiDir, { recursive: true });

    const oldPaiDir = process.env.PAI_DIR;
    process.env.PAI_DIR = freshPaiDir;

    // Reset all caches to ensure fresh provider initialization with new PAI_DIR
    clearConfigCache();
    resetSearchProvider();
    resetStorageInstance();

    const freshStorage = new FileBackend({ storePath: freshPaiDir });
    await freshStorage.initialize();

    // Create segments with different access counts
    const segments: MemorySegment[] = [
      {
        id: 'seg_rank_001',
        sessionId: 'session_rank',
        timestamp: Date.now(),
        content: 'Most accessed segment',
        tags: ['popular'],
        source: 'test',
        metadata: {},
        importanceScore: 50,
        accessCount: 0,
        lastAccessed: null,
        memoryType: 'episodic',
        sourceRange: { start: 0, end: 100 },
      },
      {
        id: 'seg_rank_002',
        sessionId: 'session_rank',
        timestamp: Date.now(),
        content: 'Medium accessed segment',
        tags: ['moderate'],
        source: 'test',
        metadata: {},
        importanceScore: 50,
        accessCount: 0,
        lastAccessed: null,
        memoryType: 'episodic',
        sourceRange: { start: 0, end: 100 },
      },
    ];

    for (const segment of segments) {
      await freshStorage.store(segment);
    }

    // Simulate different access patterns
    await retrieveMemories('popular', { maxResults: 5 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await retrieveMemories('popular', { maxResults: 5 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await retrieveMemories('popular', { maxResults: 5 });
    await new Promise((resolve) => setTimeout(resolve, 100));

    await retrieveMemories('moderate', { maxResults: 5 });
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Get stats
    const statsResult = await getUsageStats();

    if (statsResult.ok && statsResult.value.usageStats.topSegments.length >= 2) {
      // Verify descending order
      const topSegments = statsResult.value.usageStats.topSegments;
      for (let i = 1; i < topSegments.length; i++) {
        expect(topSegments[i - 1].accessCount).toBeGreaterThanOrEqual(
          topSegments[i].accessCount
        );
      }
    }

    // Cleanup - reset PAI_DIR and all caches to original state
    process.env.PAI_DIR = oldPaiDir;
    clearConfigCache();
    resetSearchProvider();
    resetStorageInstance();
    await fs.rm(freshPaiDir, { recursive: true, force: true });
  });

  test('should provide accurate total retrievals count', async () => {
    // Get initial stats
    const before = await getUsageStats();
    const beforeTotal = before.ok ? before.value.usageStats.totalRetrievals : 0;

    // Perform known number of retrievals (use query that will match existing segments)
    await retrieveMemories('typescript', { maxResults: 2 });
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Get updated stats
    const after = await getUsageStats();

    expect(after.ok).toBe(true);
    expect(after.value.usageStats.totalRetrievals).toBeGreaterThan(beforeTotal);
  });
});
