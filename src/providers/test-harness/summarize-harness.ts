/**
 * SummarizeProvider contract test harness
 *
 * Validates any SummarizeProvider implementation against the interface contract.
 *
 * @module providers/test-harness/summarize-harness
 */

import { describe, test, expect, beforeAll, beforeEach, afterEach, afterAll } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import type { SummarizeProvider, SummarizeError } from '../summarize/interface';
import type { HarnessOptions } from './harness-types';
import {
  expectOk,
  expectError,
  createTestSegment,
  cleanTestDirectory,
  removeTestDirectory,
} from './base-harness';

/**
 * Run SummarizeProvider contract tests against a provider implementation.
 *
 * Tests all interface methods and validates contract compliance:
 * - Lifecycle methods (initialize, healthCheck, shutdown)
 * - summarize() enriches summary field
 * - summarize() enriches tags array
 * - summarize() preserves original content
 * - summarize() handles empty content gracefully
 * - Error handling (Result types, no exceptions)
 *
 * @param ProviderClass - SummarizeProvider implementation class
 * @param options - Optional harness configuration
 *
 * @example
 * ```typescript
 * import { runSummarizeProviderTests } from '../test-harness/summarize-harness';
 * import { SimpleExtract } from './simple-extract';
 *
 * describe('SimpleExtract', () => {
 *   runSummarizeProviderTests(SimpleExtract);
 * });
 * ```
 */
export function runSummarizeProviderTests(
  ProviderClass: new (...args: any[]) => SummarizeProvider,
  options?: HarnessOptions
): void {
  describe(`${ProviderClass.name} (SummarizeProvider Contract)`, () => {
    let provider: SummarizeProvider;
    let testDir: string;

    beforeAll(() => {
      testDir = join(
        homedir(),
        `.memstore-test-summarize-${ProviderClass.name.toLowerCase()}-${Date.now()}`
      );
      cleanTestDirectory(testDir);
    });

    beforeEach(async () => {
      // Instantiate provider (some providers may need config, most won't)
      provider = new ProviderClass({ testDir });
      const initResult = await provider.initialize();
      expectOk(initResult);

      if (options?.cleanupBeforeEach) {
        cleanTestDirectory(testDir);
      }
    });

    afterEach(async () => {
      await provider.shutdown();
    });

    afterAll(() => {
      removeTestDirectory(testDir);
    });

    // AC4: SummarizeProvider Contract Tests - initialize() succeeds
    test('should implement initialize() correctly', async () => {
      // Re-initialize to test from clean state
      const freshProvider = new ProviderClass({ testDir });
      const result = await freshProvider.initialize();

      expectOk(result);
      await freshProvider.shutdown();
    });

    // AC4: summarize() accepts MemorySegment and returns Result<MemorySegment, SummarizeError>
    test('should accept MemorySegment and return Result<MemorySegment, SummarizeError>', async () => {
      const segment = createTestSegment({
        content: 'The TypeScript hooks system provides a flexible architecture for extending functionality. It uses provider-based patterns.',
      });

      const result = await provider.summarize(segment);

      expectOk(result);
      expect(result.value).toBeDefined();
      expect(result.value.id).toBe(segment.id); // Same segment ID
    });

    // AC4: summarize() enriches segment with summary field
    test('should enrich segment with summary field', async () => {
      const segment = createTestSegment({
        content: 'The memory system uses a provider-based architecture. Each provider implements a specific interface for storage, search, or extraction functionality.',
      });

      const result = await provider.summarize(segment);

      expectOk(result);
      expect(result.value.summary).toBeDefined();
      expect(typeof result.value.summary).toBe('string');
      expect(result.value.summary!.length).toBeGreaterThan(0);
    });

    // AC4: summarize() enriches segment with tags array
    test('should enrich segment with tags array', async () => {
      const segment = createTestSegment({
        content: 'The TypeScript memory system uses providers for storage and retrieval. The architecture is modular and extensible.',
      });

      const result = await provider.summarize(segment);

      expectOk(result);
      expect(Array.isArray(result.value.tags)).toBe(true);
      expect(result.value.tags!.length).toBeGreaterThan(0);
    });

    // AC4: summarize() preserves original segment content
    test('should preserve original segment content', async () => {
      const originalContent = 'The memory system stores conversational context. It retrieves relevant segments during queries.';
      const segment = createTestSegment({
        content: originalContent,
        importanceScore: 75,
        accessCount: 5,
        timestamp: 1704912345000,
      });

      const result = await provider.summarize(segment);

      expectOk(result);
      // Content unchanged
      expect(result.value.content).toBe(originalContent);
      // Other fields preserved
      expect(result.value.importanceScore).toBe(75);
      expect(result.value.accessCount).toBe(5);
      expect(result.value.timestamp).toBe(1704912345000);
      expect(result.value.id).toBe(segment.id);
      expect(result.value.sessionId).toBe(segment.sessionId);
    });

    // AC4: summarize() handles empty content gracefully
    test('should handle empty content gracefully', async () => {
      const segment = createTestSegment({
        content: '',
      });

      const result = await provider.summarize(segment);

      // Should not throw - must return Result
      expect(result).toBeDefined();
      expect(result.ok !== undefined).toBe(true);

      // Can succeed with empty summary/tags OR return error - both are valid
      if (result.ok) {
        // If succeeds, summary and tags can be empty
        expect(result.value.summary !== undefined).toBe(true);
        expect(Array.isArray(result.value.tags)).toBe(true);
      } else {
        // If fails, must return valid error
        expectError(result);
        expect(result.error.code).toBeDefined();
        expect(result.error.message).toBeDefined();
      }
    });

    // AC4: handles whitespace-only content gracefully
    test('should handle whitespace-only content gracefully', async () => {
      const segment = createTestSegment({
        content: '   \n\t  ',
      });

      const result = await provider.summarize(segment);

      // Should not throw
      expect(result).toBeDefined();
      expect(result.ok !== undefined).toBe(true);

      // Can succeed or fail - both valid
      if (result.ok) {
        expect(result.value.summary !== undefined).toBe(true);
        expect(Array.isArray(result.value.tags)).toBe(true);
      } else {
        expectError(result);
        expect(result.error.code).toBeDefined();
      }
    });

    // AC4: healthCheck() returns valid status
    test('should implement healthCheck() correctly', async () => {
      const health = await provider.healthCheck();

      expect(health).toBeDefined();
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('message');
      expect(typeof health.healthy).toBe('boolean');
      expect(typeof health.message).toBe('string');
    });

    // AC4: shutdown() completes without error
    test('should implement shutdown() correctly', async () => {
      const freshProvider = new ProviderClass({ testDir });
      await freshProvider.initialize();

      const result = await freshProvider.shutdown();

      expectOk(result);
    });

    // AC4: Error cases return Result errors, not exceptions
    test('should return Result errors instead of throwing exceptions', async () => {
      // Test with invalid segment (missing required fields)
      const invalidSegment = {
        id: 'test-invalid',
        // Missing other required fields
      } as any;

      let caughtException = false;
      let result: any;

      try {
        result = await provider.summarize(invalidSegment);
      } catch (error) {
        caughtException = true;
      }

      // Should NOT throw - must return Result
      expect(caughtException).toBe(false);
      expect(result).toBeDefined();
      expect(result.ok !== undefined).toBe(true);

      // Can succeed (graceful) or fail with error - both valid
      // But must not throw
    });

    // AC9: Clear failure messages - verify error has required fields
    test('should provide clear error messages with code and message', async () => {
      // Try to get an error (implementation-dependent)
      const segment = createTestSegment({
        content: '', // Empty might trigger error in some implementations
      });

      const result = await provider.summarize(segment);

      // If error occurs, validate structure
      if (!result.ok) {
        expectError(result);
        expect(result.error.code).toBeDefined();
        expect(typeof result.error.code).toBe('string');
        expect(result.error.message).toBeDefined();
        expect(typeof result.error.message).toBe('string');
        expect(result.error.message.length).toBeGreaterThan(0);
      }
    });
  });
}
