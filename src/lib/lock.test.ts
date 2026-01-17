import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { acquireLock, releaseLock, isProcessorRunning } from './lock';

// Use process.pid for test isolation (prevents conflicts when running tests in parallel)
const TEST_MEMSTORE_DIR = join(homedir(), `.memstore-test-lock-${process.pid}`);
const TEST_LOCK_PATH = join(TEST_MEMSTORE_DIR, '.test.lock');

describe('Lock utilities', () => {
  beforeAll(() => {
    mkdirSync(TEST_MEMSTORE_DIR, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(TEST_MEMSTORE_DIR)) {
      rmSync(TEST_MEMSTORE_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clean up lock file before each test
    if (existsSync(TEST_LOCK_PATH)) {
      rmSync(TEST_LOCK_PATH, { force: true });
    }
  });

  test('acquireLock creates lock when none exists', () => {
    const result = acquireLock(TEST_LOCK_PATH, 60000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(true);
      expect(existsSync(TEST_LOCK_PATH)).toBe(true);
    }
  });

  test('acquireLock returns false when lock is fresh', () => {
    const firstResult = acquireLock(TEST_LOCK_PATH, 60000);
    expect(firstResult.ok).toBe(true);

    const secondResult = acquireLock(TEST_LOCK_PATH, 60000);
    expect(secondResult.ok).toBe(true);
    if (secondResult.ok) {
      expect(secondResult.value).toBe(false);
    }
  });

  test('acquireLock overwrites stale lock', async () => {
    const firstResult = acquireLock(TEST_LOCK_PATH, 100); // 100ms stale timeout
    expect(firstResult.ok).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 150)); // Wait for stale

    const secondResult = acquireLock(TEST_LOCK_PATH, 100);
    expect(secondResult.ok).toBe(true);
    if (secondResult.ok) {
      expect(secondResult.value).toBe(true);
    }
  });

  test('releaseLock removes lock file', () => {
    const acquireResult = acquireLock(TEST_LOCK_PATH, 60000);
    expect(acquireResult.ok).toBe(true);

    const releaseResult = releaseLock(TEST_LOCK_PATH);
    expect(releaseResult.ok).toBe(true);
    expect(existsSync(TEST_LOCK_PATH)).toBe(false);
  });

  test('releaseLock handles missing lock file gracefully', () => {
    const result = releaseLock(TEST_LOCK_PATH);
    expect(result.ok).toBe(true);
  });

  test('isProcessorRunning returns false when no lock exists', () => {
    const result = isProcessorRunning(TEST_LOCK_PATH, 60000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(false);
    }
  });

  test('isProcessorRunning returns true for fresh lock', () => {
    const acquireResult = acquireLock(TEST_LOCK_PATH, 60000);
    expect(acquireResult.ok).toBe(true);

    const runningResult = isProcessorRunning(TEST_LOCK_PATH, 60000);
    expect(runningResult.ok).toBe(true);
    if (runningResult.ok) {
      expect(runningResult.value).toBe(true);
    }
  });

  test('isProcessorRunning returns false for stale lock', async () => {
    const acquireResult = acquireLock(TEST_LOCK_PATH, 100); // 100ms stale timeout
    expect(acquireResult.ok).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 150)); // Wait for stale

    const runningResult = isProcessorRunning(TEST_LOCK_PATH, 100);
    expect(runningResult.ok).toBe(true);
    if (runningResult.ok) {
      expect(runningResult.value).toBe(false);
    }
  });

  test('lock file contains correct JSON structure', () => {
    const { readFileSync } = require('fs');
    const acquireResult = acquireLock(TEST_LOCK_PATH, 60000);
    expect(acquireResult.ok).toBe(true);

    const lockContent = readFileSync(TEST_LOCK_PATH, 'utf-8');
    const lockData = JSON.parse(lockContent);

    expect(lockData).toHaveProperty('pid');
    expect(lockData).toHaveProperty('started');
    expect(lockData).toHaveProperty('hostname');
    expect(typeof lockData.pid).toBe('number');
    expect(typeof lockData.started).toBe('number');
    expect(typeof lockData.hostname).toBe('string');
  });
});
