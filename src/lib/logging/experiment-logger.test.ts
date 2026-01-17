/**
 * Experiment data logging tests (Story 5.4 Task 3)
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync, rmSync, readFileSync } from 'fs';
import {
  logExperimentResult,
  type ExperimentDataPoint,
} from './experiment-logger';

const TEST_MEMSTORE_DIR = join(homedir(), '.memstore-test-experiment-logger');

describe('experiment-logger', () => {
  beforeAll(() => {
    mkdirSync(TEST_MEMSTORE_DIR, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(TEST_MEMSTORE_DIR)) {
      rmSync(TEST_MEMSTORE_DIR, { recursive: true, force: true });
    }
  });

  test('should log experiment data point to JSONL file', async () => {
    // Arrange
    const originalMemstoreDir = process.env.MEMSTORE_DIR;
    process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;

    const dataPoint: ExperimentDataPoint = {
      experimentId: 'search-comparison',
      variant: 'control',
      timestamp: Date.now(),
      latencyMs: 180,
      resultCount: 3,
      injectedTokens: 920,
      queryHash: 'abc123',
      success: true,
    };

    // Act
    const result = await logExperimentResult(dataPoint);

    // Assert
    expect(result.ok).toBe(true);

    const logPath = join(
      TEST_MEMSTORE_DIR,
      'mem-store/metrics/experiments/search-comparison.jsonl'
    );
    expect(existsSync(logPath)).toBe(true);

    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(1);

    const logged = JSON.parse(lines[0]);
    expect(logged.experimentId).toBe('search-comparison');
    expect(logged.variant).toBe('control');
    expect(logged.latencyMs).toBe(180);

    process.env.MEMSTORE_DIR = originalMemstoreDir;
  });

  test('should append multiple data points to same file', async () => {
    // Arrange
    const originalMemstoreDir = process.env.MEMSTORE_DIR;
    process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;

    const dataPoints: ExperimentDataPoint[] = [
      {
        experimentId: 'multi-test',
        variant: 'control',
        timestamp: Date.now(),
        latencyMs: 100,
        resultCount: 2,
        injectedTokens: 500,
        queryHash: 'hash1',
        success: true,
      },
      {
        experimentId: 'multi-test',
        variant: 'treatment',
        timestamp: Date.now(),
        latencyMs: 150,
        resultCount: 3,
        injectedTokens: 700,
        queryHash: 'hash2',
        success: true,
      },
    ];

    // Act
    for (const dp of dataPoints) {
      await logExperimentResult(dp);
    }

    // Assert
    const logPath = join(
      TEST_MEMSTORE_DIR,
      'mem-store/metrics/experiments/multi-test.jsonl'
    );
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n');

    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).variant).toBe('control');
    expect(JSON.parse(lines[1]).variant).toBe('treatment');

    process.env.MEMSTORE_DIR = originalMemstoreDir;
  });

  test('should log failures with error code', async () => {
    // Arrange
    const originalMemstoreDir = process.env.MEMSTORE_DIR;
    process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;

    const failureDataPoint: ExperimentDataPoint = {
      experimentId: 'failure-test',
      variant: 'treatment',
      timestamp: Date.now(),
      latencyMs: 0,
      resultCount: 0,
      injectedTokens: 0,
      queryHash: 'hash-fail',
      success: false,
      errorCode: 'SEARCH_INDEX_CORRUPT',
    };

    // Act
    const result = await logExperimentResult(failureDataPoint);

    // Assert
    expect(result.ok).toBe(true);

    const logPath = join(
      TEST_MEMSTORE_DIR,
      'mem-store/metrics/experiments/failure-test.jsonl'
    );
    const content = readFileSync(logPath, 'utf-8');
    const logged = JSON.parse(content.trim());

    expect(logged.success).toBe(false);
    expect(logged.errorCode).toBe('SEARCH_INDEX_CORRUPT');
    expect(logged.resultCount).toBe(0);

    process.env.MEMSTORE_DIR = originalMemstoreDir;
  });

  test('should handle concurrent writes without data loss', async () => {
    // Arrange
    const originalMemstoreDir = process.env.MEMSTORE_DIR;
    process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;

    const dataPoints: ExperimentDataPoint[] = Array.from({ length: 10 }, (_, i) => ({
      experimentId: 'concurrent-test',
      variant: i % 2 === 0 ? 'control' : 'treatment',
      timestamp: Date.now(),
      latencyMs: 100 + i,
      resultCount: i,
      injectedTokens: 500 + i * 100,
      queryHash: `hash-${i}`,
      success: true,
    }));

    // Act - fire all writes concurrently
    const results = await Promise.all(
      dataPoints.map((dp) => logExperimentResult(dp))
    );

    // Assert - all should succeed
    expect(results.every((r) => r.ok)).toBe(true);

    const logPath = join(
      TEST_MEMSTORE_DIR,
      'mem-store/metrics/experiments/concurrent-test.jsonl'
    );
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n');

    expect(lines.length).toBe(10);

    process.env.MEMSTORE_DIR = originalMemstoreDir;
  });

  test('should create experiment directory if it does not exist', async () => {
    // Arrange
    const originalMemstoreDir = process.env.MEMSTORE_DIR;
    process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;

    // Remove experiments directory if it exists
    const experimentsDir = join(TEST_MEMSTORE_DIR, 'mem-store/metrics/experiments');
    if (existsSync(experimentsDir)) {
      rmSync(experimentsDir, { recursive: true, force: true });
    }

    const dataPoint: ExperimentDataPoint = {
      experimentId: 'new-experiment',
      variant: 'control',
      timestamp: Date.now(),
      latencyMs: 200,
      resultCount: 5,
      injectedTokens: 1000,
      queryHash: 'new-hash',
      success: true,
    };

    // Act
    const result = await logExperimentResult(dataPoint);

    // Assert
    expect(result.ok).toBe(true);
    expect(existsSync(experimentsDir)).toBe(true);

    const logPath = join(experimentsDir, 'new-experiment.jsonl');
    expect(existsSync(logPath)).toBe(true);

    process.env.MEMSTORE_DIR = originalMemstoreDir;
  });
});
