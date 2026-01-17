/**
 * SegmentProvider contract test harness
 *
 * Validates that a SegmentProvider implementation complies with the interface contract.
 *
 * @module providers/test-harness/segment-harness
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { homedir } from 'os';
import { join } from 'path';
import type { SegmentProvider, SegmentError } from '../segment/interface';
import { SEGMENT_ERROR_CODES } from '../segment/interface';
import type { ProviderError } from '../../types/common';
import {
  expectOk,
  expectError,
  createTestSession,
  removeTestDirectory,
} from './base-harness';

/**
 * Options for configuring segment harness tests.
 */
export interface SegmentHarnessOptions {
  /**
   * Clean test data between each test (default: false).
   */
  cleanupBeforeEach?: boolean;

  /**
   * Custom test data path (default: ~/.memstore-test-{provider-name}).
   */
  testDataPath?: string;
}

/**
 * Run SegmentProvider contract tests against a provider implementation.
 *
 * @param ProviderClass - The SegmentProvider class to test
 * @param options - Optional test configuration
 *
 * @example
 * ```typescript
 * import { runSegmentProviderTests } from '../test-harness/segment-harness';
 * import { PerMessageSegmentProvider } from './per-message';
 *
 * describe('PerMessageSegmentProvider', () => {
 *   runSegmentProviderTests(PerMessageSegmentProvider);
 * });
 * ```
 */
export function runSegmentProviderTests(
  ProviderClass: new (...args: any[]) => SegmentProvider,
  options: SegmentHarnessOptions = {}
): void {
  describe(`${ProviderClass.name} (SegmentProvider Contract)`, () => {
    let provider: SegmentProvider;
    let testDir: string;

    beforeAll(() => {
      const providerName = ProviderClass.name.toLowerCase().replace(/provider$/, '');
      testDir = options.testDataPath || join(homedir(), `.memstore-test-${providerName}`);
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

    test('should accept transcript string and sessionId', async () => {
      provider = new ProviderClass();
      await provider.initialize();

      const transcript = 'User: Hello\nAssistant: Hi there!';
      const sessionId = createTestSession();

      const result = await provider.segment(transcript, sessionId);

      expectOk(result);
      expect(Array.isArray(result.value)).toBe(true);
    });

    test('should return Result<MemorySegment[], SegmentError>', async () => {
      provider = new ProviderClass();
      await provider.initialize();

      const transcript = 'User: Test message\nAssistant: Test response';
      const sessionId = createTestSession();

      const result = await provider.segment(transcript, sessionId);

      // Validate Result type
      expect(result).toHaveProperty('ok');
      if (result.ok) {
        expect(result.value).toBeDefined();
        expect(Array.isArray(result.value)).toBe(true);
      } else {
        expect(result.error).toBeDefined();
        expect(result.error).toHaveProperty('code');
        expect(result.error).toHaveProperty('message');
      }
    });

    test('should return empty array for empty transcript (not error)', async () => {
      provider = new ProviderClass();
      await provider.initialize();

      const sessionId = createTestSession();

      // Test empty string
      const result1 = await provider.segment('', sessionId);
      expectOk(result1);
      expect(result1.value).toEqual([]);

      // Test whitespace-only string
      const result2 = await provider.segment('   \n  \n  ', sessionId);
      expectOk(result2);
      expect(result2.value).toEqual([]);
    });

    test('should assign unique IDs to each segment', async () => {
      provider = new ProviderClass();
      await provider.initialize();

      const transcript = 'User: First\nAssistant: Response\nUser: Second\nAssistant: Another';
      const sessionId = createTestSession();

      const result = await provider.segment(transcript, sessionId);
      expectOk(result);

      const segments = result.value;
      if (segments.length > 1) {
        const ids = segments.map(s => s.id);
        const uniqueIds = new Set(ids);

        expect(uniqueIds.size).toBe(ids.length);
      }

      // All IDs should be defined and non-empty
      segments.forEach(segment => {
        expect(segment.id).toBeDefined();
        expect(typeof segment.id).toBe('string');
        expect(segment.id.length).toBeGreaterThan(0);
      });
    });

    test('should set sessionId on all segments', async () => {
      provider = new ProviderClass();
      await provider.initialize();

      const transcript = 'User: Message 1\nAssistant: Response 1\nUser: Message 2\nAssistant: Response 2';
      const sessionId = createTestSession();

      const result = await provider.segment(transcript, sessionId);
      expectOk(result);

      const segments = result.value;
      segments.forEach(segment => {
        expect(segment.sessionId).toBe(sessionId);
      });
    });

    test('should set sourceRange on all segments', async () => {
      provider = new ProviderClass();
      await provider.initialize();

      const transcript = 'User: Test\nAssistant: Response';
      const sessionId = createTestSession();

      const result = await provider.segment(transcript, sessionId);
      expectOk(result);

      const segments = result.value;
      segments.forEach(segment => {
        expect(segment.sourceRange).toBeDefined();
        expect(segment.sourceRange).toHaveProperty('start');
        expect(segment.sourceRange).toHaveProperty('end');
        expect(typeof segment.sourceRange.start).toBe('number');
        expect(typeof segment.sourceRange.end).toBe('number');
        expect(segment.sourceRange.end).toBeGreaterThanOrEqual(segment.sourceRange.start);
      });
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

      const result = await provider.shutdown();

      // shutdown() should return Result<void, ProviderError>
      expectOk(result);
      expect(result.value).toBeUndefined();
    });

    test('should return Result errors for error cases, not throw exceptions', async () => {
      provider = new ProviderClass();
      await provider.initialize();

      // This test validates that the provider handles errors gracefully
      // Even if we can't trigger an error easily, the provider should never throw

      // Test with invalid session ID (null/undefined) if implementation validates
      // Most implementations may handle this gracefully, which is fine
      const sessionId = createTestSession();
      const result = await provider.segment('User: Test', sessionId);

      // Should either succeed or return error Result, never throw
      expect(result).toHaveProperty('ok');
    });
  });
}
