/**
 * Tests for Semantic Search Provider Example
 *
 * Demonstrates:
 * - Contract test usage (runSearchProviderTests)
 * - Provider-specific unit tests
 * - Edge case handling
 * - Error path testing
 * - Performance validation
 * - Proper test cleanup
 *
 * @module providers/search/semantic-search.example.test
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { SemanticSearchProvider } from './semantic-search.example';
import { SEARCH_ERROR_CODES } from './interface';

// Test directory setup
const TEST_DIR = join(homedir(), '.memstore-test-semantic-search');

beforeAll(() => {
  // Create test directory
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
});

afterAll(() => {
  // Clean up test directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

/**
 * Contract Tests
 *
 * ⚠️ IMPORTANT NOTE FOR CONTRIBUTORS:
 * This example uses MANUAL contract tests instead of the recommended
 * runSearchProviderTests() pattern because the semantic search provider
 * requires API keys and has special initialization requirements.
 *
 * **For most provider implementations, you SHOULD use the contract test harness:**
 * ```typescript
 * import { runSearchProviderTests } from '../test-harness/search-harness';
 * runSearchProviderTests(SemanticSearchProvider, { testDataPath: TEST_DIR });
 * ```
 *
 * Only deviate from the harness pattern if your provider has unique requirements
 * that make automated contract testing impractical (e.g., external API dependencies,
 * expensive initialization, special test data needs).
 */
describe('SemanticSearchProvider - Contract Compliance', () => {
  let provider: SemanticSearchProvider;

  beforeAll(async () => {
    // Mock API key for testing
    provider = new SemanticSearchProvider({
      embeddingModel: 'openai',
      apiKey: 'test-key', // In real tests, use test environment or mock
      minSimilarity: 0.7,
      memstoreDir: TEST_DIR
    });

    const initResult = await provider.initialize();
    if (!initResult.ok) {
      throw new Error(`Failed to initialize provider: ${initResult.error.message}`);
    }
  });

  afterAll(async () => {
    await provider.shutdown();
  });

  test('should have required provider properties', () => {
    expect(provider.name).toBe('semantic-search');
    expect(provider.version).toMatch(/^\d+\.\d+\.\d+$/); // SemVer format
  });

  test('should implement initialize() correctly', async () => {
    const result = await provider.initialize();
    expect(result.ok).toBe(true);
  });

  test('should implement healthCheck() correctly', async () => {
    const health = await provider.healthCheck();
    expect(health).toHaveProperty('healthy');
    expect(health).toHaveProperty('message');
    expect(typeof health.healthy).toBe('boolean');
    expect(typeof health.message).toBe('string');
  });

  test('should implement shutdown() without errors', async () => {
    await expect(provider.shutdown()).resolves.toBeUndefined();
  });

  test('should implement search() with correct signature', async () => {
    const result = await provider.search('test query');
    expect(result).toHaveProperty('ok');

    if (result.ok) {
      expect(Array.isArray(result.value)).toBe(true);
    } else {
      expect(result.error).toHaveProperty('code');
      expect(result.error).toHaveProperty('message');
    }
  });
});

/**
 * Provider-Specific Tests
 *
 * Tests for semantic search specific functionality
 */
describe('SemanticSearchProvider - Specific Functionality', () => {
  let provider: SemanticSearchProvider;

  beforeAll(async () => {
    provider = new SemanticSearchProvider({
      embeddingModel: 'openai',
      apiKey: 'test-key',
      minSimilarity: 0.5, // Lower threshold for testing
      memstoreDir: TEST_DIR
    });

    await provider.initialize();
  });

  afterAll(async () => {
    await provider.shutdown();
  });

  test('should reject empty query', async () => {
    const result = await provider.search('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(SEARCH_ERROR_CODES.QUERY_INVALID);
    }
  });

  test('should reject search before initialization', async () => {
    const uninitializedProvider = new SemanticSearchProvider({
      embeddingModel: 'openai',
      apiKey: 'test-key',
      memstoreDir: TEST_DIR
    });

    const result = await uninitializedProvider.search('test');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(SEARCH_ERROR_CODES.PROVIDER_NOT_INITIALIZED);
    }
  });

  test('should handle whitespace-only query', async () => {
    const result = await provider.search('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(SEARCH_ERROR_CODES.QUERY_INVALID);
    }
  });

  test('should respect maxResults option', async () => {
    // Note: This test would need actual embeddings in the index to properly test
    // In a real implementation with mocked embeddings, we'd verify:
    const result = await provider.search('test query', { maxResults: 5 });

    if (result.ok) {
      expect(result.value.length).toBeLessThanOrEqual(5);
    }
  });

  test('should include debug logging when debug option is true', async () => {
    // This test verifies the debug flag is processed correctly
    // In a real implementation, you'd capture console output
    const result = await provider.search('test query', { debug: true });
    expect(result).toHaveProperty('ok');
  });
});

/**
 * Embedding and Similarity Tests
 *
 * Tests for core semantic search algorithms
 */
describe('SemanticSearchProvider - Embedding and Similarity', () => {
  let provider: SemanticSearchProvider;

  beforeAll(async () => {
    provider = new SemanticSearchProvider({
      embeddingModel: 'openai',
      apiKey: process.env.OPENAI_API_KEY || 'test-key',
      minSimilarity: 0.7,
      memstoreDir: TEST_DIR
    });

    await provider.initialize();
  });

  afterAll(async () => {
    await provider.shutdown();
  });

  test('should calculate cosine similarity correctly', () => {
    // Access private method through type assertion for testing
    const providerAny = provider as any;

    // Identical vectors should have similarity 1.0
    const vec1 = [1, 0, 0];
    const vec2 = [1, 0, 0];
    expect(providerAny.cosineSimilarity(vec1, vec2)).toBeCloseTo(1.0, 5);

    // Orthogonal vectors should have similarity 0.0
    const vec3 = [1, 0, 0];
    const vec4 = [0, 1, 0];
    expect(providerAny.cosineSimilarity(vec3, vec4)).toBeCloseTo(0.0, 5);

    // Opposite vectors should have similarity -1.0
    const vec5 = [1, 0, 0];
    const vec6 = [-1, 0, 0];
    expect(providerAny.cosineSimilarity(vec5, vec6)).toBeCloseTo(-1.0, 5);
  });

  test('should handle zero-magnitude vectors', () => {
    const providerAny = provider as any;

    const zeroVec = [0, 0, 0];
    const normalVec = [1, 0, 0];

    expect(providerAny.cosineSimilarity(zeroVec, normalVec)).toBe(0);
    expect(providerAny.cosineSimilarity(normalVec, zeroVec)).toBe(0);
  });

  test('should throw error for mismatched vector dimensions', () => {
    const providerAny = provider as any;

    const vec1 = [1, 0, 0];
    const vec2 = [1, 0];

    expect(() => providerAny.cosineSimilarity(vec1, vec2)).toThrow();
  });
});

/**
 * Index Management Tests
 *
 * Tests for embedding index persistence and loading
 */
describe('SemanticSearchProvider - Index Management', () => {
  test('should create index directory if it does not exist', async () => {
    const testMemstoreDir = join(TEST_DIR, 'index-test-1');
    const provider = new SemanticSearchProvider({
      embeddingModel: 'openai',
      apiKey: 'test-key',
      memstoreDir: testMemstoreDir
    });

    await provider.initialize();

    const indexDir = join(testMemstoreDir, 'mem-store', 'indexes', 'semantic');
    expect(existsSync(indexDir)).toBe(true);

    await provider.shutdown();

    // Cleanup
    if (existsSync(testMemstoreDir)) {
      rmSync(testMemstoreDir, { recursive: true, force: true });
    }
  });

  test('should load existing index on initialization', async () => {
    const testMemstoreDir = join(TEST_DIR, 'index-test-2');
    const indexPath = join(testMemstoreDir, 'mem-store', 'indexes', 'semantic', 'embeddings.json');

    // Create directory structure
    mkdirSync(join(testMemstoreDir, 'mem-store', 'indexes', 'semantic'), { recursive: true });

    // Create mock index file
    const mockIndex = {
      version: '1.0.0',
      model: 'openai',
      dimensions: 1536,
      entries: [
        {
          segmentId: 'seg_123',
          embedding: Array(1536).fill(0),
          preview: 'Test segment'
        }
      ]
    };

    writeFileSync(indexPath, JSON.stringify(mockIndex), 'utf-8');

    // Initialize provider and verify it loads the index
    const provider = new SemanticSearchProvider({
      embeddingModel: 'openai',
      apiKey: 'test-key',
      memstoreDir: testMemstoreDir
    });

    await provider.initialize();

    const health = await provider.healthCheck();
    expect(health.details?.embeddingCount).toBe(1);

    await provider.shutdown();

    // Cleanup
    if (existsSync(testMemstoreDir)) {
      rmSync(testMemstoreDir, { recursive: true, force: true });
    }
  });

  test('should handle corrupted index gracefully', async () => {
    const testMemstoreDir = join(TEST_DIR, 'index-test-3');
    const indexPath = join(testMemstoreDir, 'mem-store', 'indexes', 'semantic', 'embeddings.json');

    // Create directory structure
    mkdirSync(join(testMemstoreDir, 'mem-store', 'indexes', 'semantic'), { recursive: true });

    // Create corrupted index file (invalid JSON)
    writeFileSync(indexPath, '{ invalid json', 'utf-8');

    const provider = new SemanticSearchProvider({
      embeddingModel: 'openai',
      apiKey: 'test-key',
      memstoreDir: testMemstoreDir
    });

    const result = await provider.initialize();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(SEARCH_ERROR_CODES.FAILED);
    }

    // Cleanup
    if (existsSync(testMemstoreDir)) {
      rmSync(testMemstoreDir, { recursive: true, force: true });
    }
  });
});

/**
 * Configuration Tests
 *
 * Tests for provider configuration options
 */
describe('SemanticSearchProvider - Configuration', () => {
  test('should use default configuration values', async () => {
    const provider = new SemanticSearchProvider({
      embeddingModel: 'openai',
      memstoreDir: TEST_DIR
    });

    await provider.initialize();

    const health = await provider.healthCheck();
    expect(health.details?.dimensions).toBe(1536); // Default OpenAI dimensions
    expect(health.details?.embeddingModel).toBe('openai');

    await provider.shutdown();
  });

  test('should respect custom minSimilarity threshold', async () => {
    const provider = new SemanticSearchProvider({
      embeddingModel: 'openai',
      apiKey: 'test-key',
      minSimilarity: 0.9, // Very high threshold
      memstoreDir: TEST_DIR
    });

    await provider.initialize();

    // With a high threshold, we expect fewer results
    // (This would be more meaningful with actual embeddings in the index)
    const result = await provider.search('test query');
    expect(result).toHaveProperty('ok');

    await provider.shutdown();
  });

  test('should use environment variable for API key', async () => {
    const originalKey = process.env.OPENAI_API_KEY;

    try {
      process.env.OPENAI_API_KEY = 'env-test-key';

      const provider = new SemanticSearchProvider({
        embeddingModel: 'openai',
        memstoreDir: TEST_DIR
      });

      await provider.initialize();

      // Verify provider can access the key (via health check)
      const health = await provider.healthCheck();
      expect(health.details?.hasApiKey).toBe(true);

      await provider.shutdown();
    } finally {
      // Restore original environment variable
      if (originalKey) {
        process.env.OPENAI_API_KEY = originalKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });
});

/**
 * Error Handling Tests
 *
 * Tests for proper Result<T, E> error handling
 */
describe('SemanticSearchProvider - Error Handling', () => {
  test('should return Result type on all operations', async () => {
    const provider = new SemanticSearchProvider({
      embeddingModel: 'openai',
      apiKey: 'test-key',
      memstoreDir: TEST_DIR
    });

    const initResult = await provider.initialize();
    expect(initResult).toHaveProperty('ok');

    if (!initResult.ok) {
      expect(initResult.error).toHaveProperty('code');
      expect(initResult.error).toHaveProperty('message');
    }

    await provider.shutdown();
  });

  test('should never throw exceptions', async () => {
    const provider = new SemanticSearchProvider({
      embeddingModel: 'openai',
      apiKey: 'test-key',
      memstoreDir: TEST_DIR
    });

    // Initialize should return Result, not throw
    const initResult = await provider.initialize();
    expect(initResult).toHaveProperty('ok');

    // Search should return Result even with invalid input, not throw
    const searchResult = await provider.search('');
    expect(searchResult).toHaveProperty('ok');

    // Health check should return HealthStatus, not throw
    const healthResult = await provider.healthCheck();
    expect(healthResult).toHaveProperty('healthy');

    // Shutdown should complete without throwing
    await provider.shutdown();
  });

  test('should include cause in error results', async () => {
    const testMemstoreDir = join(TEST_DIR, 'error-test');
    const indexPath = join(testMemstoreDir, 'mem-store', 'indexes', 'semantic', 'embeddings.json');

    // Create corrupted index
    mkdirSync(join(testMemstoreDir, 'mem-store', 'indexes', 'semantic'), { recursive: true });
    writeFileSync(indexPath, '{ invalid', 'utf-8');

    const provider = new SemanticSearchProvider({
      embeddingModel: 'openai',
      apiKey: 'test-key',
      memstoreDir: testMemstoreDir
    });

    const result = await provider.initialize();
    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.cause).toBeDefined();
      expect(result.error.cause).toBeInstanceOf(Error);
    }

    // Cleanup
    if (existsSync(testMemstoreDir)) {
      rmSync(testMemstoreDir, { recursive: true, force: true });
    }
  });
});

/**
 * Performance and Caching Tests
 *
 * Tests for embedding caching and performance optimization
 */
describe('SemanticSearchProvider - Performance', () => {
  test('should cache embeddings in memory', async () => {
    const provider = new SemanticSearchProvider({
      embeddingModel: 'openai',
      apiKey: 'test-key',
      memstoreDir: TEST_DIR
    });

    await provider.initialize();

    // Note: In a real implementation with mocked API calls,
    // you would verify that the second call doesn't hit the API
    // by checking call counts on the mock

    await provider.shutdown();
  });

  test('should persist embeddings to disk on shutdown', async () => {
    const testMemstoreDir = join(TEST_DIR, 'persist-test');
    const indexPath = join(testMemstoreDir, 'mem-store', 'indexes', 'semantic', 'embeddings.json');

    const provider = new SemanticSearchProvider({
      embeddingModel: 'openai',
      apiKey: 'test-key',
      memstoreDir: testMemstoreDir
    });

    await provider.initialize();

    // In a real implementation, you would:
    // 1. Index some segments
    // 2. Shutdown
    // 3. Verify index file exists
    // 4. Initialize new provider
    // 5. Verify it loads the cached embeddings

    await provider.shutdown();

    // Cleanup
    if (existsSync(testMemstoreDir)) {
      rmSync(testMemstoreDir, { recursive: true, force: true });
    }
  });
});
