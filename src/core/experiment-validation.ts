/**
 * Provider validation for experiments (Story 5.4 Task 7)
 *
 * Validates that providers used in experiments are properly registered
 * and compatible with the provider type.
 */

import { globalProviderRegistry } from './provider-registry';
import type { Result } from '../types/common';

/**
 * Experiment validation error
 */
export interface ExperimentValidationError {
  code: 'EXPERIMENT_INVALID_PROVIDER';
  message: string;
  cause?: Error;
}

/**
 * Validate experiment provider exists and is initialized
 *
 * Checks that:
 * 1. Provider is registered in the global registry
 * 2. Provider can be successfully retrieved
 * 3. Provider is of the expected type
 *
 * @param providerName - Name of the provider to validate
 * @param providerType - Expected provider type ('search', 'storage', etc.)
 * @returns Result with provider or validation error
 *
 * @example
 * ```typescript
 * const result = await validateExperimentProvider('semantic-search', 'search');
 *
 * if (!result.ok) {
 *   console.error(`[Memory:Experiment] ${result.error.message}`);
 *   // Fallback to default provider
 * }
 * ```
 */
export async function validateExperimentProvider(
  providerName: string,
  providerType: string
): Promise<Result<any, ExperimentValidationError>> {
  try {
    // Try to get provider from registry
    const providerResult = await globalProviderRegistry.getProvider(
      providerType,
      providerName
    );

    if (!providerResult.ok) {
      return {
        ok: false,
        error: {
          code: 'EXPERIMENT_INVALID_PROVIDER',
          message: `Provider '${providerName}' not found or invalid for type '${providerType}'`,
          cause: providerResult.error,
        },
      };
    }

    // Provider exists and is initialized
    return {
      ok: true,
      value: providerResult.value,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'EXPERIMENT_INVALID_PROVIDER',
        message: `Failed to validate provider '${providerName}': ${
          error instanceof Error ? error.message : String(error)
        }`,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}
