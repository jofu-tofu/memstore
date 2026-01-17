/**
 * Provider Registry System
 *
 * Manages registration and loading of pluggable provider implementations.
 * Supports dynamic provider selection via configuration with fallback logic.
 *
 * Key Features:
 * - Factory pattern for lazy provider initialization
 * - Provider caching to avoid re-instantiation
 * - Result-based error handling (no exceptions)
 * - Type-safe provider registration
 *
 * @see Story 3.4 - Provider Selection
 * @see architecture.md:393-438 - Provider system design
 */

import type { Result } from '../types/common';

/**
 * Provider types supported by the memory system
 */
export type ProviderType =
  | 'segment'
  | 'extract'
  | 'summarize'
  | 'storage'
  | 'search'
  | 'organize';

/**
 * Base provider interface
 *
 * All providers must implement these core lifecycle methods.
 */
export interface Provider {
  /** Provider name (kebab-case) */
  readonly name: string;

  /** Provider version */
  readonly version: string;

  /** Initialize provider resources */
  initialize(): Promise<Result<void, ProviderError>>;

  /** Check provider health status */
  healthCheck(): Promise<HealthStatus>;

  /** Clean up provider resources */
  shutdown(): Promise<void>;
}

/**
 * Provider health status
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
}

/**
 * Provider error types
 */
export interface ProviderError {
  /** Namespaced error code */
  code:
    | 'CONFIG_PROVIDER_NOT_FOUND'
    | 'CONFIG_PROVIDER_INVALID'
    | 'CONFIG_PROVIDER_INIT_FAILED'
    | 'CONFIG_DEFAULT_MISSING'
    | 'PROVIDER_INIT_FAILED'           // Used by provider factories
    | 'PROVIDER_VALIDATION_FAILED';     // Used by factory validation

  /** Human-readable error message */
  message: string;

  /** Original error if any */
  cause?: Error;
}

/**
 * Provider factory function for lazy initialization
 *
 * Returns Result to handle initialization errors gracefully.
 */
export type ProviderFactory<T extends Provider> = () => Promise<
  Result<T, ProviderError>
>;

/**
 * Provider Registry
 *
 * Central registry for all provider implementations. Handles:
 * - Provider registration via factory functions
 * - Provider loading with caching
 * - Type-safe provider resolution
 * - Graceful error handling with Result types
 *
 * @example
 * ```typescript
 * const registry = new ProviderRegistry();
 *
 * // Register a provider
 * registry.registerProvider('search', 'keyword-search', async () => {
 *   const provider = new KeywordSearchProvider();
 *   const initResult = await provider.initialize();
 *   if (!initResult.ok) {
 *     return { ok: false, error: initResult.error };
 *   }
 *   return { ok: true, value: provider };
 * });
 *
 * // Get a provider (lazy load and cache)
 * const result = await registry.getProvider('search', 'keyword-search');
 * if (result.ok) {
 *   const provider = result.value;
 *   // Use provider...
 * }
 * ```
 */
export class ProviderRegistry {
  /**
   * Provider factories organized by type -> name
   */
  private providers: Map<string, Map<string, ProviderFactory<any>>> = new Map();

  /**
   * Cached provider instances to avoid re-instantiation
   */
  private cache: Map<string, Provider> = new Map();

  /**
   * Register a provider factory
   *
   * Registers a factory function that will be called lazily when the provider
   * is first requested. Subsequent requests return the cached instance.
   *
   * @param type - Provider category (search, storage, etc.)
   * @param name - Provider name (kebab-case)
   * @param factory - Factory function that creates provider instance
   *
   * @example
   * ```typescript
   * registry.registerProvider('search', 'keyword-search', async () => {
   *   const provider = new KeywordSearchProvider();
   *   await provider.initialize();
   *   return { ok: true, value: provider };
   * });
   * ```
   */
  registerProvider<T extends Provider>(
    type: ProviderType,
    name: string,
    factory: ProviderFactory<T>
  ): void {
    // Validate factory is a function
    if (typeof factory !== 'function') {
      throw new Error(
        `Provider factory for ${type}:${name} must be a function`
      );
    }

    // Validate factory is async (returns Promise)
    // Note: This is a best-effort check - we can't verify the Promise<Result> return type at runtime
    const factoryStr = factory.toString();
    if (!factoryStr.includes('async') && !factoryStr.includes('Promise')) {
      console.error(
        `[Memory:ProviderRegistry] Warning: Provider factory for ${type}:${name} should be async or return Promise`
      );
    }

    // Get or create type map
    if (!this.providers.has(type)) {
      this.providers.set(type, new Map());
    }

    const typeMap = this.providers.get(type)!;

    // Warn on duplicate registration
    if (typeMap.has(name)) {
      console.error(
        `[Memory:ProviderRegistry] Warning: Provider ${type}:${name} already registered, overwriting`
      );
    }

    // Register factory
    typeMap.set(name, factory);
  }

  /**
   * Get a provider instance
   *
   * Loads provider via factory on first call, then returns cached instance.
   * Returns error Result if provider not found or initialization fails.
   *
   * @param type - Provider category
   * @param name - Provider name
   * @returns Result with provider instance or error
   *
   * @example
   * ```typescript
   * const result = await registry.getProvider('search', 'keyword-search');
   * if (!result.ok) {
   *   console.error(`Failed to load provider: ${result.error.message}`);
   *   return;
   * }
   * const provider = result.value;
   * ```
   */
  async getProvider<T extends Provider>(
    type: ProviderType,
    name: string
  ): Promise<Result<T, ProviderError>> {
    const cacheKey = `${type}:${name}`;

    // Return cached instance if available
    if (this.cache.has(cacheKey)) {
      return { ok: true, value: this.cache.get(cacheKey) as T };
    }

    // Check if provider registered
    const typeMap = this.providers.get(type);
    if (!typeMap || !typeMap.has(name)) {
      return {
        ok: false,
        error: {
          code: 'CONFIG_PROVIDER_NOT_FOUND',
          message: `Provider ${type}:${name} not found in registry`,
        },
      };
    }

    // Get factory and create provider
    const factory = typeMap.get(name)!;

    try {
      const result = await factory();

      if (!result.ok) {
        // Factory returned error
        return result;
      }

      // Cache successful instantiation
      this.cache.set(cacheKey, result.value);

      return { ok: true, value: result.value as T };
    } catch (error) {
      // Factory threw exception
      return {
        ok: false,
        error: {
          code: 'CONFIG_PROVIDER_INIT_FAILED',
          message: `Provider ${type}:${name} initialization failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          cause: error instanceof Error ? error : undefined,
        },
      };
    }
  }

  /**
   * Check if a provider is registered
   *
   * @param type - Provider category
   * @param name - Provider name
   * @returns true if provider registered
   */
  hasProvider(type: ProviderType, name: string): boolean {
    const typeMap = this.providers.get(type);
    return typeMap !== undefined && typeMap.has(name);
  }

  /**
   * Get all registered provider types
   *
   * @returns Array of provider types with registered providers
   */
  getProviderTypes(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get all registered provider names for a type
   *
   * @param type - Provider category
   * @returns Array of provider names
   */
  getProviderNames(type: ProviderType): string[] {
    const typeMap = this.providers.get(type);
    if (!typeMap) {
      return [];
    }
    return Array.from(typeMap.keys());
  }

  /**
   * Clear provider cache
   *
   * Forces providers to be re-instantiated on next getProvider() call.
   * Useful for:
   * - Testing: Reset state between test cases
   * - Config changes: Force reload with new configuration
   * - Development: Reload provider implementations without restart
   *
   * @example
   * ```typescript
   * // Clear cache after config change
   * updateConfig({ providers: { search: 'semantic-search' } });
   * registry.clearCache();
   * // Next getProvider() will use new config
   * ```
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear all registrations and cache
   *
   * Completely resets the registry to initial state.
   * Useful for:
   * - Testing: Ensure complete isolation between test files
   * - Hot reload: Clear all providers before re-registration
   *
   * @example
   * ```typescript
   * // In test file afterAll/beforeAll
   * globalProviderRegistry.clearAll();
   * // Re-register providers
   * registerMVPProviders();
   * ```
   */
  clearAll(): void {
    this.cache.clear();
    this.providers.clear();
  }
}

/**
 * Global provider registry instance
 *
 * Shared across all hooks and pipelines to ensure consistent provider access.
 */
export const globalProviderRegistry = new ProviderRegistry();
