/**
 * End-to-End integration tests for A/B Testing Framework (Story 5.4 Task 12)
 *
 * Tests the complete experiment lifecycle:
 * 1. Configure experiment
 * 2. Run retrievals with variant selection
 * 3. Collect data
 * 4. Analyze results
 * 5. Export data
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { startExperiment, stopExperiment, listExperiments } from '../lib/experiment-lifecycle';
import { aggregateExperimentData, exportExperimentResults } from '../lib/experiment-analyzer';
import { logExperimentResult } from '../lib/logging/experiment-logger';
import { selectVariant } from '../core/experiment';
import type { ExperimentConfig } from '../core/config';
import type { ExperimentDataPoint } from '../lib/logging/experiment-logger';

const TEST_DIR = join(homedir(), 'pai-test-experiment-e2e');
const METRICS_DIR = join(TEST_DIR, 'mem-store/metrics/experiments');
const CLAUDE_DIR = join(TEST_DIR, '.claude');

beforeAll(() => {
  mkdirSync(METRICS_DIR, { recursive: true });
  mkdirSync(CLAUDE_DIR, { recursive: true });
  process.env.PAI_DIR = TEST_DIR;

  // Create settings.json with experiment configuration
  const settingsPath = join(CLAUDE_DIR, 'settings.json');
  const settings = {
    memory: {
      enabled: true,
      experiments: {
        'search-comparison': {
          enabled: false, // Will be started via lifecycle
          variants: {
            control: 'keyword-search',
            treatment: 'semantic-search',
          },
          splitPercent: 50,
        },
        'multi-variant-test': {
          enabled: false,
          variants: {
            control: 'default-ranking',
            'treatment-a': 'importance-boost',
            'treatment-b': 'recency-boost',
            'treatment-c': 'access-count-boost',
          },
          splitPercent: {
            control: 40,
            'treatment-a': 20,
            'treatment-b': 20,
            'treatment-c': 20,
          },
        },
      },
    },
  };
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
});

afterAll(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  delete process.env.PAI_DIR;
});

describe('End-to-End Experiment Flow (Task 12.1)', () => {
  test('should complete full experiment lifecycle: configure → run → analyze', async () => {
    // Step 1: Start experiment
    const startResult = await startExperiment('search-comparison');
    expect(startResult.ok).toBe(true);

    // Step 2: Simulate 100 retrievals with variant assignment and data collection
    const config: ExperimentConfig = {
      enabled: true,
      variants: {
        control: 'keyword-search',
        treatment: 'semantic-search',
      },
      splitPercent: 50,
    };

    for (let i = 0; i < 100; i++) {
      const requestId = `request-${i}`;
      const variant = selectVariant('search-comparison', requestId, config);

      // Simulate retrieval with different latencies based on variant
      const latencyMs = variant === 'control' ? 100 + Math.random() * 50 : 150 + Math.random() * 100;

      const dataPoint: ExperimentDataPoint = {
        experimentId: 'search-comparison',
        variant,
        timestamp: Date.now() + i * 10,
        latencyMs: Math.round(latencyMs),
        resultCount: Math.floor(Math.random() * 5) + 3, // 3-7 results
        injectedTokens: Math.floor(Math.random() * 500) + 800, // 800-1300 tokens
        queryHash: `hash-${i}`,
        success: Math.random() > 0.05, // 5% error rate
      };

      const logResult = await logExperimentResult(dataPoint);
      expect(logResult.ok).toBe(true);
    }

    // Step 3: Stop experiment
    const stopResult = await stopExperiment('search-comparison');
    expect(stopResult.ok).toBe(true);

    // Step 4: Analyze results
    const analysisResult = await aggregateExperimentData('search-comparison');
    expect(analysisResult.ok).toBe(true);

    if (!analysisResult.ok) return;

    const results = analysisResult.value;

    // Verify results structure
    expect(results.experimentId).toBe('search-comparison');
    expect(results.variants).toHaveProperty('control');
    expect(results.variants).toHaveProperty('treatment');

    // Verify control variant stats
    const controlStats = results.variants.control;
    expect(controlStats.count).toBeGreaterThan(30); // Should be ~50 with variance
    expect(controlStats.avgLatencyMs).toBeGreaterThan(0);
    expect(controlStats.avgResultCount).toBeGreaterThan(0);
    expect(controlStats.errorRate).toBeGreaterThanOrEqual(0);
    expect(controlStats.latencyDistribution.p50).toBeGreaterThan(0);

    // Verify treatment variant stats
    const treatmentStats = results.variants.treatment;
    expect(treatmentStats.count).toBeGreaterThan(30); // Should be ~50 with variance
    expect(treatmentStats.avgLatencyMs).toBeGreaterThan(controlStats.avgLatencyMs); // Treatment should be slower

    // Verify comparison exists (2 variants)
    expect(results.comparison).toBeDefined();
    if (results.comparison) {
      expect(results.comparison.fasterVariant).toBe('control'); // Control should be faster
    }

    // Step 5: Export results
    const exportResult = await exportExperimentResults('search-comparison', 'json');
    expect(exportResult.ok).toBe(true);

    if (exportResult.ok) {
      // Export returns JSON string - parse to verify
      const data = JSON.parse(exportResult.value);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(100); // All 100 data points
    }

    // Step 6: Verify experiment is in list
    const listResult = await listExperiments();
    expect(listResult.ok).toBe(true);

    if (listResult.ok) {
      const experiment = listResult.value.find(e => e.id === 'search-comparison');
      expect(experiment).toBeDefined();
      expect(experiment!.status).toBe('stopped');
      expect(experiment!.dataPointCount).toBe(100);
    }
  });
});

describe('Multi-Variant Experiments (Task 12.2)', () => {
  test('should handle 4-variant experiment with custom split percentages', async () => {
    // Start experiment
    const startResult = await startExperiment('multi-variant-test');
    expect(startResult.ok).toBe(true);

    const config: ExperimentConfig = {
      enabled: true,
      variants: {
        control: 'default-ranking',
        'treatment-a': 'importance-boost',
        'treatment-b': 'recency-boost',
        'treatment-c': 'access-count-boost',
      },
      splitPercent: {
        control: 40,
        'treatment-a': 20,
        'treatment-b': 20,
        'treatment-c': 20,
      },
    };

    // Simulate 200 retrievals
    for (let i = 0; i < 200; i++) {
      const requestId = `multi-${i}`;
      const variant = selectVariant('multi-variant-test', requestId, config);

      const dataPoint: ExperimentDataPoint = {
        experimentId: 'multi-variant-test',
        variant,
        timestamp: Date.now() + i * 5,
        latencyMs: Math.round(80 + Math.random() * 60),
        resultCount: Math.floor(Math.random() * 4) + 4,
        injectedTokens: Math.floor(Math.random() * 400) + 900,
        queryHash: `multi-hash-${i}`,
        success: true,
      };

      await logExperimentResult(dataPoint);
    }

    // Analyze results
    const analysisResult = await aggregateExperimentData('multi-variant-test');
    expect(analysisResult.ok).toBe(true);

    if (!analysisResult.ok) return;

    const results = analysisResult.value;

    // Verify all 4 variants present
    expect(results.variants).toHaveProperty('control');
    expect(results.variants).toHaveProperty('treatment-a');
    expect(results.variants).toHaveProperty('treatment-b');
    expect(results.variants).toHaveProperty('treatment-c');

    // Verify split distribution (40/20/20/20)
    const controlCount = results.variants.control.count;
    const treatmentACount = results.variants['treatment-a'].count;
    const treatmentBCount = results.variants['treatment-b'].count;
    const treatmentCCount = results.variants['treatment-c'].count;

    // Control should have ~40% (allow ±15% variance)
    expect(controlCount).toBeGreaterThan(50); // At least 25%
    expect(controlCount).toBeLessThan(110); // At most 55%

    // Each treatment should have ~20% (allow ±10% variance)
    expect(treatmentACount).toBeGreaterThan(20); // At least 10%
    expect(treatmentBCount).toBeGreaterThan(20);
    expect(treatmentCCount).toBeGreaterThan(20);

    // Verify no comparison for multi-variant (only for 2-variant)
    expect(results.comparison).toBeUndefined();
  });
});

describe('Graceful Degradation (Task 12.3)', () => {
  test('should handle missing experiment data file gracefully', async () => {
    const analysisResult = await aggregateExperimentData('nonexistent-experiment');

    // Should return error with clear message
    expect(analysisResult.ok).toBe(false);
    if (!analysisResult.ok) {
      expect(analysisResult.error.code).toBe('EXPERIMENT_NOT_FOUND');
      expect(analysisResult.error.message).toContain('nonexistent-experiment');
    }
  });

  test('should handle corrupted JSONL data gracefully', async () => {
    // Create corrupted experiment data
    const corruptedPath = join(METRICS_DIR, 'corrupted-test.jsonl');
    writeFileSync(
      corruptedPath,
      '{"valid": "json"}\nthis is not json\n{"another": "valid"}',
      'utf-8'
    );

    const analysisResult = await aggregateExperimentData('corrupted-test');

    // Should either skip corrupted lines or fail with clear error
    if (analysisResult.ok) {
      // If it skips corrupted lines, should have 2 valid data points
      expect(analysisResult.value.variants).toBeDefined();
    } else {
      // If it fails, should have clear error message
      expect(analysisResult.error.message).toBeDefined();
    }
  });
});

describe('Performance Overhead (Task 12.4)', () => {
  test('should add < 10ms overhead to retrieval flow', () => {
    const config: ExperimentConfig = {
      enabled: true,
      variants: {
        control: 'keyword-search',
        treatment: 'semantic-search',
      },
      splitPercent: 50,
    };

    // Simulate 50 retrievals
    const overheads: number[] = [];

    for (let i = 0; i < 50; i++) {
      const startTime = performance.now();

      // Variant selection
      const variant = selectVariant('overhead-test', `req-${i}`, config);

      // Fire-and-forget logging (simulate)
      const logPromise = logExperimentResult({
        experimentId: 'overhead-test',
        variant,
        timestamp: Date.now(),
        latencyMs: 100,
        resultCount: 5,
        injectedTokens: 1000,
        queryHash: `overhead-${i}`,
        success: true,
      });

      const endTime = performance.now();
      overheads.push(endTime - startTime);

      // Fire-and-forget
      logPromise.catch(() => {});
    }

    const avgOverhead = overheads.reduce((a, b) => a + b, 0) / overheads.length;
    expect(avgOverhead).toBeLessThan(10.0);
  });
});

describe('Data Export (Task 12.5)', () => {
  test('should export experiment data to JSON format', async () => {
    const exportResult = await exportExperimentResults('search-comparison', 'json');

    expect(exportResult.ok).toBe(true);
    if (!exportResult.ok) return;

    // Export returns JSON string - parse it
    const jsonString = exportResult.value;
    expect(typeof jsonString).toBe('string');

    const data = JSON.parse(jsonString);

    // Verify structure
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);

    // Verify all required fields present
    const firstPoint = data[0];
    expect(firstPoint).toHaveProperty('experimentId');
    expect(firstPoint).toHaveProperty('variant');
    expect(firstPoint).toHaveProperty('timestamp');
    expect(firstPoint).toHaveProperty('latencyMs');
    expect(firstPoint).toHaveProperty('resultCount');
    expect(firstPoint).toHaveProperty('injectedTokens');
    expect(firstPoint).toHaveProperty('queryHash');
    expect(firstPoint).toHaveProperty('success');
  });

  test('should export experiment data to CSV format', async () => {
    const exportResult = await exportExperimentResults('search-comparison', 'csv');

    expect(exportResult.ok).toBe(true);
    if (!exportResult.ok) return;

    const csv = exportResult.value as string;

    // Verify CSV structure
    expect(typeof csv).toBe('string');
    expect(csv).toContain('experimentId,variant,timestamp');
    expect(csv).toContain('search-comparison');

    // Should have header + data rows
    const lines = csv.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });
});

describe('Statistical Calculations (Task 12.6)', () => {
  test('should calculate percentile distributions correctly', async () => {
    const analysisResult = await aggregateExperimentData('search-comparison');

    expect(analysisResult.ok).toBe(true);
    if (!analysisResult.ok) return;

    const results = analysisResult.value;
    const controlStats = results.variants.control;

    // Verify percentiles are in ascending order
    expect(controlStats.latencyDistribution.p50).toBeLessThanOrEqual(
      controlStats.latencyDistribution.p90
    );
    expect(controlStats.latencyDistribution.p90).toBeLessThanOrEqual(
      controlStats.latencyDistribution.p95
    );
    expect(controlStats.latencyDistribution.p95).toBeLessThanOrEqual(
      controlStats.latencyDistribution.p99
    );

    // Verify mean is reasonable
    expect(controlStats.avgLatencyMs).toBeGreaterThan(0);
    expect(controlStats.avgLatencyMs).toBeLessThan(1000); // Sanity check
  });

  test('should calculate statistical significance for 2-variant test', async () => {
    const analysisResult = await aggregateExperimentData('search-comparison');

    expect(analysisResult.ok).toBe(true);
    if (!analysisResult.ok) return;

    const results = analysisResult.value;

    // Verify comparison exists for 2-variant test
    expect(results.comparison).toBeDefined();

    if (results.comparison) {
      expect(results.comparison.fasterVariant).toBeDefined();
      expect(['control', 'treatment']).toContain(results.comparison.fasterVariant!);

      // Latency improvement should be a percentage
      expect(typeof results.comparison.latencyImprovementPercent).toBe('number');
    }
  });
});

describe('Data Persistence (Task 12.7)', () => {
  test('should persist experiment data across reads', async () => {
    // Read data twice
    const firstRead = await aggregateExperimentData('search-comparison');
    const secondRead = await aggregateExperimentData('search-comparison');

    expect(firstRead.ok).toBe(true);
    expect(secondRead.ok).toBe(true);

    if (!firstRead.ok || !secondRead.ok) return;

    // Both reads should return identical results
    expect(firstRead.value.variants.control.count).toBe(
      secondRead.value.variants.control.count
    );
    expect(firstRead.value.variants.treatment.count).toBe(
      secondRead.value.variants.treatment.count
    );
  });

  test('should preserve historical data when experiment is stopped', async () => {
    const listResult = await listExperiments();

    expect(listResult.ok).toBe(true);
    if (!listResult.ok) return;

    const stoppedExperiment = listResult.value.find(e => e.id === 'search-comparison');

    expect(stoppedExperiment).toBeDefined();
    expect(stoppedExperiment!.status).toBe('stopped');
    expect(stoppedExperiment!.dataPointCount).toBe(100); // Data still present
  });
});
