/**
 * SearchProvider contract test harness
 *
 * @module providers/test-harness/search-harness
 */

import { describe, test, expect, beforeAll, beforeEach, afterEach, afterAll } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import type { SearchProvider } from '../search/interface';
import type { HarnessOptions } from './harness-types';
import { expectOk, expectError, cleanTestDirectory, removeTestDirectory } from './base-harness';

/**
 * Run SearchProvider contract tests against a provider implementation.
 */
export function runSearchProviderTests(
  ProviderClass: new (...args: any[]) => SearchProvider,
  options?: HarnessOptions
): void {
  describe(`${ProviderClass.name} (SearchProvider Contract)`, () => {
    let provider: SearchProvider;
    let testDir: string;

    beforeAll(() => {
      testDir = options?.testDataPath || join(homedir(), `pai-test-${ProviderClass.name.toLowerCase()}`);
      cleanTestDirectory(testDir);
    });

    beforeEach(async () => {
      provider = new ProviderClass({ indexPath: testDir });
      const initResult = await provider.initialize();
      expectOk(initResult);
    });

    afterEach(async () => {
      await provider.shutdown();
      if (options?.cleanupBeforeEach) {
        cleanTestDirectory(testDir);
      }
    });

    afterAll(() => {
      removeTestDirectory(testDir);
    });

    test('should implement initialize() correctly', async () => {
      const result = await provider.initialize();
      expectOk(result);
    });

    test('should implement search() - basic query returns SearchResult[]', async () => {
      const result = await provider.search('test query');
      expectOk(result);
      expect(result.value).toBeArray();
    });

    test('should implement search() - respects maxResults option', async () => {
      const result = await provider.search('test', { maxResults: 5 });
      expectOk(result);
      expect(result.value.length).toBeLessThanOrEqual(5);
    });

    test('should implement search() - respects minMatchCount option', async () => {
      const result = await provider.search('test query', { minMatchCount: 2 });
      expectOk(result);
      // Results should have at least 2 matching terms (or be empty)
      result.value.forEach(r => {
        if (r.matchCount > 0) {
          expect(r.matchCount).toBeGreaterThanOrEqual(2);
        }
      });
    });

    test('should implement search() - handles empty query gracefully', async () => {
      const result = await provider.search('');
      expectOk(result);
      expect(result.value).toEqual([]);
    });

    test('should implement search() - handles no matches (returns empty array)', async () => {
      const result = await provider.search('xyznonexistentquery123');
      expectOk(result);
      expect(result.value).toEqual([]);
    });

    test('should implement search() - SearchResult has required fields', async () => {
      const result = await provider.search('test');
      expectOk(result);

      result.value.forEach(r => {
        expect(r).toHaveProperty('segmentId');
        expect(r).toHaveProperty('matchCount');
        expect(r).toHaveProperty('matchedTerms');
        expect(r).toHaveProperty('totalQueryTerms');
        expect(r.segmentId).toBeString();
        expect(r.matchCount).toBeNumber();
        expect(r.matchedTerms).toBeArray();
        expect(r.totalQueryTerms).toBeNumber();
      });
    });

    test('should implement healthCheck() - returns valid status', async () => {
      const health = await provider.healthCheck();

      if ('ok' in health) {
        expect(health.ok).toBeBoolean();
      } else {
        expect(health).toHaveProperty('healthy');
        expect(health).toHaveProperty('message');
      }
    });

    test('should return Result errors, not throw exceptions', async () => {
      // Search with invalid input should return error, not throw
      // Actual validation depends on implementation
      const result = await provider.search('test');
      expect(result.ok).toBeBoolean();
    });

    test('should use correct error codes matching interface', async () => {
      // This test validates error codes when errors occur
      // Since normal queries might not trigger errors, we just verify the pattern
      const result = await provider.search('test');
      if (!result.ok) {
        expect(result.error.code).toMatch(/^SEARCH_/);
      }
    });
  });
}
