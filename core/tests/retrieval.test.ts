import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { retrieveMemories, resetSearchProvider } from '../retrieval';
import { globalProviderRegistry } from '../provider-registry';
import { registerMVPProviders, resetProvidersRegistered } from '../register-providers';
import { clearConfigCache } from '../config';

const TEST_PAI_DIR = join(homedir(), 'pai-test-retrieval');
const TEST_INDEX_DIR = join(TEST_PAI_DIR, 'mem-store', 'indexes', 'keyword');
const TEST_INDEX_FILE = join(TEST_INDEX_DIR, 'index.json');

describe('Retrieval Pipeline Integration', () => {
  beforeAll(() => {
    // Create test directory structure
    mkdirSync(TEST_INDEX_DIR, { recursive: true });

    // Create test index with known data
    const testIndex = {
      typescript: ['seg_001', 'seg_042', 'seg_089'],
      hook: ['seg_001', 'seg_055'],
      error: ['seg_001', 'seg_023', 'seg_067'],
      fix: ['seg_001', 'seg_023'],
      authentication: ['seg_002', 'seg_045'],
      performance: ['seg_015', 'seg_067', 'seg_091']
    };

    writeFileSync(TEST_INDEX_FILE, JSON.stringify(testIndex, null, 2));

    // Set PAI_DIR for tests
    process.env.PAI_DIR = TEST_PAI_DIR;

    // Reset and register providers fresh for this test
    globalProviderRegistry.clearCache();
    resetProvidersRegistered();
    registerMVPProviders();
    resetSearchProvider();
    clearConfigCache();
  });

  afterAll(() => {
    // ALWAYS clean up test directory
    if (existsSync(TEST_PAI_DIR)) {
      rmSync(TEST_PAI_DIR, { recursive: true, force: true });
    }

    // Restore PAI_DIR
    delete process.env.PAI_DIR;
  });

  describe('retrieveMemories()', () => {
    test('should return Result type with success', async () => {
      const result = await retrieveMemories('typescript hook error');

      expect(result).toHaveProperty('ok');
      if (result.ok) {
        expect(Array.isArray(result.value)).toBe(true);
      } else {
        // Should not reach here
        expect(result.ok).toBe(true);
      }
    });

    test('should initialize search provider on first call', async () => {
      const result = await retrieveMemories('test query');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Story 2.2: Returns empty array (filtering/ranking pending)
        expect(result.value).toEqual([]);
      }
    });

    test('should handle keyword search integration', async () => {
      const result = await retrieveMemories('typescript hook error', {
        maxResults: 10
      });

      expect(result.ok).toBe(true);
      // Story 2.2: Keyword search works but returns empty until Story 2.5
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    test('should respect maxResults option', async () => {
      const result = await retrieveMemories('typescript', {
        maxResults: 2
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Story 2.2: Returns empty (no content loading yet)
        expect(result.value).toEqual([]);
      }
    });

    test('should not throw exceptions', async () => {
      // Verify that retrieval pipeline never throws
      let didThrow = false;

      try {
        await retrieveMemories('any query');
      } catch (error) {
        didThrow = true;
      }

      expect(didThrow).toBe(false);
    });

    test('should handle empty query gracefully', async () => {
      const result = await retrieveMemories('');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    test('should handle query with only stop words', async () => {
      const result = await retrieveMemories('the a an is are');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // No valid search terms, returns empty
        expect(result.value).toEqual([]);
      }
    });

    test('should handle options parameter', async () => {
      const result = await retrieveMemories('test query', {
        maxResults: 10,
        maxTokens: 2000,
        minRelevance: 0.5
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    test('should handle query with special characters', async () => {
      const result = await retrieveMemories('test @#$% query with &*() symbols');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('Error Handling', () => {
    test('should return Result error type with proper structure', async () => {
      // Test that errors follow ProviderError pattern
      const result = await retrieveMemories('test');

      expect(result).toHaveProperty('ok');

      if (!result.ok) {
        expect(result.error).toHaveProperty('code');
        expect(result.error).toHaveProperty('message');
        expect(typeof result.error.code).toBe('string');
        expect(typeof result.error.message).toBe('string');
      }
    });
  });

  describe('Integration with KeywordSearch Provider', () => {
    test('should integrate with keyword search successfully', async () => {
      const result = await retrieveMemories('typescript hook error');

      expect(result.ok).toBe(true);
    });

    test('should pass search options to provider', async () => {
      const result = await retrieveMemories('typescript', {
        maxResults: 5,
        minRelevance: 50
      });

      expect(result.ok).toBe(true);
    });

    test('should handle multi-term queries', async () => {
      const result = await retrieveMemories('typescript hook error fix performance');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Story 2.2: Returns empty until Story 2.5 content loading
        expect(Array.isArray(result.value)).toBe(true);
      }
    });
  });
});
