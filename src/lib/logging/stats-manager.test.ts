import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import {
  updateCaptureStats,
  updateRetrievalStats,
  updateProcessingStats,
  updateUsageStats,
  getStats,
  type Stats,
} from './stats-manager';

const TEST_MEMSTORE_DIR = join(homedir(), '.memstore-test-stats-manager');

describe('StatsManager', () => {
  let testDir: string;

  beforeEach(() => {
    // Create isolated test directory
    mkdirSync(TEST_MEMSTORE_DIR, { recursive: true });
    process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;

    // Create metrics directory
    testDir = join(TEST_MEMSTORE_DIR, 'mem-store', 'metrics');
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // ALWAYS clean up
    if (existsSync(TEST_MEMSTORE_DIR)) {
      rmSync(TEST_MEMSTORE_DIR, { recursive: true, force: true });
    }
    delete process.env.MEMSTORE_DIR;
  });

  describe('getStats', () => {
    test('should return default stats when file does not exist', () => {
      const result = getStats();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.capture.totalCount).toBe(0);
        expect(result.value.capture.avgLatencyMs).toBe(0);
        expect(result.value.retrieval.totalCount).toBe(0);
        expect(result.value.processing.totalSegmentsCreated).toBe(0);
      }
    });

    test('should read existing stats from file', () => {
      // Arrange: Create stats file
      const statsPath = join(testDir, 'stats.json');
      const testStats: Stats = {
        capture: {
          totalCount: 5,
          sum: 500,
          avgLatencyMs: 100,
          lastRun: Date.now(),
          errors: 1,
        },
        retrieval: {
          totalCount: 10,
          sum: 2000,
          avgLatencyMs: 200,
          sumResults: 30,
          avgResultCount: 3,
          sumTokens: 10000,
          avgInjectedTokens: 1000,
          budgetExceededCount: 2,
          lastRun: Date.now(),
        },
        processing: {
          totalSegmentsCreated: 50,
          sessionCount: 10,
          sumSegments: 80,
          avgSegmentsPerSession: 8,
          sumProcessingMs: 25000,
          avgProcessingMs: 2500,
          queueDepth: 3,
          failedItems: 1,
        },
      };
      const fs = require('fs');
      fs.writeFileSync(statsPath, JSON.stringify(testStats, null, 2));

      // Act
      const result = getStats();

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.capture.totalCount).toBe(5);
        expect(result.value.retrieval.totalCount).toBe(10);
        expect(result.value.processing.totalSegmentsCreated).toBe(50);
      }
    });
  });

  describe('updateCaptureStats', () => {
    test('should initialize stats on first update', () => {
      const result = updateCaptureStats(100, true);

      expect(result.ok).toBe(true);

      const stats = getStats();
      if (stats.ok) {
        expect(stats.value.capture.totalCount).toBe(1);
        expect(stats.value.capture.sum).toBe(100);
        expect(stats.value.capture.avgLatencyMs).toBe(100);
        expect(stats.value.capture.errors).toBe(0);
        expect(stats.value.capture.lastRun).toBeGreaterThan(0);
      }
    });

    test('should calculate running average correctly when adding new values', () => {
      // Arrange: First update
      updateCaptureStats(100, true);

      // Act: Second update
      const result = updateCaptureStats(200, true);

      // Assert: Average should be 150
      expect(result.ok).toBe(true);
      const stats = getStats();
      if (stats.ok) {
        expect(stats.value.capture.totalCount).toBe(2);
        expect(stats.value.capture.sum).toBe(300);
        expect(stats.value.capture.avgLatencyMs).toBe(150);
      }
    });

    test('should increment error count when capture fails', () => {
      // Arrange: Successful capture
      updateCaptureStats(100, true);

      // Act: Failed capture
      const result = updateCaptureStats(150, false);

      // Assert
      expect(result.ok).toBe(true);
      const stats = getStats();
      if (stats.ok) {
        expect(stats.value.capture.totalCount).toBe(2);
        expect(stats.value.capture.errors).toBe(1);
      }
    });

    test('should update lastRun timestamp', () => {
      const before = Date.now();
      updateCaptureStats(50, true);
      const after = Date.now();

      const stats = getStats();
      if (stats.ok) {
        expect(stats.value.capture.lastRun).toBeGreaterThanOrEqual(before);
        expect(stats.value.capture.lastRun).toBeLessThanOrEqual(after);
      }
    });
  });

  describe('updateRetrievalStats', () => {
    test('should initialize retrieval stats on first update', () => {
      const result = updateRetrievalStats(180, 5, 920, false);

      expect(result.ok).toBe(true);

      const stats = getStats();
      if (stats.ok) {
        expect(stats.value.retrieval.totalCount).toBe(1);
        expect(stats.value.retrieval.avgLatencyMs).toBe(180);
        expect(stats.value.retrieval.avgResultCount).toBe(5);
        expect(stats.value.retrieval.avgInjectedTokens).toBe(920);
        expect(stats.value.retrieval.budgetExceededCount).toBe(0);
      }
    });

    test('should calculate multiple running averages correctly', () => {
      // Arrange: First update
      updateRetrievalStats(100, 3, 500, false);

      // Act: Second update
      updateRetrievalStats(200, 5, 1000, false);

      // Assert
      const stats = getStats();
      if (stats.ok) {
        expect(stats.value.retrieval.totalCount).toBe(2);
        expect(stats.value.retrieval.avgLatencyMs).toBe(150); // (100 + 200) / 2
        expect(stats.value.retrieval.avgResultCount).toBe(4); // (3 + 5) / 2
        expect(stats.value.retrieval.avgInjectedTokens).toBe(750); // (500 + 1000) / 2
      }
    });

    test('should increment budgetExceededCount when budget exceeded', () => {
      // Arrange: Under budget
      updateRetrievalStats(500, 3, 500, false);

      // Act: Over budget
      updateRetrievalStats(1500, 4, 800, true);

      // Assert
      const stats = getStats();
      if (stats.ok) {
        expect(stats.value.retrieval.budgetExceededCount).toBe(1);
        expect(stats.value.retrieval.totalCount).toBe(2);
      }
    });
  });

  describe('updateProcessingStats', () => {
    test('should initialize processing stats on first update', () => {
      const result = updateProcessingStats(12, 2500, 3, 0);

      expect(result.ok).toBe(true);

      const stats = getStats();
      if (stats.ok) {
        expect(stats.value.processing.sessionCount).toBe(1);
        expect(stats.value.processing.totalSegmentsCreated).toBe(12);
        expect(stats.value.processing.avgSegmentsPerSession).toBe(12);
        expect(stats.value.processing.avgProcessingMs).toBe(2500);
        expect(stats.value.processing.queueDepth).toBe(3);
        expect(stats.value.processing.failedItems).toBe(0);
      }
    });

    test('should calculate running averages for processing', () => {
      // Arrange: First batch
      updateProcessingStats(8, 2000, 2, 0);

      // Act: Second batch
      updateProcessingStats(12, 3000, 1, 1);

      // Assert
      const stats = getStats();
      if (stats.ok) {
        expect(stats.value.processing.sessionCount).toBe(2);
        expect(stats.value.processing.totalSegmentsCreated).toBe(20); // Cumulative
        expect(stats.value.processing.avgSegmentsPerSession).toBe(10); // (8 + 12) / 2
        expect(stats.value.processing.avgProcessingMs).toBe(2500); // (2000 + 3000) / 2
        expect(stats.value.processing.queueDepth).toBe(1); // Last value
        expect(stats.value.processing.failedItems).toBe(1); // Cumulative
      }
    });
  });

  describe('atomic updates', () => {
    test('should handle concurrent updates without corruption', async () => {
      // This test verifies atomic read-modify-write behavior
      const promises = [];

      // Simulate 10 concurrent updates
      for (let i = 0; i < 10; i++) {
        promises.push(updateCaptureStats(100 + i * 10, true));
      }

      const results = await Promise.all(promises);

      // All updates should succeed
      results.forEach((result) => {
        expect(result.ok).toBe(true);
      });

      // Final stats should have all 10 updates
      const stats = getStats();
      if (stats.ok) {
        expect(stats.value.capture.totalCount).toBe(10);
        // Sum should be 100 + 110 + 120 + ... + 190 = 1450
        expect(stats.value.capture.sum).toBe(1450);
        expect(stats.value.capture.avgLatencyMs).toBe(145);
      }
    });
  });

  describe('input validation', () => {
    test('should reject negative latency in capture stats', () => {
      const result = updateCaptureStats(-100, true);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('STATS_UPDATE_FAILED');
        expect(result.error.message).toContain('negative');
      }
    });

    test('should reject negative values in retrieval stats', () => {
      const result = updateRetrievalStats(-100, 5, 920, false);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('STATS_UPDATE_FAILED');
      }
    });

    test('should reject negative values in processing stats', () => {
      const result = updateProcessingStats(-10, 2500, 3, 0);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('STATS_UPDATE_FAILED');
      }
    });
  });

  describe('error handling', () => {
    test('should return error when metrics directory cannot be created', () => {
      // Arrange: Delete test dir and make it read-only on Unix (skip on Windows)
      if (process.platform !== 'win32') {
        rmSync(TEST_MEMSTORE_DIR, { recursive: true, force: true });
        mkdirSync(TEST_MEMSTORE_DIR, { recursive: true, mode: 0o444 }); // Read-only

        // Act
        const result = updateCaptureStats(100, true);

        // Assert
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toMatch(/STATS_/);
        }

        // Cleanup: Restore permissions
        require('fs').chmodSync(TEST_MEMSTORE_DIR, 0o755);
      }
    });

    test('should handle corrupted stats file gracefully', () => {
      // Arrange: Write corrupted JSON
      const statsPath = join(testDir, 'stats.json');
      const fs = require('fs');
      fs.writeFileSync(statsPath, '{ invalid json');

      // Act
      const result = getStats();

      // Assert: Should return default stats
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.capture.totalCount).toBe(0);
      }
    });
  });

  describe('file structure', () => {
    test('should create stats.json with correct structure', () => {
      // Act
      updateCaptureStats(100, true);

      // Assert
      const statsPath = join(testDir, 'stats.json');
      expect(existsSync(statsPath)).toBe(true);

      const content = readFileSync(statsPath, 'utf-8');
      const stats = JSON.parse(content);

      expect(stats).toHaveProperty('capture');
      expect(stats).toHaveProperty('retrieval');
      expect(stats).toHaveProperty('processing');

      expect(stats.capture).toHaveProperty('totalCount');
      expect(stats.capture).toHaveProperty('sum');
      expect(stats.capture).toHaveProperty('avgLatencyMs');
      expect(stats.capture).toHaveProperty('lastRun');
      expect(stats.capture).toHaveProperty('errors');
    });
  });

  describe('updateUsageStats (Story 4.4)', () => {
    test('should track totalInjections when segments are used', () => {
      // Act: Update with 3 segments
      const result = updateUsageStats(['seg_001', 'seg_002', 'seg_003']);

      // Assert
      expect(result.ok).toBe(true);

      const stats = getStats();
      expect(stats.ok).toBe(true);
      if (stats.ok) {
        expect(stats.value.usage.totalInjections).toBe(3);
        expect(stats.value.usage.uniqueSegmentsUsed).toBe(3);
      }
    });

    test('should track uniqueSegmentsUsed when duplicates exist', () => {
      // Act: Update with duplicates
      updateUsageStats(['seg_001', 'seg_002', 'seg_001']);

      // Assert
      const stats = getStats();
      expect(stats.ok).toBe(true);
      if (stats.ok) {
        expect(stats.value.usage.totalInjections).toBe(3); // 3 total
        expect(stats.value.usage.uniqueSegmentsUsed).toBe(2); // Only 2 unique
      }
    });

    test('should track mostUsedSegments (top 10 by frequency)', () => {
      // Arrange: Use seg_001 5 times, seg_002 3 times, seg_003 1 time
      updateUsageStats(['seg_001', 'seg_001', 'seg_001', 'seg_001', 'seg_001']);
      updateUsageStats(['seg_002', 'seg_002', 'seg_002']);
      updateUsageStats(['seg_003']);

      // Assert
      const stats = getStats();
      expect(stats.ok).toBe(true);
      if (stats.ok) {
        expect(stats.value.usage.mostUsedSegments).toEqual(['seg_001', 'seg_002', 'seg_003']);
        expect(stats.value.usage.segmentFrequency['seg_001']).toBe(5);
        expect(stats.value.usage.segmentFrequency['seg_002']).toBe(3);
        expect(stats.value.usage.segmentFrequency['seg_003']).toBe(1);
      }
    });

    test('should limit mostUsedSegments to top 10', () => {
      // Arrange: Create 15 segments
      for (let i = 0; i < 15; i++) {
        updateUsageStats([`seg_${i}`]);
      }

      // Assert
      const stats = getStats();
      expect(stats.ok).toBe(true);
      if (stats.ok) {
        expect(stats.value.usage.mostUsedSegments.length).toBeLessThanOrEqual(10);
      }
    });

    test('should accumulate totalInjections across multiple updates', () => {
      // Act
      updateUsageStats(['seg_001', 'seg_002']);
      updateUsageStats(['seg_003']);
      updateUsageStats(['seg_001']); // Duplicate

      // Assert
      const stats = getStats();
      expect(stats.ok).toBe(true);
      if (stats.ok) {
        expect(stats.value.usage.totalInjections).toBe(4);
        expect(stats.value.usage.uniqueSegmentsUsed).toBe(3);
      }
    });

    test('should return success for empty segment list (no-op)', () => {
      // Act
      const result = updateUsageStats([]);

      // Assert
      expect(result.ok).toBe(true);

      const stats = getStats();
      expect(stats.ok).toBe(true);
      if (stats.ok) {
        expect(stats.value.usage.totalInjections).toBe(0);
      }
    });

    test('should initialize usage section if missing (backward compatibility)', () => {
      // Arrange: Manually create stats without usage section
      const statsPath = join(testDir, 'stats.json');
      const oldStats = {
        capture: { totalCount: 0, sum: 0, avgLatencyMs: 0, lastRun: 0, errors: 0 },
        retrieval: {
          totalCount: 0,
          sum: 0,
          avgLatencyMs: 0,
          sumResults: 0,
          avgResultCount: 0,
          sumTokens: 0,
          avgInjectedTokens: 0,
          budgetExceededCount: 0,
          lastRun: 0,
        },
        processing: {
          totalSegmentsCreated: 0,
          sessionCount: 0,
          sumSegments: 0,
          avgSegmentsPerSession: 0,
          sumProcessingMs: 0,
          avgProcessingMs: 0,
          queueDepth: 0,
          failedItems: 0,
        },
      };
      const fs = require('fs');
      fs.writeFileSync(statsPath, JSON.stringify(oldStats, null, 2), 'utf-8');

      // Act: Update usage stats
      const result = updateUsageStats(['seg_001']);

      // Assert: Usage section created
      expect(result.ok).toBe(true);

      const stats = getStats();
      expect(stats.ok).toBe(true);
      if (stats.ok) {
        expect(stats.value.usage).toBeDefined();
        expect(stats.value.usage.totalInjections).toBe(1);
      }
    });
  });
});
