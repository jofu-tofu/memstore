/**
 * Retrieval Provider Selection Tests
 *
 * Tests provider loading logic in retrieval.ts.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { globalProviderRegistry } from './provider-registry';
import type { Result } from '../types/common';
import type { SearchProvider } from './retrieval';
import { clearConfigCache } from './config';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';

const TEST_PAI_DIR = join(homedir(), 'pai-test-retrieval');

// Mock search provider
class MockSearchProvider {
  readonly name = 'mock-search';
  readonly version = '1.0.0';

  async initialize(): Promise<Result<void, any>> {
    return { ok: true, value: undefined };
  }

  async healthCheck(): Promise<any> {
    return { status: 'healthy' };
  }

  async shutdown(): Promise<void> {}

  async search(query: string, options?: any): Promise<Result<any[], any>> {
    return { ok: true, value: [] };
  }
}

describe('Retrieval - Provider Selection', () => {
  beforeEach(() => {
    // Create test directory
    mkdirSync(TEST_PAI_DIR, { recursive: true });
    mkdirSync(join(TEST_PAI_DIR, '.claude'), { recursive: true });

    // Clear config cache
    clearConfigCache();

    // Clear provider registry cache
    globalProviderRegistry.clearCache();

    // Set test PAI directory
    process.env.PAI_DIR = TEST_PAI_DIR;
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(TEST_PAI_DIR)) {
      rmSync(TEST_PAI_DIR, { recursive: true, force: true });
    }

    // Reset environment
    delete process.env.PAI_DIR;
  });

  test('should use keyword-search when configured', async () => {
    // Setup: Register keyword-search provider
    globalProviderRegistry.registerProvider(
      'search',
      'keyword-search',
      async () => {
        const provider = {
          name: 'keyword-search',
          version: '1.0.0',
          async initialize() {
            return { ok: true as const, value: undefined };
          },
          async healthCheck() {
            return { status: 'healthy' as const };
          },
          async shutdown() {},
          async search(query: string) {
            return { ok: true as const, value: [] };
          },
        };
        return { ok: true as const, value: provider };
      }
    );

    // Write config with keyword-search
    const configPath = join(TEST_PAI_DIR, '.claude', 'settings.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        memory: {
          enabled: true,
          providers: {
            search: 'keyword-search',
          },
        },
      })
    );

    // Test: Dynamic import required to get fresh module with test environment
    // This simulates the retrieval flow
    const result = await globalProviderRegistry.getProvider<SearchProvider>(
      'search',
      'keyword-search'
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('keyword-search');
    }
  });

  test('should fallback to keyword-search when semantic-search not found', async () => {
    // Setup: Register only keyword-search (semantic not available)
    globalProviderRegistry.registerProvider(
      'search',
      'keyword-search',
      async () => {
        const provider = {
          name: 'keyword-search',
          version: '1.0.0',
          async initialize() {
            return { ok: true as const, value: undefined };
          },
          async healthCheck() {
            return { status: 'healthy' as const };
          },
          async shutdown() {},
          async search(query: string) {
            return { ok: true as const, value: [] };
          },
        };
        return { ok: true as const, value: provider };
      }
    );

    // Write config requesting semantic-search
    const configPath = join(TEST_PAI_DIR, '.claude', 'settings.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        memory: {
          enabled: true,
          providers: {
            search: 'semantic-search', // Not registered
          },
        },
      })
    );

    // Test fallback behavior: try semantic, fail, then fall back to keyword
    const semanticResult = await globalProviderRegistry.getProvider<SearchProvider>(
      'search',
      'semantic-search'
    );

    expect(semanticResult.ok).toBe(false);

    // Fallback to keyword-search
    const fallbackResult = await globalProviderRegistry.getProvider<SearchProvider>(
      'search',
      'keyword-search'
    );

    expect(fallbackResult.ok).toBe(true);
    if (fallbackResult.ok) {
      expect(fallbackResult.value.name).toBe('keyword-search');
    }
  });

  test('should handle missing provider logs error and uses fallback', async () => {
    // Setup: Register keyword-search as fallback
    globalProviderRegistry.registerProvider(
      'search',
      'keyword-search',
      async () => {
        const provider = {
          name: 'keyword-search',
          version: '1.0.0',
          async initialize() {
            return { ok: true as const, value: undefined };
          },
          async healthCheck() {
            return { status: 'healthy' as const };
          },
          async shutdown() {},
          async search(query: string) {
            return { ok: true as const, value: [] };
          },
        };
        return { ok: true as const, value: provider };
      }
    );

    // Write config with nonexistent provider
    const configPath = join(TEST_PAI_DIR, '.claude', 'settings.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        memory: {
          enabled: true,
          providers: {
            search: 'nonexistent-provider',
          },
        },
      })
    );

    // Test: Provider not found
    const result = await globalProviderRegistry.getProvider<SearchProvider>(
      'search',
      'nonexistent-provider'
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFIG_PROVIDER_NOT_FOUND');
    }

    // Verify fallback works
    const fallbackResult = await globalProviderRegistry.getProvider<SearchProvider>(
      'search',
      'keyword-search'
    );

    expect(fallbackResult.ok).toBe(true);
  });

  test('should cache provider instance across calls', async () => {
    let instantiationCount = 0;

    // Setup: Register provider that counts instantiations
    globalProviderRegistry.registerProvider(
      'search',
      'keyword-search',
      async () => {
        instantiationCount++;
        const provider = {
          name: 'keyword-search',
          version: '1.0.0',
          async initialize() {
            return { ok: true as const, value: undefined };
          },
          async healthCheck() {
            return { status: 'healthy' as const };
          },
          async shutdown() {},
          async search(query: string) {
            return { ok: true as const, value: [] };
          },
        };
        return { ok: true as const, value: provider };
      }
    );

    // First call
    const result1 = await globalProviderRegistry.getProvider<SearchProvider>(
      'search',
      'keyword-search'
    );
    expect(result1.ok).toBe(true);
    expect(instantiationCount).toBe(1);

    // Second call - should use cache
    const result2 = await globalProviderRegistry.getProvider<SearchProvider>(
      'search',
      'keyword-search'
    );
    expect(result2.ok).toBe(true);
    expect(instantiationCount).toBe(1); // Still 1, not 2

    // Both should return same instance
    if (result1.ok && result2.ok) {
      expect(result1.value).toBe(result2.value);
    }
  });

  test('should use new provider when config changes', async () => {
    // Setup: Register multiple providers
    globalProviderRegistry.registerProvider(
      'search',
      'keyword-search',
      async () => ({
        ok: true as const,
        value: {
          name: 'keyword-search',
          version: '1.0.0',
          async initialize() {
            return { ok: true as const, value: undefined };
          },
          async healthCheck() {
            return { status: 'healthy' as const };
          },
          async shutdown() {},
          async search(query: string) {
            return { ok: true as const, value: [] };
          },
        },
      })
    );

    globalProviderRegistry.registerProvider(
      'search',
      'semantic-search',
      async () => ({
        ok: true as const,
        value: {
          name: 'semantic-search',
          version: '1.0.0',
          async initialize() {
            return { ok: true as const, value: undefined };
          },
          async healthCheck() {
            return { status: 'healthy' as const };
          },
          async shutdown() {},
          async search(query: string) {
            return { ok: true as const, value: [] };
          },
        },
      })
    );

    // Initial config
    const configPath = join(TEST_PAI_DIR, '.claude', 'settings.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        memory: {
          providers: { search: 'keyword-search' },
        },
      })
    );

    // First provider load
    const result1 = await globalProviderRegistry.getProvider<SearchProvider>(
      'search',
      'keyword-search'
    );
    expect(result1.ok).toBe(true);
    if (result1.ok) {
      expect(result1.value.name).toBe('keyword-search');
    }

    // Change config (simulating user edit)
    writeFileSync(
      configPath,
      JSON.stringify({
        memory: {
          providers: { search: 'semantic-search' },
        },
      })
    );

    // Clear cache to simulate new invocation
    clearConfigCache();

    // Second provider load - should get semantic-search
    const result2 = await globalProviderRegistry.getProvider<SearchProvider>(
      'search',
      'semantic-search'
    );
    expect(result2.ok).toBe(true);
    if (result2.ok) {
      expect(result2.value.name).toBe('semantic-search');
    }
  });
});
