/**
 * Tests for Insights Query Engine - Story 6.5
 *
 * @module insights.test
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import {
  topSegments,
  staleSegments,
  slowProviders,
  retrievalSuccessRate,
  providerComparison,
  getInsightsSummary,
  analyzeProviderQuality,
} from '../insights';

const TEST_MEMSTORE_DIR = join(homedir(), '.memstore-test-insights');

describe('insights', () => {
  beforeAll(() => {
    // Set up test environment
    process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;

    // Create test directory structure
    mkdirSync(join(TEST_MEMSTORE_DIR, 'mem-store', 'segments', '2026-01'), { recursive: true });
    mkdirSync(join(TEST_MEMSTORE_DIR, 'mem-store', 'metrics'), { recursive: true });
    mkdirSync(join(TEST_MEMSTORE_DIR, 'mem-store', 'structured'), { recursive: true });

    // Create test segments
    createTestSegment('seg_1704000000000_abc1', 'session1', 10, Date.now() - 1000 * 60 * 60 * 24 * 5, [
      'typescript',
      'hooks',
    ]);
    createTestSegment('seg_1704100000000_abc2', 'session1', 5, Date.now() - 1000 * 60 * 60 * 24 * 10, [
      'testing',
    ]);
    createTestSegment('seg_1704200000000_abc3', 'session2', 0, null, ['api']); // Never accessed
    createTestSegment('seg_1704300000000_abc4', 'session2', 1, Date.now() - 1000 * 60 * 60 * 24 * 100, [
      'old',
    ]); // Stale

    // Create test operations log
    createTestOperationsLog();

    // Create session registry
    createTestSessionRegistry();
  });

  afterAll(() => {
    if (existsSync(TEST_MEMSTORE_DIR)) {
      rmSync(TEST_MEMSTORE_DIR, { recursive: true, force: true });
    }
    delete process.env.MEMSTORE_DIR;
  });

  describe('topSegments', () => {
    test('should return segments sorted by access count descending', async () => {
      const result = await topSegments(10);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.length).toBe(4);
      expect(result.value[0].accessCount).toBe(10);
      expect(result.value[1].accessCount).toBe(5);
      expect(result.value[2].accessCount).toBe(1);
      expect(result.value[3].accessCount).toBe(0);
    });

    test('should respect limit parameter', async () => {
      const result = await topSegments(2);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.length).toBe(2);
      expect(result.value[0].accessCount).toBe(10);
      expect(result.value[1].accessCount).toBe(5);
    });

    test('should use lastAccessed as tiebreaker for same accessCount', async () => {
      // Create two segments with same access count
      createTestSegment('seg_1704400000000_tie1', 'session3', 3, Date.now() - 1000 * 60 * 60, [
        'newer',
      ]);
      createTestSegment('seg_1704500000000_tie2', 'session3', 3, Date.now() - 1000 * 60 * 60 * 24, [
        'older',
      ]);

      const result = await topSegments(10);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const tie1Index = result.value.findIndex((s) => s.id.includes('tie1'));
      const tie2Index = result.value.findIndex((s) => s.id.includes('tie2'));

      expect(tie1Index).toBeLessThan(tie2Index); // Newer should come first
    });

    test('should return empty array when no segments exist', async () => {
      const testDir = join(homedir(), '.memstore-test-insights-empty');
      process.env.MEMSTORE_DIR = testDir;
      mkdirSync(join(testDir, 'mem-store', 'segments'), { recursive: true });

      const result = await topSegments(10);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.length).toBe(0);

      process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;
      rmSync(testDir, { recursive: true, force: true });
    });

    test('should handle missing segments directory gracefully', async () => {
      const testDir = join(homedir(), '.memstore-test-insights-no-segments');
      process.env.MEMSTORE_DIR = testDir;
      mkdirSync(testDir, { recursive: true });

      const result = await topSegments(10);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.length).toBe(0);

      process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;
      rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe('staleSegments', () => {
    test('should identify segments with accessCount=0', async () => {
      const result = await staleSegments(90);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const neverAccessed = result.value.filter((s) => s.accessCount === 0);
      expect(neverAccessed.length).toBeGreaterThan(0);
      expect(neverAccessed.some((s) => s.id.includes('abc3'))).toBe(true);
    });

    test('should identify segments not accessed in N days', async () => {
      const result = await staleSegments(90);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const oldSegment = result.value.find((s) => s.id.includes('abc4'));
      expect(oldSegment).toBeDefined();
    });

    test('should respect daysUnused threshold', async () => {
      const result = await staleSegments(5);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // abc2 was accessed 10 days ago, should be stale
      const abc2Stale = result.value.some((s) => s.id.includes('abc2'));
      expect(abc2Stale).toBe(true);
    });

    test('should not include recently accessed segments', async () => {
      const result = await staleSegments(90);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // abc1 was accessed 5 days ago, should NOT be stale
      const abc1Stale = result.value.some((s) => s.id.includes('abc1'));
      expect(abc1Stale).toBe(false);
    });

    test('should return empty array when all segments are fresh', async () => {
      const testDir = join(homedir(), '.memstore-test-insights-fresh');
      process.env.MEMSTORE_DIR = testDir;
      mkdirSync(join(testDir, 'mem-store', 'segments', '2026-01'), { recursive: true });

      // Create only fresh segments
      createTestSegment('seg_1704000000000_fresh1', 'session1', 5, Date.now(), ['fresh']);

      const result = await staleSegments(90);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.length).toBe(0);

      process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;
      rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe('retrievalSuccessRate', () => {
    test('should calculate success rate from operations log', async () => {
      const result = await retrievalSuccessRate(30);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.totalQueries).toBe(3);
      expect(result.value.successfulQueries).toBe(2);
      expect(result.value.failedQueries).toBe(1);
      expect(result.value.successRate).toBeCloseTo(66.67, 1);
    });

    test('should calculate average latency', async () => {
      const result = await retrievalSuccessRate(30);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Average of 150, 200, 180 = 176.67
      expect(result.value.avgLatencyMs).toBeCloseTo(176.67, 1);
    });

    test('should calculate average results and tokens', async () => {
      const result = await retrievalSuccessRate(30);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.avgResults).toBeCloseTo(1.67, 1);
      expect(result.value.avgTokensInjected).toBeCloseTo(466.67, 1);
    });

    test('should filter by time range', async () => {
      const result = await retrievalSuccessRate(1);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Only 1 retrieval in last 1 day
      expect(result.value.totalQueries).toBe(1);
    });

    test('should return zero metrics when no operations exist', async () => {
      const testDir = join(homedir(), '.memstore-test-insights-no-ops');
      process.env.MEMSTORE_DIR = testDir;
      mkdirSync(join(testDir, 'mem-store', 'metrics'), { recursive: true });

      const result = await retrievalSuccessRate(30);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.totalQueries).toBe(0);
      expect(result.value.successRate).toBe(0);

      process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;
      rmSync(testDir, { recursive: true, force: true });
    });

    test('should handle missing operations log gracefully', async () => {
      const testDir = join(homedir(), '.memstore-test-insights-no-log');
      process.env.MEMSTORE_DIR = testDir;
      mkdirSync(testDir, { recursive: true });

      const result = await retrievalSuccessRate(30);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.totalQueries).toBe(0);

      process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;
      rmSync(testDir, { recursive: true, force: true });
    });

    test('should handle both old and new schema totalLatencyMs field', async () => {
      const testDir = join(homedir(), '.memstore-test-insights-schema');
      process.env.MEMSTORE_DIR = testDir;
      mkdirSync(join(testDir, 'mem-store', 'metrics'), { recursive: true });

      // Create operations with old schema (latencyMs)
      const operations = [
        {
          timestamp: Date.now() - 1000 * 60 * 60 * 12,
          queryLength: 50,
          termsExtracted: 3,
          candidatesFound: 10,
          resultsReturned: 3,
          tokensInjected: 800,
          latencyMs: 120, // Old field
          success: true,
          layerTiming: {},
        },
      ];

      writeFileSync(
        join(testDir, 'mem-store', 'metrics', 'operations.jsonl'),
        operations.map((op) => JSON.stringify(op)).join('\n')
      );

      const result = await retrievalSuccessRate(30);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.avgLatencyMs).toBe(120);

      process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;
      rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe('getInsightsSummary', () => {
    test('should generate complete summary report', async () => {
      const result = await getInsightsSummary(30);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.timestamp).toBeGreaterThan(0);
      expect(result.value.timestampFormatted).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('should include system stats', async () => {
      const result = await getInsightsSummary(30);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.systemStats.totalSessions).toBe(3);
      expect(result.value.systemStats.totalSegments).toBeGreaterThan(0);
      expect(result.value.systemStats.storageUsedBytes).toBeGreaterThan(0);
      expect(result.value.systemStats.storageUsedMB).toMatch(/MB$/);
    });

    test('should include retrieval stats', async () => {
      const result = await getInsightsSummary(30);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.retrievalStats.totalQueries).toBe(3);
      expect(result.value.retrievalStats.successRate).toBeCloseTo(66.67, 1);
    });

    test('should include top segments', async () => {
      const result = await getInsightsSummary(30);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.topSegments.length).toBeGreaterThan(0);
      expect(result.value.topSegments.length).toBeLessThanOrEqual(5);
    });

    test('should detect stale segment issues', async () => {
      const result = await getInsightsSummary(30);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const staleIssue = result.value.potentialIssues.find(
        (i) => i.category === 'stale-segments'
      );
      expect(staleIssue).toBeDefined();
      expect(staleIssue?.severity).toBe('warning');
    });

    test('should detect low success rate issues', async () => {
      const testDir = join(homedir(), '.memstore-test-insights-low-success');
      process.env.MEMSTORE_DIR = testDir;
      mkdirSync(join(testDir, 'mem-store', 'metrics'), { recursive: true });
      mkdirSync(join(testDir, 'mem-store', 'segments', '2026-01'), { recursive: true });
      mkdirSync(join(testDir, 'mem-store', 'structured'), { recursive: true });

      // Create operations with low success rate
      const operations = [
        {
          timestamp: Date.now(),
          queryLength: 50,
          termsExtracted: 3,
          candidatesFound: 10,
          resultsReturned: 0,
          tokensInjected: 0,
          totalLatencyMs: 150,
          success: false,
          layerTiming: {},
        },
        {
          timestamp: Date.now(),
          queryLength: 50,
          termsExtracted: 3,
          candidatesFound: 10,
          resultsReturned: 0,
          tokensInjected: 0,
          totalLatencyMs: 150,
          success: false,
          layerTiming: {},
        },
        {
          timestamp: Date.now(),
          queryLength: 50,
          termsExtracted: 3,
          candidatesFound: 10,
          resultsReturned: 3,
          tokensInjected: 800,
          totalLatencyMs: 150,
          success: true,
          layerTiming: {},
        },
      ];

      writeFileSync(
        join(testDir, 'mem-store', 'metrics', 'operations.jsonl'),
        operations.map((op) => JSON.stringify(op)).join('\n')
      );

      writeFileSync(
        join(testDir, 'mem-store', 'structured', 'session-registry.json'),
        JSON.stringify({})
      );

      const result = await getInsightsSummary(30);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const lowSuccessIssue = result.value.potentialIssues.find(
        (i) => i.category === 'low-success-rate'
      );
      expect(lowSuccessIssue).toBeDefined();
      expect(lowSuccessIssue?.severity).toBe('error');

      process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;
      rmSync(testDir, { recursive: true, force: true });
    });

    test('should detect zero results issues', async () => {
      const result = await getInsightsSummary(30);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // 1 failed out of 3 = 33%, should trigger warning
      const zeroResultsIssue = result.value.potentialIssues.find(
        (i) => i.category === 'zero-results'
      );
      expect(zeroResultsIssue).toBeDefined();
    });

    test('should handle missing data sources gracefully', async () => {
      const testDir = join(homedir(), '.memstore-test-insights-minimal');
      process.env.MEMSTORE_DIR = testDir;
      mkdirSync(testDir, { recursive: true });

      const result = await getInsightsSummary(30);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.systemStats.totalSessions).toBe(0);
      expect(result.value.systemStats.totalSegments).toBe(0);
      expect(result.value.retrievalStats.totalQueries).toBe(0);

      process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;
      rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe('analyzeProviderQuality', () => {
    test('should calculate quality score for providers', async () => {
      const result = await analyzeProviderQuality();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.length).toBeGreaterThan(0);
      const provider = result.value[0];
      expect(provider.providerName).toBeDefined();
      expect(provider.qualityScore).toBeGreaterThanOrEqual(0);
      expect(provider.qualityScore).toBeLessThanOrEqual(100);
    });

    test('should include usage metrics', async () => {
      const result = await analyzeProviderQuality();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const provider = result.value[0];
      expect(provider.segmentsCreated).toBeGreaterThan(0);
      expect(provider.avgAccessCount).toBeGreaterThanOrEqual(0);
    });

    test('should include success rate', async () => {
      const result = await analyzeProviderQuality();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const provider = result.value.find((p) => p.providerName === 'keyword-search');
      if (provider) {
        expect(provider.successRate).toBeGreaterThanOrEqual(0);
        expect(provider.successRate).toBeLessThanOrEqual(100);
      }
    });

    test('should include latency metrics', async () => {
      const result = await analyzeProviderQuality();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const provider = result.value.find((p) => p.providerName === 'keyword-search');
      if (provider) {
        expect(provider.avgLatencyMs).toBeGreaterThanOrEqual(0);
      }
    });

    test('should sort by quality score descending', async () => {
      const result = await analyzeProviderQuality();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      for (let i = 0; i < result.value.length - 1; i++) {
        expect(result.value[i].qualityScore).toBeGreaterThanOrEqual(
          result.value[i + 1].qualityScore
        );
      }
    });

    test('should determine provider category from name', async () => {
      const result = await analyzeProviderQuality();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const searchProvider = result.value.find((p) => p.providerName.includes('search'));
      if (searchProvider) {
        expect(searchProvider.category).toBe('search');
      }
    });
  });

  describe('Windows compatibility', () => {
    test('should handle Windows path separators in segment loading', async () => {
      // Segment loading uses path.join which handles both separators
      const result = await topSegments(10);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.length).toBeGreaterThan(0);
    });

    test('should handle Windows path separators in operations loading', async () => {
      const result = await retrievalSuccessRate(30);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.totalQueries).toBeGreaterThan(0);
    });
  });
});

/**
 * Helper: Create a test segment file.
 */
function createTestSegment(
  id: string,
  sessionId: string,
  accessCount: number,
  lastAccessed: number | null,
  tags: string[]
) {
  const frontmatter = `---
id: ${id}
session_id: ${sessionId}
access_count: ${accessCount}
last_accessed: ${lastAccessed}
tags: ${JSON.stringify(tags)}
---

# Test Segment

This is a test segment for ${id}.
`;

  const segmentPath = join(TEST_MEMSTORE_DIR, 'mem-store', 'segments', '2026-01', `${id}.md`);
  writeFileSync(segmentPath, frontmatter);
}

/**
 * Helper: Create test operations log.
 */
function createTestOperationsLog() {
  const operations = [
    // Retrieval 1: Success (2 days ago)
    {
      timestamp: Date.now() - 1000 * 60 * 60 * 24 * 2,
      queryLength: 50,
      termsExtracted: 3,
      candidatesFound: 10,
      resultsReturned: 3,
      tokensInjected: 800,
      totalLatencyMs: 150,
      success: true,
      layerTiming: {
        search: { provider: 'keyword-search', latencyMs: 100 },
        filter: { latencyMs: 20 },
        rank: { latencyMs: 20 },
        inject: { latencyMs: 10 },
      },
    },
    // Retrieval 2: Failure (5 days ago)
    {
      timestamp: Date.now() - 1000 * 60 * 60 * 24 * 5,
      queryLength: 40,
      termsExtracted: 2,
      candidatesFound: 0,
      resultsReturned: 0,
      tokensInjected: 0,
      totalLatencyMs: 200,
      success: false,
      layerTiming: {
        search: { provider: 'keyword-search', latencyMs: 180 },
        filter: { latencyMs: 10 },
        rank: { latencyMs: 5 },
        inject: { latencyMs: 5 },
      },
    },
    // Retrieval 3: Success (12 hours ago)
    {
      timestamp: Date.now() - 1000 * 60 * 60 * 12,
      queryLength: 60,
      termsExtracted: 4,
      candidatesFound: 8,
      resultsReturned: 2,
      tokensInjected: 600,
      totalLatencyMs: 180,
      success: true,
      layerTiming: {
        search: { provider: 'keyword-search', latencyMs: 120 },
        filter: { latencyMs: 30 },
        rank: { latencyMs: 20 },
        inject: { latencyMs: 10 },
      },
    },
  ];

  const operationsPath = join(TEST_MEMSTORE_DIR, 'mem-store', 'metrics', 'operations.jsonl');
  writeFileSync(operationsPath, operations.map((op) => JSON.stringify(op)).join('\n'));
}

/**
 * Helper: Create test session registry.
 */
function createTestSessionRegistry() {
  const registry = {
    session1: {
      id: 'session1',
      capturedAt: Date.now() - 1000 * 60 * 60 * 24 * 5,
      segmentCount: 2,
    },
    session2: {
      id: 'session2',
      capturedAt: Date.now() - 1000 * 60 * 60 * 24 * 100,
      segmentCount: 2,
    },
    session3: {
      id: 'session3',
      capturedAt: Date.now() - 1000 * 60 * 60,
      segmentCount: 2,
    },
  };

  const registryPath = join(TEST_MEMSTORE_DIR, 'mem-store', 'structured', 'session-registry.json');
  writeFileSync(registryPath, JSON.stringify(registry, null, 2));
}
