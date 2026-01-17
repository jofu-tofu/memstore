/**
 * Tests for experiment lifecycle management (Story 5.4 Task 8)
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import {
  startExperiment,
  stopExperiment,
  listExperiments,
  getExperimentStatus,
} from './experiment-lifecycle';
import type { ExperimentDataPoint } from './logging/experiment-logger';

const TEST_DIR = join(homedir(), 'pai-test-experiment-lifecycle');
const METRICS_DIR = join(TEST_DIR, 'mem-store/metrics/experiments');

beforeAll(() => {
  mkdirSync(METRICS_DIR, { recursive: true });
  process.env.PAI_DIR = TEST_DIR;

  // Create initial .claude/settings.json with experiments
  const claudeDir = join(TEST_DIR, '.claude');
  mkdirSync(claudeDir, { recursive: true });

  const settingsPath = join(claudeDir, 'settings.json');
  const settings = {
    memory: {
      enabled: true,
      experiments: {
        'test-exp': {
          enabled: false,
          variants: {
            control: 'keyword-search',
            treatment: 'semantic-search',
          },
          splitPercent: 50,
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

/**
 * Helper: Create test experiment data file
 */
function createExperimentData(
  experimentId: string,
  count: number
): void {
  const filePath = join(METRICS_DIR, `${experimentId}.jsonl`);
  const dataPoints: ExperimentDataPoint[] = [];

  for (let i = 0; i < count; i++) {
    dataPoints.push({
      experimentId,
      variant: i % 2 === 0 ? 'control' : 'treatment',
      timestamp: Date.now() + i * 1000,
      latencyMs: 100 + i,
      resultCount: 3,
      injectedTokens: 900,
      queryHash: `hash${i}`,
      success: true,
    });
  }

  const jsonl = dataPoints.map(p => JSON.stringify(p)).join('\n') + '\n';
  writeFileSync(filePath, jsonl, 'utf-8');
}

describe('startExperiment', () => {
  test('should start an experiment', async () => {
    const result = await startExperiment('test-exp');

    expect(result.ok).toBe(true);

    // Verify experiment is now enabled
    const statusResult = await getExperimentStatus('test-exp');
    expect(statusResult.ok).toBe(true);
    if (statusResult.ok) {
      expect(statusResult.value).toBe('running');
    }
  });

  test('should return error for non-existent experiment', async () => {
    const result = await startExperiment('does-not-exist');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('EXPERIMENT_NOT_FOUND');
    }
  });

  test('should return error if already running', async () => {
    // Start first time
    await startExperiment('test-exp');

    // Try to start again
    const result = await startExperiment('test-exp');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('EXPERIMENT_ALREADY_RUNNING');
    }
  });
});

describe('stopExperiment', () => {
  test('should stop a running experiment', async () => {
    // Ensure experiment is running
    await startExperiment('test-exp');

    const result = await stopExperiment('test-exp');

    expect(result.ok).toBe(true);

    // Verify experiment is now stopped
    const statusResult = await getExperimentStatus('test-exp');
    expect(statusResult.ok).toBe(true);
    if (statusResult.ok) {
      expect(statusResult.value).toBe('stopped');
    }
  });

  test('should return error for non-existent experiment', async () => {
    const result = await stopExperiment('does-not-exist');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('EXPERIMENT_NOT_FOUND');
    }
  });

  test('should return error if not running', async () => {
    // Ensure experiment is stopped
    await stopExperiment('test-exp');

    // Try to stop again
    const result = await stopExperiment('test-exp');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('EXPERIMENT_NOT_RUNNING');
    }
  });

  test('should preserve historical data when stopped', async () => {
    // Create data for experiment
    createExperimentData('test-exp', 10);

    // Start and stop
    await startExperiment('test-exp');
    await stopExperiment('test-exp');

    // Verify data still exists
    const listResult = await listExperiments();
    expect(listResult.ok).toBe(true);

    if (listResult.ok) {
      const exp = listResult.value.find(e => e.id === 'test-exp');
      expect(exp).toBeDefined();
      expect(exp!.dataPointCount).toBe(10);
    }
  });
});

describe('listExperiments', () => {
  test('should list experiments from config', async () => {
    const result = await listExperiments();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.length).toBeGreaterThanOrEqual(1);

    const testExp = result.value.find(e => e.id === 'test-exp');
    expect(testExp).toBeDefined();
    expect(testExp!.config.variants.control).toBe('keyword-search');
  });

  test('should include experiments with data but not in config', async () => {
    // Create orphaned experiment data
    createExperimentData('orphaned-exp', 5);

    const result = await listExperiments();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const orphaned = result.value.find(e => e.id === 'orphaned-exp');
    expect(orphaned).toBeDefined();
    expect(orphaned!.status).toBe('stopped'); // Orphaned data is considered stopped
    expect(orphaned!.dataPointCount).toBe(5);
  });

  test('should show correct status for running experiment', async () => {
    await startExperiment('test-exp');

    const result = await listExperiments();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const testExp = result.value.find(e => e.id === 'test-exp');
    expect(testExp!.status).toBe('running');
  });

  test('should show correct status for stopped experiment', async () => {
    await startExperiment('test-exp');
    await stopExperiment('test-exp');

    const result = await listExperiments();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const testExp = result.value.find(e => e.id === 'test-exp');
    expect(testExp!.status).toBe('stopped');
  });

  test('should count data points correctly', async () => {
    createExperimentData('test-exp', 25);

    const result = await listExperiments();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const testExp = result.value.find(e => e.id === 'test-exp');
    expect(testExp!.dataPointCount).toBe(25);
  });
});

describe('getExperimentStatus', () => {
  test('should return running for active experiment', async () => {
    await startExperiment('test-exp');

    const result = await getExperimentStatus('test-exp');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('running');
    }
  });

  test('should return stopped for stopped experiment', async () => {
    await startExperiment('test-exp');
    await stopExperiment('test-exp');

    const result = await getExperimentStatus('test-exp');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('stopped');
    }
  });

  test('should return error for non-existent experiment', async () => {
    const result = await getExperimentStatus('does-not-exist');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('EXPERIMENT_NOT_FOUND');
    }
  });
});
