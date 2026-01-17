/**
 * Performance tests for A/B testing framework (Story 5.4 Task 10)
 *
 * Validates that experiment overhead meets performance requirements:
 * - Variant selection: < 1ms
 * - Logging overhead: < 5ms (async)
 * - Total overhead: < 10ms per request
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { selectVariant } from '../core/experiment';
import { logExperimentResult } from '../lib/logging/experiment-logger';
import type { ExperimentConfig } from '../core/config';

const TEST_DIR = join(homedir(), 'pai-test-experiment-performance');
const METRICS_DIR = join(TEST_DIR, 'mem-store/metrics/experiments');

beforeAll(() => {
  mkdirSync(METRICS_DIR, { recursive: true });
  process.env.PAI_DIR = TEST_DIR;
});

afterAll(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  delete process.env.PAI_DIR;
});

describe('Variant Selection Performance (Task 10.4)', () => {
  test('should complete variant selection in < 1ms', () => {
    const config: ExperimentConfig = {
      enabled: true,
      variants: {
        control: 'keyword-search',
        treatment: 'semantic-search',
      },
      splitPercent: 50,
    };

    // Warmup (allow for any JIT compilation)
    for (let i = 0; i < 100; i++) {
      selectVariant('test-exp', `request-${i}`, config);
    }

    // Benchmark 1000 selections
    const iterations = 1000;
    const startTime = performance.now();

    for (let i = 0; i < iterations; i++) {
      selectVariant('test-exp', `request-${i}`, config);
    }

    const endTime = performance.now();
    const totalMs = endTime - startTime;
    const avgMs = totalMs / iterations;

    console.error(`Variant selection average: ${avgMs.toFixed(4)}ms per call`);
    expect(avgMs).toBeLessThan(1.0); // Target: < 1ms
  });

  test('should handle multi-variant selection efficiently', () => {
    const config: ExperimentConfig = {
      enabled: true,
      variants: {
        control: 'default',
        'treatment-a': 'variant-a',
        'treatment-b': 'variant-b',
        'treatment-c': 'variant-c',
      },
      splitPercent: {
        control: 40,
        'treatment-a': 20,
        'treatment-b': 20,
        'treatment-c': 20,
      },
    };

    // Warmup
    for (let i = 0; i < 100; i++) {
      selectVariant('multi-exp', `request-${i}`, config);
    }

    // Benchmark 1000 selections
    const iterations = 1000;
    const startTime = performance.now();

    for (let i = 0; i < iterations; i++) {
      selectVariant('multi-exp', `request-${i}`, config);
    }

    const endTime = performance.now();
    const totalMs = endTime - startTime;
    const avgMs = totalMs / iterations;

    console.error(`Multi-variant selection average: ${avgMs.toFixed(4)}ms per call`);
    expect(avgMs).toBeLessThan(1.0); // Should still be < 1ms
  });

  test('should have minimal memory allocations in hot path', () => {
    const config: ExperimentConfig = {
      enabled: true,
      variants: {
        control: 'keyword-search',
        treatment: 'semantic-search',
      },
      splitPercent: 50,
    };

    // Measure memory before
    const memBefore = process.memoryUsage().heapUsed;

    // Perform 10000 selections
    for (let i = 0; i < 10000; i++) {
      selectVariant('test-exp', `request-${i}`, config);
    }

    // Measure memory after
    const memAfter = process.memoryUsage().heapUsed;
    const memDelta = memAfter - memBefore;
    const bytesPerCall = memDelta / 10000;

    console.error(`Memory allocation per selection: ${bytesPerCall.toFixed(2)} bytes`);

    // Should allocate < 1KB per call (allowing for GC variance)
    expect(bytesPerCall).toBeLessThan(1024);
  });
});

describe('Logging Performance (Task 10.5)', () => {
  test('should complete async logging in < 5ms', async () => {
    const dataPoint = {
      experimentId: 'perf-test',
      variant: 'control',
      timestamp: Date.now(),
      latencyMs: 100,
      resultCount: 5,
      injectedTokens: 1000,
      queryHash: 'abc123',
      success: true,
    };

    // Warmup
    for (let i = 0; i < 10; i++) {
      await logExperimentResult({
        ...dataPoint,
        queryHash: `warmup-${i}`,
      });
    }

    // Benchmark 100 logging calls
    const iterations = 100;
    const startTime = performance.now();

    const promises = [];
    for (let i = 0; i < iterations; i++) {
      promises.push(
        logExperimentResult({
          ...dataPoint,
          queryHash: `benchmark-${i}`,
        })
      );
    }

    // Wait for all to complete
    await Promise.all(promises);

    const endTime = performance.now();
    const totalMs = endTime - startTime;
    const avgMs = totalMs / iterations;

    console.error(`Async logging average: ${avgMs.toFixed(4)}ms per call`);
    expect(avgMs).toBeLessThan(5.0); // Target: < 5ms
  });

  test('should handle concurrent writes without data loss', async () => {
    const baseDataPoint = {
      experimentId: 'concurrent-test',
      variant: 'control',
      timestamp: Date.now(),
      latencyMs: 100,
      resultCount: 5,
      injectedTokens: 1000,
      success: true,
    };

    // Fire 50 concurrent writes
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(
        logExperimentResult({
          ...baseDataPoint,
          queryHash: `concurrent-${i}`,
        })
      );
    }

    const results = await Promise.all(promises);

    // All should succeed
    for (const result of results) {
      expect(result.ok).toBe(true);
    }

    // Verify all data was written (read file and count lines)
    const { readFileSync } = await import('fs');
    const logPath = join(METRICS_DIR, 'concurrent-test.jsonl');
    const contents = readFileSync(logPath, 'utf-8');
    const lines = contents.trim().split('\n').filter(l => l.length > 0);

    // Should have at least 50 lines (allowing for warmup from previous tests)
    expect(lines.length).toBeGreaterThanOrEqual(50);
  });
});

describe('Integrated Overhead (Task 10.6)', () => {
  test('should add < 10ms overhead to retrieval request', async () => {
    // Simulate experiment overhead: variant selection + logging
    const config: ExperimentConfig = {
      enabled: true,
      variants: {
        control: 'keyword-search',
        treatment: 'semantic-search',
      },
      splitPercent: 50,
    };

    const dataPoint = {
      experimentId: 'overhead-test',
      variant: 'control',
      timestamp: Date.now(),
      latencyMs: 100,
      resultCount: 5,
      injectedTokens: 1000,
      queryHash: 'overhead-test',
      success: true,
    };

    // Benchmark full experiment overhead
    const iterations = 100;
    const overheads: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();

      // 1. Variant selection
      const variant = selectVariant('overhead-test', `request-${i}`, config);

      // 2. Fire-and-forget logging (simulate retrieval pattern)
      const logPromise = logExperimentResult({
        ...dataPoint,
        variant,
        queryHash: `overhead-${i}`,
      });

      const endTime = performance.now();
      const overhead = endTime - startTime;
      overheads.push(overhead);

      // Don't await (fire-and-forget pattern)
      logPromise.catch(() => {});
    }

    // Calculate statistics
    const avgOverhead = overheads.reduce((a, b) => a + b, 0) / iterations;
    const maxOverhead = Math.max(...overheads);
    const p95Overhead = overheads.sort((a, b) => a - b)[Math.floor(iterations * 0.95)];

    console.error(`Experiment overhead statistics:`);
    console.error(`  Average: ${avgOverhead.toFixed(4)}ms`);
    console.error(`  Max: ${maxOverhead.toFixed(4)}ms`);
    console.error(`  P95: ${p95Overhead.toFixed(4)}ms`);

    // Verify requirements
    expect(avgOverhead).toBeLessThan(10.0); // Target: < 10ms average
    expect(p95Overhead).toBeLessThan(15.0); // Allow some variance at p95
  });

  test('should have zero overhead when experiments disabled', () => {
    // Simulate experiment check overhead when no experiments are active
    const config = {
      experiments: {}, // No experiments
    };

    // This represents the getActiveExperiment() call
    const experimentCheck = (providerType: string) => {
      if (!config.experiments) return null;
      for (const [id, exp] of Object.entries(config.experiments)) {
        // This loop should be empty when no experiments
        return { id, config: exp };
      }
      return null;
    };

    // Benchmark 10000 checks
    const iterations = 10000;
    const startTime = performance.now();

    for (let i = 0; i < iterations; i++) {
      const result = experimentCheck('search');
      expect(result).toBeNull();
    }

    const endTime = performance.now();
    const totalMs = endTime - startTime;
    const avgMs = totalMs / iterations;

    console.error(`Empty experiment check average: ${avgMs.toFixed(6)}ms per call`);

    // Should be negligible (< 0.01ms)
    expect(avgMs).toBeLessThan(0.01);
  });
});
