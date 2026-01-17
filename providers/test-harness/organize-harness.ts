/**
 * OrganizeProvider contract test harness
 *
 * Validates that an OrganizeProvider implementation complies with the interface contract.
 *
 * @module providers/test-harness/organize-harness
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { homedir } from 'os';
import { join } from 'path';
import type { OrganizeProvider, OrganizeError } from '../organize/interface';
import { ORGANIZE_ERROR_CODES } from '../organize/interface';
import type { ProviderError } from '../../types/common';
import {
  expectOk,
  expectError,
  createTestSegment,
  removeTestDirectory,
} from './base-harness';

/**
 * Options for configuring organize harness tests.
 */
export interface OrganizeHarnessOptions {
  /**
   * Clean test data between each test (default: false).
   */
  cleanupBeforeEach?: boolean;

  /**
   * Custom test data path (default: ~/pai-test-{provider-name}).
   */
  testDataPath?: string;

  /**
   * Expected path format pattern (regex) for validation.
   * Default: /^[a-zA-Z0-9_\/-]+$/ (alphanumeric with forward slashes)
   */
  pathFormatPattern?: RegExp;
}

/**
 * Run OrganizeProvider contract tests against a provider implementation.
 *
 * @param ProviderClass - The OrganizeProvider class to test
 * @param options - Optional test configuration
 *
 * @example
 * ```typescript
 * import { runOrganizeProviderTests } from '../test-harness/organize-harness';
 * import { FlatByDateOrganizeProvider } from './flat-by-date';
 *
 * describe('FlatByDateOrganizeProvider', () => {
 *   runOrganizeProviderTests(FlatByDateOrganizeProvider);
 * });
 * ```
 */
export function runOrganizeProviderTests(
  ProviderClass: new (...args: any[]) => OrganizeProvider,
  options: OrganizeHarnessOptions = {}
): void {
  describe(`${ProviderClass.name} (OrganizeProvider Contract)`, () => {
    let provider: OrganizeProvider;
    let testDir: string;
    const pathPattern = options.pathFormatPattern || /^[a-zA-Z0-9_\/-]+$/;

    beforeAll(() => {
      const providerName = ProviderClass.name.toLowerCase().replace(/provider$/, '');
      testDir = options.testDataPath || join(homedir(), `pai-test-${providerName}`);
    });

    afterAll(() => {
      removeTestDirectory(testDir);
    });

    test('should implement initialize() correctly', async () => {
      provider = new ProviderClass();
      const result = await provider.initialize();

      expectOk(result);
      expect(result.value).toBeUndefined();
    });

    test('should return valid file paths for segments', async () => {
      provider = new ProviderClass();
      await provider.initialize();

      const segment = createTestSegment({
        timestamp: Date.now(),
      });

      const result = await provider.organize(segment);

      expectOk(result);
      expect(typeof result.value).toBe('string');
      expect(result.value.length).toBeGreaterThan(0);

      // Path should match expected format (alphanumeric, slashes, hyphens)
      expect(result.value).toMatch(pathPattern);
    });

    test('should return Result<string, OrganizeError>', async () => {
      provider = new ProviderClass();
      await provider.initialize();

      const segment = createTestSegment();

      const result = await provider.organize(segment);

      // Validate Result type
      expect(result).toHaveProperty('ok');
      if (result.ok) {
        expect(typeof result.value).toBe('string');
      } else {
        expect(result.error).toBeDefined();
        expect(result.error).toHaveProperty('code');
        expect(result.error).toHaveProperty('message');
      }
    });

    test('path format should match documented pattern', async () => {
      provider = new ProviderClass();
      await provider.initialize();

      // Test with various timestamps
      const testDates = [
        Date.now(),
        new Date('2024-01-15').getTime(),
        new Date('2025-12-31').getTime(),
      ];

      for (const timestamp of testDates) {
        const segment = createTestSegment({ timestamp });
        const result = await provider.organize(segment);

        expectOk(result);

        // Path should:
        // - Not start with / (must be relative)
        // - Not end with / (directory name, not path separator)
        // - Use forward slashes (even on Windows)
        // - Be valid path format
        expect(result.value).not.toMatch(/^\//); // No leading slash
        expect(result.value).toMatch(pathPattern);
      }
    });

    test('should handle different timestamps consistently', async () => {
      provider = new ProviderClass();
      await provider.initialize();

      // Same timestamp should produce same path
      const timestamp = new Date('2024-06-15').getTime();

      const segment1 = createTestSegment({ timestamp });
      const segment2 = createTestSegment({ timestamp });

      const result1 = await provider.organize(segment1);
      const result2 = await provider.organize(segment2);

      expectOk(result1);
      expectOk(result2);

      expect(result1.value).toBe(result2.value);
    });

    test('should handle invalid timestamps gracefully', async () => {
      provider = new ProviderClass();
      await provider.initialize();

      // Test with invalid timestamps
      const invalidTimestamps = [0, -1, NaN];

      for (const timestamp of invalidTimestamps) {
        const segment = createTestSegment({ timestamp });
        const result = await provider.organize(segment);

        // Should either return valid path or error, never throw
        expect(result).toHaveProperty('ok');

        if (result.ok) {
          // Valid path fallback
          expect(typeof result.value).toBe('string');
          expect(result.value.length).toBeGreaterThan(0);
        } else {
          // Error result
          expect(result.error).toHaveProperty('code');
          expect(result.error).toHaveProperty('message');
        }
      }
    });

    test('should implement healthCheck() correctly', async () => {
      provider = new ProviderClass();
      await provider.initialize();

      const status = await provider.healthCheck();

      expect(status).toBeDefined();
      expect(status).toHaveProperty('healthy');
      expect(typeof status.healthy).toBe('boolean');
    });

    test('should implement shutdown() correctly', async () => {
      provider = new ProviderClass();
      await provider.initialize();

      // shutdown() should return Promise<void> - never throws, handles errors internally
      await expect(provider.shutdown()).resolves.toBeUndefined();
    });

    test('should return Result errors for error cases, not throw exceptions', async () => {
      provider = new ProviderClass();
      await provider.initialize();

      // Test that provider never throws, only returns Result errors
      const segment = createTestSegment();

      const result = await provider.organize(segment);

      // Should either succeed or return error Result, never throw
      expect(result).toHaveProperty('ok');
    });
  });
}
