/**
 * Provider Registration
 *
 * Registers all MVP providers with the global provider registry.
 * This file must be imported at application startup to make providers available.
 *
 * @see Story 3.4 - Provider Selection
 */

import { globalProviderRegistry } from './provider-registry';
import type { Result } from '../types/common';
import type { ProviderError } from './provider-registry';

/**
 * Singleton guard to prevent duplicate registration
 */
let providersRegistered = false;

/**
 * Reset the registration guard
 *
 * Used in testing to allow re-registration of providers after clearAll().
 * Must be called before registerMVPProviders() to allow re-registration.
 *
 * @example
 * ```typescript
 * // In test file afterAll
 * globalProviderRegistry.clearAll();
 * resetProvidersRegistered();
 * registerMVPProviders();
 * ```
 */
export function resetProvidersRegistered(): void {
  providersRegistered = false;
}

/**
 * Helper function to create a generic provider factory
 *
 * Reduces code duplication by providing a standard factory pattern.
 *
 * @param importPath - Relative path to provider module
 * @param className - Name of provider class to instantiate
 * @param providerName - Human-readable provider name for error messages
 * @returns Provider factory function
 */
function createProviderFactory<T>(
  importPath: string,
  className: string,
  providerName: string
): () => Promise<Result<T, ProviderError>> {
  return async (): Promise<Result<T, ProviderError>> => {
    try {
      const module = await import(importPath);
      const ProviderClass = module[className];

      if (!ProviderClass) {
        return {
          ok: false,
          error: {
            code: 'PROVIDER_INIT_FAILED',
            message: `Failed to find ${className} in ${importPath}`,
          },
        };
      }

      const provider = new ProviderClass();
      const initResult = await provider.initialize();

      if (!initResult.ok) {
        return {
          ok: false,
          error: {
            code: 'PROVIDER_INIT_FAILED',
            message: `${providerName} initialization failed: ${initResult.error.message}`,
            cause: initResult.error.cause,
          },
        };
      }

      return { ok: true, value: provider };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'PROVIDER_INIT_FAILED',
          message: `Failed to load ${providerName} provider: ${
            error instanceof Error ? error.message : String(error)
          }`,
          cause: error instanceof Error ? error : undefined,
        },
      };
    }
  };
}

/**
 * Register all MVP providers
 *
 * Registers factory functions for each provider type.
 * Factories are lazy-loaded when providers are first requested.
 *
 * Registration happens at module load time to ensure providers
 * are available when hooks execute.
 *
 * This function is idempotent - calling it multiple times has no effect
 * after the first call.
 */
export function registerMVPProviders(): void {
  // Skip if already registered
  if (providersRegistered) {
    return;
  }

  providersRegistered = true;
  // Register all MVP providers using helper function
  globalProviderRegistry.registerProvider(
    'segment',
    'per-message',
    createProviderFactory(
      '../providers/segment/per-message',
      'PerMessageSegmentProvider',
      'per-message'
    )
  );

  globalProviderRegistry.registerProvider(
    'extract',
    'frontmatter-gen',
    createProviderFactory(
      '../providers/extract/frontmatter-gen',
      'FrontmatterGenProvider',
      'frontmatter-gen'
    )
  );

  globalProviderRegistry.registerProvider(
    'extract',
    'keyword-tagger',
    createProviderFactory(
      '../providers/extract/keyword-tagger',
      'KeywordTaggerProvider',
      'keyword-tagger'
    )
  );

  globalProviderRegistry.registerProvider(
    'summarize',
    'simple-extract',
    createProviderFactory(
      '../providers/summarize/simple-extract',
      'SimpleExtractProvider',
      'simple-extract'
    )
  );

  globalProviderRegistry.registerProvider(
    'storage',
    'file-backend',
    createProviderFactory(
      '../providers/storage/file-backend',
      'FileBackend',
      'file-backend'
    )
  );

  globalProviderRegistry.registerProvider(
    'search',
    'keyword-search',
    createProviderFactory(
      '../providers/search/keyword-search',
      'KeywordSearch',
      'keyword-search'
    )
  );

  globalProviderRegistry.registerProvider(
    'organize',
    'flat-by-date',
    createProviderFactory(
      '../providers/organize/flat-by-date',
      'FlatByDateOrganizeProvider',
      'flat-by-date'
    )
  );

  console.error('[Memory:Registry] Registered all MVP providers');
}

// Auto-register providers when this module is imported
registerMVPProviders();
