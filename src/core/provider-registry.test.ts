/**
 * Provider Registry Tests
 *
 * Tests for the provider registration and loading system.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { ProviderRegistry } from './provider-registry';
import type { Result } from '../types/common';

// Mock provider for testing
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

  async search(query: string): Promise<Result<any[], any>> {
    return { ok: true, value: [] };
  }
}

class MockStorageProvider {
  readonly name = 'mock-storage';
  readonly version = '1.0.0';

  async initialize(): Promise<Result<void, any>> {
    return { ok: true, value: undefined };
  }

  async healthCheck(): Promise<any> {
    return { status: 'healthy' };
  }

  async shutdown(): Promise<void> {}

  async store(data: any): Promise<Result<any, any>> {
    return { ok: true, value: { id: 'seg_1704567890123_abcd1234' } };
  }
}

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  describe('registerProvider', () => {
    test('should register provider successfully', async () => {
      const factory = async () => ({
        ok: true as const,
        value: new MockSearchProvider(),
      });

      registry.registerProvider('search', 'mock-search', factory);

      const result = await registry.getProvider('search', 'mock-search');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('mock-search');
      }
    });

    test('should register multiple providers of same type', async () => {
      const factory1 = async () => ({
        ok: true as const,
        value: new MockSearchProvider(),
      });

      const factory2 = async () => ({
        ok: true as const,
        value: { ...new MockSearchProvider(), name: 'mock-search-2' },
      });

      registry.registerProvider('search', 'mock-search-1', factory1);
      registry.registerProvider('search', 'mock-search-2', factory2);

      const result1 = await registry.getProvider('search', 'mock-search-1');
      const result2 = await registry.getProvider('search', 'mock-search-2');

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
    });

    test('should register providers of different types', async () => {
      const searchFactory = async () => ({
        ok: true as const,
        value: new MockSearchProvider(),
      });

      const storageFactory = async () => ({
        ok: true as const,
        value: new MockStorageProvider(),
      });

      registry.registerProvider('search', 'mock-search', searchFactory);
      registry.registerProvider('storage', 'mock-storage', storageFactory);

      const searchResult = await registry.getProvider('search', 'mock-search');
      const storageResult = await registry.getProvider(
        'storage',
        'mock-storage'
      );

      expect(searchResult.ok).toBe(true);
      expect(storageResult.ok).toBe(true);
    });

    test('should warn on duplicate provider registration', () => {
      const factory = async () => ({
        ok: true as const,
        value: new MockSearchProvider(),
      });

      // First registration
      registry.registerProvider('search', 'test', factory);

      // Second registration - should log warning but succeed
      registry.registerProvider('search', 'test', factory);

      // Note: Actual warning verification would need console.error spy
      // For now we just verify it doesn't throw
    });

    test('should validate provider factory is a function', () => {
      expect(() => {
        // @ts-expect-error - Testing invalid input
        registry.registerProvider('search', 'test', 'not-a-function');
      }).toThrow();
    });
  });

  describe('getProvider', () => {
    test('should return registered provider', async () => {
      const mockProvider = new MockSearchProvider();
      const factory = async () => ({
        ok: true as const,
        value: mockProvider,
      });

      registry.registerProvider('search', 'test-search', factory);

      const result = await registry.getProvider('search', 'test-search');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(mockProvider);
      }
    });

    test('should return error when provider not found', async () => {
      const result = await registry.getProvider('search', 'nonexistent');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFIG_PROVIDER_NOT_FOUND');
        expect(result.error.message).toContain('nonexistent');
      }
    });

    test('should return error when provider type not found', async () => {
      const result = await registry.getProvider('search', 'test');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFIG_PROVIDER_NOT_FOUND');
      }
    });

    test('should cache provider instances on subsequent calls', async () => {
      let instantiationCount = 0;

      const factory = async () => {
        instantiationCount++;
        return {
          ok: true as const,
          value: new MockSearchProvider(),
        };
      };

      registry.registerProvider('search', 'test', factory);

      // First call
      const result1 = await registry.getProvider('search', 'test');
      expect(result1.ok).toBe(true);
      expect(instantiationCount).toBe(1);

      // Second call - should use cached instance
      const result2 = await registry.getProvider('search', 'test');
      expect(result2.ok).toBe(true);
      expect(instantiationCount).toBe(1); // Still 1, not 2

      // Both should return same instance
      if (result1.ok && result2.ok) {
        expect(result1.value).toBe(result2.value);
      }
    });

    test('should handle provider initialization errors', async () => {
      const factory = async () => ({
        ok: false as const,
        error: {
          code: 'PROVIDER_INIT_FAILED',
          message: 'Initialization failed',
        },
      });

      registry.registerProvider('search', 'failing-provider', factory);

      const result = await registry.getProvider('search', 'failing-provider');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PROVIDER_INIT_FAILED');
      }
    });

    test('should handle factory exceptions', async () => {
      const factory = async () => {
        throw new Error('Factory crashed');
      };

      registry.registerProvider('search', 'crash-provider', factory);

      const result = await registry.getProvider('search', 'crash-provider');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFIG_PROVIDER_INIT_FAILED');
        expect(result.error.message).toContain('Factory crashed');
      }
    });
  });

  describe('hasProvider', () => {
    test('should return true for registered provider', () => {
      const factory = async () => ({
        ok: true as const,
        value: new MockSearchProvider(),
      });

      registry.registerProvider('search', 'test', factory);

      expect(registry.hasProvider('search', 'test')).toBe(true);
    });

    test('should return false for unregistered provider', () => {
      expect(registry.hasProvider('search', 'nonexistent')).toBe(false);
    });

    test('should return false for unregistered provider type', () => {
      expect(registry.hasProvider('search', 'test')).toBe(false);
    });
  });

  describe('getProviderTypes', () => {
    test('should return empty array when no providers registered', () => {
      const types = registry.getProviderTypes();
      expect(types).toEqual([]);
    });

    test('should return registered provider types', () => {
      const searchFactory = async () => ({
        ok: true as const,
        value: new MockSearchProvider(),
      });

      const storageFactory = async () => ({
        ok: true as const,
        value: new MockStorageProvider(),
      });

      registry.registerProvider('search', 'test-search', searchFactory);
      registry.registerProvider('storage', 'test-storage', storageFactory);

      const types = registry.getProviderTypes();
      expect(types).toContain('search');
      expect(types).toContain('storage');
      expect(types.length).toBe(2);
    });
  });

  describe('getProviderNames', () => {
    test('should return empty array for unregistered type', () => {
      const names = registry.getProviderNames('search');
      expect(names).toEqual([]);
    });

    test('should return registered provider names for type', () => {
      const factory1 = async () => ({
        ok: true as const,
        value: new MockSearchProvider(),
      });

      const factory2 = async () => ({
        ok: true as const,
        value: { ...new MockSearchProvider(), name: 'mock-search-2' },
      });

      registry.registerProvider('search', 'search-1', factory1);
      registry.registerProvider('search', 'search-2', factory2);

      const names = registry.getProviderNames('search');
      expect(names).toContain('search-1');
      expect(names).toContain('search-2');
      expect(names.length).toBe(2);
    });
  });

  describe('clearCache', () => {
    test('should clear provider cache and force re-instantiation', async () => {
      let instantiationCount = 0;

      const factory = async () => {
        instantiationCount++;
        return {
          ok: true as const,
          value: new MockSearchProvider(),
        };
      };

      registry.registerProvider('search', 'test', factory);

      // First call - should instantiate
      const result1 = await registry.getProvider('search', 'test');
      expect(result1.ok).toBe(true);
      expect(instantiationCount).toBe(1);

      // Second call - should use cache
      const result2 = await registry.getProvider('search', 'test');
      expect(result2.ok).toBe(true);
      expect(instantiationCount).toBe(1); // Still 1

      // Clear cache
      registry.clearCache();

      // Third call - should re-instantiate
      const result3 = await registry.getProvider('search', 'test');
      expect(result3.ok).toBe(true);
      expect(instantiationCount).toBe(2); // Incremented to 2
    });

    test('should not affect provider registration', async () => {
      const factory = async () => ({
        ok: true as const,
        value: new MockSearchProvider(),
      });

      registry.registerProvider('search', 'test', factory);

      // Clear cache before loading
      registry.clearCache();

      // Should still be able to load provider
      const result = await registry.getProvider('search', 'test');
      expect(result.ok).toBe(true);
    });
  });
});
