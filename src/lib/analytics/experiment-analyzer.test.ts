/**
 * Tests for experiment results aggregation (Story 5.4 Task 5)
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import {
  aggregateExperimentData,
  exportExperimentResults,
  type ExperimentDataPoint,
} from './experiment-analyzer';

const TEST_DIR = join(homedir(), '.memstore-test-experiment-analyzer');
const METRICS_DIR = join(TEST_DIR, 'mem-store/metrics/experiments');

beforeAll(() => {
  mkdirSync(METRICS_DIR, { recursive: true });
  process.env.MEMSTORE_DIR = TEST_DIR;
});

afterAll(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  delete process.env.MEMSTORE_DIR;
});

/**
 * Helper: Create test experiment data file
 */
function createExperimentData(
  experimentId: string,
  dataPoints: ExperimentDataPoint[]
): void {
  const filePath = join(METRICS_DIR, `${experimentId}.jsonl`);
  const jsonl = dataPoints.map(p => JSON.stringify(p)).join('\n') + '\n';
  writeFileSync(filePath, jsonl, 'utf-8');
}

describe('aggregateExperimentData', () => {
  test('should aggregate simple 2-variant experiment', async () => {
    const dataPoints: ExperimentDataPoint[] = [
      {
        experimentId: 'test-simple',
        variant: 'control',
        timestamp: 1000,
        latencyMs: 100,
        resultCount: 3,
        injectedTokens: 900,
        queryHash: 'hash1',
        success: true,
      },
      {
        experimentId: 'test-simple',
        variant: 'control',
        timestamp: 2000,
        latencyMs: 120,
        resultCount: 4,
        injectedTokens: 1000,
        queryHash: 'hash2',
        success: true,
      },
      {
        experimentId: 'test-simple',
        variant: 'treatment',
        timestamp: 3000,
        latencyMs: 80,
        resultCount: 5,
        injectedTokens: 1200,
        queryHash: 'hash3',
        success: true,
      },
      {
        experimentId: 'test-simple',
        variant: 'treatment',
        timestamp: 4000,
        latencyMs: 90,
        resultCount: 6,
        injectedTokens: 1300,
        queryHash: 'hash4',
        success: true,
      },
    ];

    createExperimentData('test-simple', dataPoints);

    const result = await aggregateExperimentData('test-simple');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { variants, comparison } = result.value;

    // Verify control stats
    expect(variants.control.count).toBe(2);
    expect(variants.control.avgLatencyMs).toBe(110); // (100 + 120) / 2
    expect(variants.control.avgResultCount).toBe(3.5); // (3 + 4) / 2
    expect(variants.control.avgInjectedTokens).toBe(950); // (900 + 1000) / 2
    expect(variants.control.errorCount).toBe(0);
    expect(variants.control.errorRate).toBe(0);

    // Verify treatment stats
    expect(variants.treatment.count).toBe(2);
    expect(variants.treatment.avgLatencyMs).toBe(85); // (80 + 90) / 2
    expect(variants.treatment.avgResultCount).toBe(5.5); // (5 + 6) / 2
    expect(variants.treatment.avgInjectedTokens).toBe(1250); // (1200 + 1300) / 2
    expect(variants.treatment.errorCount).toBe(0);
    expect(variants.treatment.errorRate).toBe(0);

    // Verify comparison exists for 2-variant experiment
    expect(comparison).toBeDefined();
    // With only 2 samples per variant, significance is unlikely
    // But we should still see which variant is numerically faster
    expect(comparison!.latencyImprovementPercent).toBeGreaterThan(0); // treatment is faster
  });

  test('should calculate latency distribution percentiles', async () => {
    const dataPoints: ExperimentDataPoint[] = [];

    // Create 100 data points with known latency distribution
    for (let i = 1; i <= 100; i++) {
      dataPoints.push({
        experimentId: 'test-distribution',
        variant: 'control',
        timestamp: i * 1000,
        latencyMs: i, // 1ms to 100ms
        resultCount: 3,
        injectedTokens: 900,
        queryHash: `hash${i}`,
        success: true,
      });
    }

    createExperimentData('test-distribution', dataPoints);

    const result = await aggregateExperimentData('test-distribution');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { variants } = result.value;
    const dist = variants.control.latencyDistribution;

    // Verify percentiles
    expect(dist.p50).toBeCloseTo(50.5, 1); // Median
    expect(dist.p90).toBeCloseTo(90.1, 1); // 90th percentile
    expect(dist.p95).toBeCloseTo(95.05, 1); // 95th percentile
    expect(dist.p99).toBeCloseTo(99.01, 1); // 99th percentile
  });

  test('should calculate error rates', async () => {
    const dataPoints: ExperimentDataPoint[] = [
      {
        experimentId: 'test-errors',
        variant: 'control',
        timestamp: 1000,
        latencyMs: 100,
        resultCount: 3,
        injectedTokens: 900,
        queryHash: 'hash1',
        success: true,
      },
      {
        experimentId: 'test-errors',
        variant: 'control',
        timestamp: 2000,
        latencyMs: 0,
        resultCount: 0,
        injectedTokens: 0,
        queryHash: 'hash2',
        success: false,
        errorCode: 'SEARCH_FAILED',
      },
      {
        experimentId: 'test-errors',
        variant: 'control',
        timestamp: 3000,
        latencyMs: 0,
        resultCount: 0,
        injectedTokens: 0,
        queryHash: 'hash3',
        success: false,
        errorCode: 'SEARCH_FAILED',
      },
      {
        experimentId: 'test-errors',
        variant: 'control',
        timestamp: 4000,
        latencyMs: 120,
        resultCount: 4,
        injectedTokens: 1000,
        queryHash: 'hash4',
        success: true,
      },
    ];

    createExperimentData('test-errors', dataPoints);

    const result = await aggregateExperimentData('test-errors');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { variants } = result.value;

    expect(variants.control.count).toBe(4);
    expect(variants.control.errorCount).toBe(2);
    expect(variants.control.errorRate).toBe(0.5); // 2/4 = 50%
  });

  test('should handle multi-variant experiments (3+ variants)', async () => {
    const dataPoints: ExperimentDataPoint[] = [
      {
        experimentId: 'test-multi',
        variant: 'control',
        timestamp: 1000,
        latencyMs: 100,
        resultCount: 3,
        injectedTokens: 900,
        queryHash: 'hash1',
        success: true,
      },
      {
        experimentId: 'test-multi',
        variant: 'treatment-a',
        timestamp: 2000,
        latencyMs: 80,
        resultCount: 4,
        injectedTokens: 1000,
        queryHash: 'hash2',
        success: true,
      },
      {
        experimentId: 'test-multi',
        variant: 'treatment-b',
        timestamp: 3000,
        latencyMs: 90,
        resultCount: 5,
        injectedTokens: 1100,
        queryHash: 'hash3',
        success: true,
      },
    ];

    createExperimentData('test-multi', dataPoints);

    const result = await aggregateExperimentData('test-multi');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { variants, comparison } = result.value;

    // Should have stats for all 3 variants
    expect(Object.keys(variants).length).toBe(3);
    expect(variants.control).toBeDefined();
    expect(variants['treatment-a']).toBeDefined();
    expect(variants['treatment-b']).toBeDefined();

    // Should NOT have comparison for multi-variant
    expect(comparison).toBeUndefined();
  });

  test('should return error for non-existent experiment', async () => {
    const result = await aggregateExperimentData('does-not-exist');

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe('EXPERIMENT_NOT_FOUND');
  });

  test('should return error for empty experiment data', async () => {
    // Create empty file
    const filePath = join(METRICS_DIR, 'test-empty.jsonl');
    writeFileSync(filePath, '', 'utf-8');

    const result = await aggregateExperimentData('test-empty');

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe('EXPERIMENT_NO_DATA');
  });

  test('should calculate statistical significance', async () => {
    const dataPoints: ExperimentDataPoint[] = [];

    // Control: 100ms average (with some variance)
    for (let i = 0; i < 50; i++) {
      dataPoints.push({
        experimentId: 'test-significance',
        variant: 'control',
        timestamp: i * 1000,
        latencyMs: 100 + (Math.random() - 0.5) * 10, // 95-105ms
        resultCount: 3,
        injectedTokens: 900,
        queryHash: `hash-c-${i}`,
        success: true,
      });
    }

    // Treatment: 80ms average (significantly faster)
    for (let i = 0; i < 50; i++) {
      dataPoints.push({
        experimentId: 'test-significance',
        variant: 'treatment',
        timestamp: (50 + i) * 1000,
        latencyMs: 80 + (Math.random() - 0.5) * 10, // 75-85ms
        resultCount: 4,
        injectedTokens: 1000,
        queryHash: `hash-t-${i}`,
        success: true,
      });
    }

    createExperimentData('test-significance', dataPoints);

    const result = await aggregateExperimentData('test-significance');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { comparison } = result.value;

    expect(comparison).toBeDefined();
    expect(comparison!.significantLatencyDifference).toBe(true); // Should be significant
    expect(comparison!.fasterVariant).toBe('treatment');
    expect(comparison!.latencyImprovementPercent).toBeGreaterThan(15); // ~20% improvement
  });
});

describe('exportExperimentResults', () => {
  test('should export to JSON format', async () => {
    const dataPoints: ExperimentDataPoint[] = [
      {
        experimentId: 'test-export',
        variant: 'control',
        timestamp: 1000,
        latencyMs: 100,
        resultCount: 3,
        injectedTokens: 900,
        queryHash: 'hash1',
        success: true,
      },
      {
        experimentId: 'test-export',
        variant: 'treatment',
        timestamp: 2000,
        latencyMs: 80,
        resultCount: 4,
        injectedTokens: 1000,
        queryHash: 'hash2',
        success: true,
      },
    ];

    createExperimentData('test-export', dataPoints);

    const result = await exportExperimentResults('test-export', 'json');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Should be valid JSON
    const parsed = JSON.parse(result.value);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
    expect(parsed[0].experimentId).toBe('test-export');
    expect(parsed[0].variant).toBe('control');
  });

  test('should export to CSV format', async () => {
    const dataPoints: ExperimentDataPoint[] = [
      {
        experimentId: 'test-export-csv',
        variant: 'control',
        timestamp: 1000,
        latencyMs: 100,
        resultCount: 3,
        injectedTokens: 900,
        queryHash: 'hash1',
        success: true,
      },
      {
        experimentId: 'test-export-csv',
        variant: 'treatment',
        timestamp: 2000,
        latencyMs: 80,
        resultCount: 4,
        injectedTokens: 1000,
        queryHash: 'hash2',
        success: false,
        errorCode: 'SEARCH_FAILED',
      },
    ];

    createExperimentData('test-export-csv', dataPoints);

    const result = await exportExperimentResults('test-export-csv', 'csv');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const lines = result.value.split('\n');

    // Should have header + 2 data rows
    expect(lines.length).toBeGreaterThanOrEqual(3);

    // Verify header
    const header = lines[0];
    expect(header).toContain('experimentId');
    expect(header).toContain('variant');
    expect(header).toContain('latencyMs');
    expect(header).toContain('success');

    // Verify data rows
    expect(lines[1]).toContain('control');
    expect(lines[1]).toContain('100');
    expect(lines[1]).toContain('true');

    expect(lines[2]).toContain('treatment');
    expect(lines[2]).toContain('80');
    expect(lines[2]).toContain('false');
    expect(lines[2]).toContain('SEARCH_FAILED');
  });

  test('should return error for non-existent experiment', async () => {
    const result = await exportExperimentResults('does-not-exist', 'json');

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe('EXPERIMENT_NOT_FOUND');
  });
});
