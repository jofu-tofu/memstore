/**
 * Tests for performance-metrics.ts (Story 6.4)
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import {
  getPerformanceMetrics,
  getSlowProviders,
  compareProviders,
  getTrends,
  DEFAULT_LATENCY_THRESHOLDS,
} from '../performance-metrics';
import type { CaptureOperationMetadata, RetrievalOperationMetadata } from '../operations-logger';

const TEST_PAI_DIR = join(homedir(), 'pai-test-performance-metrics');
const TEST_METRICS_DIR = join(TEST_PAI_DIR, 'mem-store', 'metrics');
const TEST_LOG_PATH = join(TEST_METRICS_DIR, 'operations.jsonl');

describe('performance-metrics (Story 6.4)', () => {
  beforeAll(() => {
    // Clean up any previous test data
    if (existsSync(TEST_PAI_DIR)) {
      rmSync(TEST_PAI_DIR, { recursive: true, force: true });
    }

    // Create test directory
    mkdirSync(TEST_METRICS_DIR, { recursive: true });

    // Set PAI_DIR for tests
    process.env.PAI_DIR = TEST_PAI_DIR;
  });

  afterAll(() => {
    // Clean up test directory
    if (existsSync(TEST_PAI_DIR)) {
      rmSync(TEST_PAI_DIR, { recursive: true, force: true });
    }

    // Restore original PAI_DIR
    delete process.env.PAI_DIR;
  });

  beforeEach(() => {
    // Clear operations log before each test
    if (existsSync(TEST_LOG_PATH)) {
      rmSync(TEST_LOG_PATH, { force: true });
    }
  });

  /**
   * Helper: Write operations to JSONL file
   */
  function writeOperations(operations: (CaptureOperationMetadata | RetrievalOperationMetadata)[]) {
    const lines = operations.map(op => JSON.stringify(op)).join('\n');
    writeFileSync(TEST_LOG_PATH, lines + '\n', 'utf-8');
  }

  describe('getPerformanceMetrics', () => {
    test('should return empty metrics when no operations logged', async () => {
      const result = await getPerformanceMetrics();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pipeline.segment.operationCount).toBe(0);
        expect(result.value.retrieval.search.operationCount).toBe(0);
      }
    });

    test('should calculate per-provider statistics from capture operations', async () => {
      const operations: CaptureOperationMetadata[] = [
        {
          sessionId: 'mem_1',
          capturedAt: Date.now(),
          segmentsCreated: 5,
          totalProcessingMs: 2000,
          providerTiming: {
            segment: { provider: 'per-message', latencyMs: 400 },
            extract: [{ provider: 'keyword-tagger', latencyMs: 300 }],
            summarize: { provider: 'simple-extract', latencyMs: 250 },
            storage: { provider: 'file-backend', latencyMs: 1050 },
          },
        },
        {
          sessionId: 'mem_2',
          capturedAt: Date.now(),
          segmentsCreated: 3,
          totalProcessingMs: 1500,
          providerTiming: {
            segment: { provider: 'per-message', latencyMs: 350 },
            extract: [{ provider: 'keyword-tagger', latencyMs: 200 }],
            summarize: { provider: 'simple-extract', latencyMs: 300 },
            storage: { provider: 'file-backend', latencyMs: 650 },
          },
        },
      ];

      writeOperations(operations);

      const result = await getPerformanceMetrics();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const report = result.value;

        // Segment provider
        expect(report.pipeline.segment.providerName).toBe('per-message');
        expect(report.pipeline.segment.operationCount).toBe(2);
        expect(report.pipeline.segment.avgMs).toBe(375); // (400 + 350) / 2

        // Extract provider
        expect(report.pipeline.extract.providerName).toBe('keyword-tagger');
        expect(report.pipeline.extract.operationCount).toBe(2);
        expect(report.pipeline.extract.avgMs).toBe(250); // (300 + 200) / 2

        // Summarize provider
        expect(report.pipeline.summarize.providerName).toBe('simple-extract');
        expect(report.pipeline.summarize.operationCount).toBe(2);
        expect(report.pipeline.summarize.avgMs).toBe(275); // (250 + 300) / 2

        // Storage provider
        expect(report.pipeline.storage.providerName).toBe('file-backend');
        expect(report.pipeline.storage.operationCount).toBe(2);
        expect(report.pipeline.storage.avgMs).toBe(850); // (1050 + 650) / 2
      }
    });

    test('should calculate percentiles correctly (p50, p95, p99)', async () => {
      // Create 100 operations with varying latencies
      const operations: CaptureOperationMetadata[] = Array.from({ length: 100 }, (_, i) => ({
        sessionId: `mem_${i}`,
        capturedAt: Date.now() + i,
        segmentsCreated: 1,
        totalProcessingMs: 1000,
        providerTiming: {
          segment: { provider: 'per-message', latencyMs: i * 10 }, // 0ms to 990ms
          extract: [],
          summarize: { provider: 'simple-extract', latencyMs: 100 },
          storage: { provider: 'file-backend', latencyMs: 200 },
        },
      }));

      writeOperations(operations);

      const result = await getPerformanceMetrics();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const metrics = result.value.pipeline.segment;

        // P50 (median) should be around 495ms (middle of 0-990)
        expect(metrics.p50Ms).toBeGreaterThanOrEqual(450);
        expect(metrics.p50Ms).toBeLessThanOrEqual(550);

        // P95 should be around 940ms (95th percentile of 0-990)
        expect(metrics.p95Ms).toBeGreaterThanOrEqual(900);
        expect(metrics.p95Ms).toBeLessThanOrEqual(950);

        // P99 should be around 980ms (99th percentile of 0-990)
        expect(metrics.p99Ms).toBeGreaterThanOrEqual(970);
        expect(metrics.p99Ms).toBeLessThanOrEqual(990);

        // Min and Max
        expect(metrics.minMs).toBe(0);
        expect(metrics.maxMs).toBe(990);
      }
    });

    test('should calculate retrieval layer metrics correctly', async () => {
      const operations: RetrievalOperationMetadata[] = [
        {
          timestamp: Date.now(),
          queryLength: 45,
          termsExtracted: 4,
          candidatesFound: 23,
          resultsReturned: 5,
          tokensInjected: 920,
          totalLatencyMs: 280,
          success: true,
          layerTiming: {
            search: { provider: 'keyword-search', latencyMs: 180 },
            filter: { latencyMs: 35 },
            rank: { latencyMs: 40 },
            inject: { latencyMs: 25 },
          },
        },
        {
          timestamp: Date.now(),
          queryLength: 30,
          termsExtracted: 3,
          candidatesFound: 10,
          resultsReturned: 3,
          tokensInjected: 500,
          totalLatencyMs: 200,
          success: true,
          layerTiming: {
            search: { provider: 'keyword-search', latencyMs: 120 },
            filter: { latencyMs: 30 },
            rank: { latencyMs: 35 },
            inject: { latencyMs: 15 },
          },
        },
      ];

      writeOperations(operations);

      const result = await getPerformanceMetrics();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const report = result.value;

        // Search layer
        expect(report.retrieval.search.providerName).toBe('keyword-search');
        expect(report.retrieval.search.operationCount).toBe(2);
        expect(report.retrieval.search.avgMs).toBe(150); // (180 + 120) / 2

        // Filter layer
        expect(report.retrieval.filter.operationCount).toBe(2);
        expect(report.retrieval.filter.avgMs).toBe(32.5); // (35 + 30) / 2

        // Rank layer
        expect(report.retrieval.rank.operationCount).toBe(2);
        expect(report.retrieval.rank.avgMs).toBe(37.5); // (40 + 35) / 2

        // Inject layer
        expect(report.retrieval.inject.operationCount).toBe(2);
        expect(report.retrieval.inject.avgMs).toBe(20); // (25 + 15) / 2
      }
    });

    test('should detect slow providers exceeding thresholds', async () => {
      const operations: CaptureOperationMetadata[] = [
        {
          sessionId: 'mem_slow',
          capturedAt: Date.now(),
          segmentsCreated: 5,
          totalProcessingMs: 3000,
          providerTiming: {
            segment: { provider: 'per-message', latencyMs: 600 }, // Exceeds 500ms threshold
            extract: [{ provider: 'keyword-tagger', latencyMs: 900 }], // Exceeds 800ms threshold
            summarize: { provider: 'simple-extract', latencyMs: 250 },
            storage: { provider: 'file-backend', latencyMs: 250 },
          },
        },
      ];

      writeOperations(operations);

      const result = await getPerformanceMetrics();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const report = result.value;

        expect(report.slowProviders.length).toBe(2);

        // Segment provider should be flagged
        const slowSegment = report.slowProviders.find(p => p.category === 'segment');
        expect(slowSegment).toBeDefined();
        expect(slowSegment?.providerName).toBe('per-message');
        expect(slowSegment?.avgMs).toBe(600);
        expect(slowSegment?.threshold).toBe(500);

        // Extract provider should be flagged
        const slowExtract = report.slowProviders.find(p => p.category === 'extract');
        expect(slowExtract).toBeDefined();
        expect(slowExtract?.providerName).toBe('keyword-tagger');
        expect(slowExtract?.avgMs).toBe(900);
        expect(slowExtract?.threshold).toBe(800);
      }
    });

    test('should detect quality issues (low success rate)', async () => {
      const operations: RetrievalOperationMetadata[] = [
        // 3 successful, 7 failed = 30% success rate (< 70% threshold)
        ...Array.from({ length: 3 }, (_, i) => ({
          timestamp: Date.now() + i,
          queryLength: 30,
          termsExtracted: 3,
          candidatesFound: 10,
          resultsReturned: 5,
          tokensInjected: 500,
          totalLatencyMs: 200,
          success: true,
          layerTiming: {
            search: { provider: 'keyword-search', latencyMs: 120 },
            filter: { latencyMs: 30 },
            rank: { latencyMs: 35 },
            inject: { latencyMs: 15 },
          },
        })),
        ...Array.from({ length: 7 }, (_, i) => ({
          timestamp: Date.now() + i + 100,
          queryLength: 30,
          termsExtracted: 3,
          candidatesFound: 0,
          resultsReturned: 0,
          tokensInjected: 0,
          totalLatencyMs: 50,
          success: false,
          reason: 'no_matches' as const,
          layerTiming: {
            search: { provider: 'keyword-search', latencyMs: 30 },
            filter: { latencyMs: 5 },
            rank: { latencyMs: 10 },
            inject: { latencyMs: 5 },
          },
        })),
      ];

      writeOperations(operations);

      const result = await getPerformanceMetrics();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const report = result.value;

        expect(report.qualityIssues.length).toBe(1);
        expect(report.qualityIssues[0].providerName).toBe('keyword-search');
        expect(report.qualityIssues[0].successRate).toBe(30); // 3/10 = 30%
        expect(report.qualityIssues[0].threshold).toBe(70);
      }
    });

    test('should handle time range filtering', async () => {
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;

      const operations: CaptureOperationMetadata[] = [
        {
          sessionId: 'mem_old',
          capturedAt: twoDaysAgo,
          segmentsCreated: 1,
          totalProcessingMs: 1000,
          providerTiming: {
            segment: { provider: 'per-message', latencyMs: 300 },
            extract: [],
            summarize: { provider: 'simple-extract', latencyMs: 200 },
            storage: { provider: 'file-backend', latencyMs: 500 },
          },
        },
        {
          sessionId: 'mem_recent',
          capturedAt: now - 1000,
          segmentsCreated: 1,
          totalProcessingMs: 1000,
          providerTiming: {
            segment: { provider: 'per-message', latencyMs: 400 },
            extract: [],
            summarize: { provider: 'simple-extract', latencyMs: 250 },
            storage: { provider: 'file-backend', latencyMs: 350 },
          },
        },
      ];

      writeOperations(operations);

      // Query only last 24 hours
      const timeRange = {
        start: oneDayAgo,
        end: now,
        durationMs: 24 * 60 * 60 * 1000,
      };

      const result = await getPerformanceMetrics(timeRange);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should only include the recent operation
        expect(result.value.pipeline.segment.operationCount).toBe(1);
        expect(result.value.pipeline.segment.avgMs).toBe(400); // Only recent operation
      }
    });

    test('should handle corrupted JSONL lines gracefully', async () => {
      // Write some valid and some corrupted lines
      const lines = [
        JSON.stringify({
          sessionId: 'mem_1',
          capturedAt: Date.now(),
          segmentsCreated: 1,
          totalProcessingMs: 1000,
          providerTiming: {
            segment: { provider: 'per-message', latencyMs: 300 },
            extract: [],
            summarize: { provider: 'simple-extract', latencyMs: 200 },
            storage: { provider: 'file-backend', latencyMs: 500 },
          },
        }),
        'invalid json line {corrupted',
        JSON.stringify({
          sessionId: 'mem_2',
          capturedAt: Date.now(),
          segmentsCreated: 1,
          totalProcessingMs: 1000,
          providerTiming: {
            segment: { provider: 'per-message', latencyMs: 350 },
            extract: [],
            summarize: { provider: 'simple-extract', latencyMs: 250 },
            storage: { provider: 'file-backend', latencyMs: 400 },
          },
        }),
      ];

      writeFileSync(TEST_LOG_PATH, lines.join('\n') + '\n', 'utf-8');

      const result = await getPerformanceMetrics();

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should have processed 2 valid operations, skipped 1 corrupted
        expect(result.value.pipeline.segment.operationCount).toBe(2);
        expect(result.value.pipeline.segment.avgMs).toBe(325); // (300 + 350) / 2
      }
    });
  });

  describe('getSlowProviders', () => {
    test('should return empty array when no slow providers', async () => {
      const operations: CaptureOperationMetadata[] = [
        {
          sessionId: 'mem_fast',
          capturedAt: Date.now(),
          segmentsCreated: 1,
          totalProcessingMs: 1000,
          providerTiming: {
            segment: { provider: 'per-message', latencyMs: 200 },
            extract: [{ provider: 'keyword-tagger', latencyMs: 150 }],
            summarize: { provider: 'simple-extract', latencyMs: 100 },
            storage: { provider: 'file-backend', latencyMs: 150 },
          },
        },
      ];

      writeOperations(operations);

      const result = await getSlowProviders();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(0);
      }
    });

    test('should return slow providers exceeding thresholds', async () => {
      const operations: CaptureOperationMetadata[] = [
        {
          sessionId: 'mem_slow',
          capturedAt: Date.now(),
          segmentsCreated: 1,
          totalProcessingMs: 2000,
          providerTiming: {
            segment: { provider: 'per-message', latencyMs: 700 }, // > 500ms
            extract: [{ provider: 'keyword-tagger', latencyMs: 200 }],
            summarize: { provider: 'simple-extract', latencyMs: 100 },
            storage: { provider: 'file-backend', latencyMs: 1000 }, // > 300ms
          },
        },
      ];

      writeOperations(operations);

      const result = await getSlowProviders();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(2);

        const categories = result.value.map(p => p.category);
        expect(categories).toContain('segment');
        expect(categories).toContain('storage');
      }
    });
  });

  describe('compareProviders', () => {
    test('should compare two providers correctly', async () => {
      const operations: CaptureOperationMetadata[] = [
        {
          sessionId: 'mem_1',
          capturedAt: Date.now(),
          segmentsCreated: 1,
          totalProcessingMs: 1000,
          providerTiming: {
            segment: { provider: 'per-message', latencyMs: 400 },
            extract: [],
            summarize: { provider: 'simple-extract', latencyMs: 250 },
            storage: { provider: 'file-backend', latencyMs: 350 },
          },
        },
      ];

      writeOperations(operations);

      const result = await compareProviders('per-message', 'simple-extract');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.providerA).toBe('per-message');
        expect(result.value.providerB).toBe('simple-extract');
        expect(result.value.metricsA.avgMs).toBe(400);
        expect(result.value.metricsB.avgMs).toBe(250);
        expect(result.value.delta.avgLatencyDelta).toBe(-150); // B is faster
        expect(result.value.recommendation).toBe('B');
      }
    });

    test('should return error when provider not found', async () => {
      const result = await compareProviders('non-existent', 'per-message');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('METRICS_PROVIDER_NOT_FOUND');
      }
    });
  });

  describe('getTrends', () => {
    test('should detect improving trends', async () => {
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;

      const operations: CaptureOperationMetadata[] = [
        // Old: 500ms
        {
          sessionId: 'mem_old',
          capturedAt: twoDaysAgo,
          segmentsCreated: 1,
          totalProcessingMs: 1000,
          providerTiming: {
            segment: { provider: 'per-message', latencyMs: 500 },
            extract: [],
            summarize: { provider: 'simple-extract', latencyMs: 200 },
            storage: { provider: 'file-backend', latencyMs: 300 },
          },
        },
        // New: 350ms (30% improvement)
        {
          sessionId: 'mem_new',
          capturedAt: now - 1000,
          segmentsCreated: 1,
          totalProcessingMs: 1000,
          providerTiming: {
            segment: { provider: 'per-message', latencyMs: 350 },
            extract: [],
            summarize: { provider: 'simple-extract', latencyMs: 250 },
            storage: { provider: 'file-backend', latencyMs: 400 },
          },
        },
      ];

      writeOperations(operations);

      const timeRange = {
        start: oneDayAgo,
        end: now,
        durationMs: 24 * 60 * 60 * 1000,
      };

      const result = await getTrends(timeRange);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const trend = result.value.providerTrends.find(t => t.providerName === 'per-message');
        expect(trend).toBeDefined();
        expect(trend?.direction).toBe('improving');
        expect(trend?.percentChange).toBeLessThan(0); // Negative = improvement
      }
    });

    test('should detect degrading trends', async () => {
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;

      const operations: CaptureOperationMetadata[] = [
        // Old: 300ms
        {
          sessionId: 'mem_old',
          capturedAt: twoDaysAgo,
          segmentsCreated: 1,
          totalProcessingMs: 1000,
          providerTiming: {
            segment: { provider: 'per-message', latencyMs: 300 },
            extract: [],
            summarize: { provider: 'simple-extract', latencyMs: 200 },
            storage: { provider: 'file-backend', latencyMs: 500 },
          },
        },
        // New: 500ms (66% degradation)
        {
          sessionId: 'mem_new',
          capturedAt: now - 1000,
          segmentsCreated: 1,
          totalProcessingMs: 1000,
          providerTiming: {
            segment: { provider: 'per-message', latencyMs: 500 },
            extract: [],
            summarize: { provider: 'simple-extract', latencyMs: 250 },
            storage: { provider: 'file-backend', latencyMs: 250 },
          },
        },
      ];

      writeOperations(operations);

      const timeRange = {
        start: oneDayAgo,
        end: now,
        durationMs: 24 * 60 * 60 * 1000,
      };

      const result = await getTrends(timeRange);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const trend = result.value.providerTrends.find(t => t.providerName === 'per-message');
        expect(trend).toBeDefined();
        expect(trend?.direction).toBe('degrading');
        expect(trend?.percentChange).toBeGreaterThan(0); // Positive = degradation
      }
    });
  });

  describe('backward compatibility', () => {
    test('should handle old schema (without providerTiming)', async () => {
      const operations: CaptureOperationMetadata[] = [
        {
          sessionId: 'mem_old_schema',
          capturedAt: Date.now(),
          segmentsCreated: 5,
          processingMs: 2100,
          providers: {
            segment: 'per-message',
            extract: ['frontmatter-gen', 'keyword-tagger'],
            summarize: 'simple-extract',
            storage: 'file-backend',
          },
        },
      ];

      writeOperations(operations);

      const result = await getPerformanceMetrics();

      expect(result.ok).toBe(true);
      // Should return empty metrics for providers (no timing data in old schema)
      if (result.ok) {
        expect(result.value.pipeline.segment.operationCount).toBe(0);
      }
    });
  });
});
