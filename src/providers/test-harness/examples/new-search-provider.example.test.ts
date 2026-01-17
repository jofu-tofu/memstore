/**
 * Example: How to test a new SearchProvider implementation
 *
 * This example shows how to use the test harness to validate
 * a custom search provider implementation.
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { runSearchProviderTests } from '../search-harness';

// Import your custom SearchProvider implementation
// import { MyCustomSearchProvider } from './my-custom-search-provider';

/**
 * Example: Minimal SearchProvider implementation for demonstration
 *
 * Replace this with your actual implementation.
 */
class ExampleSearchProvider {
  readonly name = 'example-search';
  readonly version = '1.0.0';
  private segments = new Map<string, any>();

  async initialize() {
    return { ok: true as const, value: undefined };
  }

  async healthCheck() {
    return { healthy: true, message: 'Example search operational' };
  }

  async shutdown() {
    this.segments.clear();
    return { ok: true as const, value: undefined };
  }

  /**
   * Index a segment for search
   */
  async index(segment: any) {
    this.segments.set(segment.id, segment);
    return { ok: true as const, value: undefined };
  }

  /**
   * Search indexed segments
   */
  async search(query: string, options: any = {}) {
    if (!query || query.trim().length === 0) {
      return { ok: true as const, value: [] };
    }

    const queryLower = query.toLowerCase();
    const results: any[] = [];

    for (const [id, segment] of this.segments) {
      const content = segment.content.toLowerCase();
      const matchCount = (content.match(new RegExp(queryLower, 'g')) || []).length;

      if (matchCount > 0) {
        // Apply minMatchCount filter if specified
        if (options.minMatchCount && matchCount < options.minMatchCount) {
          continue;
        }

        results.push({
          segmentId: id,
          matchCount,
          matchedTerms: [queryLower]
        });
      }
    }

    // Sort by match count (descending)
    results.sort((a, b) => b.matchCount - a.matchCount);

    // Apply maxResults limit if specified
    if (options.maxResults) {
      return { ok: true as const, value: results.slice(0, options.maxResults) };
    }

    return { ok: true as const, value: results };
  }
}

/**
 * Test suite for your custom search provider
 */
describe('ExampleSearchProvider', () => {
  /**
   * Step 1: Run contract tests
   *
   * This validates that your implementation complies with
   * the SearchProvider interface contract.
   */
  runSearchProviderTests(ExampleSearchProvider);

  /**
   * Step 2: Add custom implementation-specific tests
   *
   * Contract tests validate the interface. Add custom tests
   * for implementation-specific behavior.
   */
  describe('example-specific behavior', () => {
    let provider: ExampleSearchProvider;

    beforeAll(async () => {
      provider = new ExampleSearchProvider();
      await provider.initialize();

      // Index some test segments
      const testSegments = [
        {
          id: 'seg-1',
          content: 'TypeScript is a strongly typed programming language.',
          tags: ['typescript', 'programming']
        },
        {
          id: 'seg-2',
          content: 'The memory system uses providers for modularity.',
          tags: ['memory', 'providers']
        },
        {
          id: 'seg-3',
          content: 'TypeScript providers enable flexible architecture.',
          tags: ['typescript', 'providers']
        }
      ];

      for (const segment of testSegments) {
        await provider.index(segment);
      }
    });

    test('should rank results by match count', async () => {
      const result = await provider.search('typescript');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(0);

        // First result should have highest match count
        for (let i = 0; i < result.value.length - 1; i++) {
          expect(result.value[i].matchCount).toBeGreaterThanOrEqual(
            result.value[i + 1].matchCount
          );
        }
      }
    });

    test('should support case-insensitive search', async () => {
      const result1 = await provider.search('TYPESCRIPT');
      const result2 = await provider.search('typescript');

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);

      if (result1.ok && result2.ok) {
        expect(result1.value.length).toBe(result2.value.length);
      }
    });

    test('should return empty results for non-matching query', async () => {
      const result = await provider.search('nonexistent-term-xyz');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    test('should support multi-word queries', async () => {
      const result = await provider.search('typescript providers');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should find segments containing either term
        expect(result.value.length).toBeGreaterThan(0);
      }
    });
  });
});

/**
 * Next steps:
 *
 * 1. Replace ExampleSearchProvider with your actual implementation
 * 2. Implement your search algorithm (TF-IDF, embeddings, etc.)
 * 3. Run tests: bun test path/to/your/provider.test.ts
 * 4. Fix any contract violations shown in test failures
 * 5. Add custom tests for your search algorithm specifics
 * 6. Benchmark performance (search should be < 100ms for typical queries)
 */
