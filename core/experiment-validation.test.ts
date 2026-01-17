/**
 * Provider validation tests for experiments (Story 5.4 Task 7)
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { validateExperimentProvider } from './experiment-validation';
import './register-providers'; // Ensure providers are registered

const TEST_PAI_DIR = join(homedir(), 'pai-test-experiment-validation');

describe('experiment-validation', () => {
  beforeAll(() => {
    mkdirSync(TEST_PAI_DIR, { recursive: true });
    process.env.PAI_DIR = TEST_PAI_DIR;
  });

  afterAll(() => {
    if (existsSync(TEST_PAI_DIR)) {
      rmSync(TEST_PAI_DIR, { recursive: true, force: true });
    }
    delete process.env.PAI_DIR;
  });

  test('should validate existing search provider', async () => {
    // Act
    const result = await validateExperimentProvider(
      'keyword-search',
      'search'
    );

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeDefined();
      expect(result.value.name).toBeDefined();
    }
  });

  test('should validate existing storage provider', async () => {
    // Act
    const result = await validateExperimentProvider('file-backend', 'storage');

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeDefined();
      expect(result.value.name).toBeDefined();
    }
  });

  test('should reject non-existent provider', async () => {
    // Act
    const result = await validateExperimentProvider(
      'non-existent-provider',
      'search'
    );

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('EXPERIMENT_INVALID_PROVIDER');
      expect(result.error.message).toContain('not found');
      expect(result.error.message).toContain('non-existent-provider');
    }
  });

  test('should reject provider of wrong type', async () => {
    // Act - try to use storage provider as search provider
    const result = await validateExperimentProvider('file-backend', 'search');

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('EXPERIMENT_INVALID_PROVIDER');
    }
  });

  test('should handle empty provider name', async () => {
    // Act
    const result = await validateExperimentProvider('', 'search');

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('EXPERIMENT_INVALID_PROVIDER');
    }
  });
});
