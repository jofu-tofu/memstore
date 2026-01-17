/**
 * ExtractProvider contract test harness
 *
 * Validates that an ExtractProvider implementation complies with the interface contract.
 *
 * @module providers/test-harness/extract-harness
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { homedir } from 'os';
import { join } from 'path';
import type { ExtractProvider, ExtractError } from '../extract/interface';
import { EXTRACT_ERROR_CODES } from '../extract/interface';
import type { ProviderError } from '../../types/common';
import {
  expectOk,
  expectError,
  createTestSegment,
  removeTestDirectory,
} from './base-harness';

/**
 * Options for configuring extract harness tests.
 */
export interface ExtractHarnessOptions {
  /**
   * Clean test data between each test (default: false).
   */
  cleanupBeforeEach?: boolean;

  /**
   * Custom test data path (default: ~/pai-test-{provider-name}).
   */
  testDataPath?: string;
}

/**
 * Run ExtractProvider contract tests against a provider implementation.
 *
 * @param ProviderClass - The ExtractProvider class to test
 * @param options - Optional test configuration
 *
 * @example
 * ```typescript
 * import { runExtractProviderTests } from '../test-harness/extract-harness';
 * import { KeywordTaggerProvider } from './keyword-tagger';
 *
 * describe('KeywordTaggerProvider', () => {
 *   runExtractProviderTests(KeywordTaggerProvider);
 * });
 * ```
 */
export function runExtractProviderTests(
  ProviderClass: new (...args: any[]) => ExtractProvider,
  options: ExtractHarnessOptions = {}
): void {
  describe(`${ProviderClass.name} (ExtractProvider Contract)`, () => {
    let provider: ExtractProvider;
    let testDir: string;

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

    test('should accept MemorySegment and return Result<MemorySegment, ExtractError>', async () => {
      provider = new ProviderClass();
      await provider.initialize();

      const segment = createTestSegment({
        content: 'This is test content about TypeScript providers and memory systems.',
      });

      const result = await provider.extract(segment);

      // Validate Result type
      expect(result).toHaveProperty('ok');
      if (result.ok) {
        expect(result.value).toBeDefined();
        expect(result.value).toHaveProperty('id');
        expect(result.value).toHaveProperty('content');
      } else {
        expect(result.error).toBeDefined();
        expect(result.error).toHaveProperty('code');
        expect(result.error).toHaveProperty('message');
      }
    });

    test('should enrich segment with metadata', async () => {
      provider = new ProviderClass();
      await provider.initialize();

      const segment = createTestSegment({
        content: 'The memory system uses providers for storage, search, and extraction.',
        tags: [],
      });

      const result = await provider.extract(segment);
      expectOk(result);

      const enriched = result.value;

      // Should have metadata (tags, memoryType, importanceScore, etc.)
      // Different implementations may enrich different fields
      expect(enriched).toBeDefined();
      expect(enriched.id).toBe(segment.id);
      expect(enriched.content).toBe(segment.content);

      // At least one metadata field should be enriched
      const hasMetadata =
        enriched.tags.length > 0 ||
        enriched.memoryType !== segment.memoryType ||
        enriched.importanceScore !== segment.importanceScore;

      expect(hasMetadata).toBe(true);
    });

    test('should preserve original segment content', async () => {
      provider = new ProviderClass();
      await provider.initialize();

      const originalContent = 'This content should remain unchanged after extraction.';
      const segment = createTestSegment({ content: originalContent });

      const result = await provider.extract(segment);
      expectOk(result);

      const enriched = result.value;
      expect(enriched.content).toBe(originalContent);
    });

    test('should handle empty content gracefully', async () => {
      provider = new ProviderClass();
      await provider.initialize();

      const segment = createTestSegment({ content: '' });

      const result = await provider.extract(segment);

      // Empty content should either succeed (return segment as-is) or fail gracefully
      // Contract allows both behaviors, but must not throw
      expect(result).toHaveProperty('ok');

      if (result.ok) {
        // If ok, should return valid segment
        expect(result.value).toBeDefined();
        expect(result.value.id).toBe(segment.id);
      } else {
        // If error, should have proper error structure
        expect(result.error).toBeDefined();
        expect(result.error).toHaveProperty('code');
        expect(result.error).toHaveProperty('message');
      }
    });

    test('should handle whitespace-only content gracefully', async () => {
      provider = new ProviderClass();
      await provider.initialize();

      const segment = createTestSegment({ content: '   \n  \t  \n  ' });

      const result = await provider.extract(segment);

      // Whitespace-only should either succeed or fail gracefully
      expect(result).toHaveProperty('ok');

      if (result.ok) {
        expect(result.value).toBeDefined();
        expect(result.value.id).toBe(segment.id);
      } else {
        expect(result.error).toBeDefined();
        expect(result.error).toHaveProperty('code');
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
      const segment = createTestSegment({
        content: 'Normal content that should process successfully.',
      });

      const result = await provider.extract(segment);

      // Should either succeed or return error Result, never throw
      expect(result).toHaveProperty('ok');
    });

    test('should include code and message in error results', async () => {
      provider = new ProviderClass();
      await provider.initialize();

      // Try to trigger an error (this may not be possible for all implementations)
      // Most providers handle edge cases gracefully, which is correct behavior

      const segment = createTestSegment();
      const result = await provider.extract(segment);

      // If we get an error, validate structure
      if (!result.ok) {
        expect(result.error).toHaveProperty('code');
        expect(result.error).toHaveProperty('message');
        expect(typeof result.error.code).toBe('string');
        expect(typeof result.error.message).toBe('string');
      } else {
        // Success is also valid
        expect(result.value).toBeDefined();
      }
    });
  });
}
