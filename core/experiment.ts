/**
 * Experiment variant selection and management (Story 5.4 Task 2)
 *
 * Provides deterministic hash-based variant assignment for A/B testing.
 * Ensures same request always gets same variant (consistent user experience).
 */

import type { MemoryConfig } from './config';

/**
 * Re-export ExperimentConfig for convenience
 */
export type { ExperimentConfig } from './config';
export type { MemoryConfig } from './config';

/**
 * Experiment error types
 */
export interface ExperimentError {
  /** Error code */
  code: 'EXPERIMENT_INVALID_CONFIG' | 'EXPERIMENT_INVALID_PROVIDER';

  /** Human-readable error message */
  message: string;

  /** Optional cause */
  cause?: Error;
}

/**
 * Result type for validation functions
 */
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Active experiment reference
 */
export interface ActiveExperiment {
  /** Experiment ID */
  id: string;

  /** Experiment configuration */
  config: import('./config').ExperimentConfig;
}

/**
 * Simple deterministic hash function
 *
 * Converts string to consistent 32-bit integer hash.
 * Used for consistent variant assignment (same input → same hash).
 *
 * @param str - String to hash (e.g., "experiment-id:request-id")
 * @returns 32-bit integer hash
 *
 * @example
 * ```typescript
 * const hash = hashCode('search-comparison:session-abc123');
 * // Always returns same number for same input
 * ```
 */
export function hashCode(str: string): number {
  let hash = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return hash;
}

/**
 * Select variant for a request using deterministic hash-based assignment
 *
 * Uses hash of experimentId + requestId to consistently assign variants.
 * Same requestId always gets same variant (important for user experience).
 *
 * @param experimentId - Experiment identifier
 * @param requestId - Request identifier (session ID, query hash, etc.)
 * @param config - Experiment configuration with variants and split
 * @returns Variant name assigned to this request
 *
 * @example Simple 50/50 split
 * ```typescript
 * const variant = selectVariant(
 *   'search-comparison',
 *   'session-abc123',
 *   {
 *     enabled: true,
 *     variants: { control: 'keyword', treatment: 'semantic' },
 *     splitPercent: 50
 *   }
 * );
 * // Returns 'control' or 'treatment' consistently for same requestId
 * ```
 *
 * @example Multi-variant split
 * ```typescript
 * const variant = selectVariant(
 *   'ranking-test',
 *   'query-xyz',
 *   {
 *     enabled: true,
 *     variants: {
 *       control: 'default',
 *       'treatment-a': 'boost-importance',
 *       'treatment-b': 'boost-recency'
 *     },
 *     splitPercent: { control: 60, 'treatment-a': 20, 'treatment-b': 20 }
 *   }
 * );
 * // Returns one of the 3 variants based on percentages
 * ```
 */
export function selectVariant(
  experimentId: string,
  requestId: string,
  config: import('./config').ExperimentConfig
): string {
  // Deterministic hash ensures same request always gets same variant
  const hashInput = `${experimentId}:${requestId}`;
  const hash = hashCode(hashInput);

  // Normalize to 0-99 range
  const normalized = Math.abs(hash) % 100;

  // Multi-variant split (object with per-variant percentages)
  if (typeof config.splitPercent === 'object') {
    let cumulative = 0;

    for (const [variant, percent] of Object.entries(config.splitPercent)) {
      cumulative += percent;

      if (normalized < cumulative) {
        return variant;
      }
    }

    // Fallback: if we somehow didn't match (shouldn't happen if percentages sum to 100)
    // Return last variant
    const variants = Object.keys(config.variants);
    return variants[variants.length - 1];
  }

  // Simple split (number representing first variant percentage)
  const threshold = config.splitPercent;
  const variants = Object.keys(config.variants);

  // First variant gets 'splitPercent' % of traffic, second gets remainder
  return normalized < threshold ? variants[0] : variants[1];
}

/**
 * Get active experiment for a provider type
 *
 * Searches for first enabled experiment that applies to the given provider type.
 * Returns null if no active experiments found.
 *
 * Note: This is a simple implementation that matches experiment ID to provider type.
 * Future versions could add explicit provider type tagging to experiments.
 *
 * @param config - Memory system configuration
 * @param providerType - Provider type to check ('search', 'ranking', etc.)
 * @returns Active experiment or null
 *
 * @example
 * ```typescript
 * const experiment = getActiveExperiment(config, 'search');
 *
 * if (experiment) {
 *   const variant = selectVariant(experiment.id, requestId, experiment.config);
 *   const providerName = experiment.config.variants[variant];
 *   // Use providerName for this request
 * }
 * ```
 */
export function getActiveExperiment(
  config: MemoryConfig,
  providerType: string
): ActiveExperiment | null {
  // No experiments configured
  if (!config.experiments || Object.keys(config.experiments).length === 0) {
    return null;
  }

  // Find first enabled experiment that matches provider type
  // Simple heuristic: experiment ID contains provider type name
  for (const [experimentId, expConfig] of Object.entries(config.experiments)) {
    if (expConfig.enabled && experimentId.includes(providerType)) {
      return {
        id: experimentId,
        config: expConfig,
      };
    }
  }

  // No matching active experiment
  return null;
}

/**
 * Validate experiment split percentages
 *
 * Ensures split percentages are valid:
 * - Simple split: must be between 0 and 100
 * - Multi-variant split: must sum to 100
 *
 * @param config - Experiment configuration to validate
 * @returns Result with success or validation error
 *
 * @example
 * ```typescript
 * const result = validateSplitPercentages(experimentConfig);
 *
 * if (!result.ok) {
 *   console.error(`[Memory:Experiment] ${result.error.message}`);
 *   return;
 * }
 * ```
 */
export function validateSplitPercentages(
  config: import('./config').ExperimentConfig
): Result<void, ExperimentError> {
  // Simple split (number)
  if (typeof config.splitPercent === 'number') {
    if (config.splitPercent < 0 || config.splitPercent > 100) {
      return {
        ok: false,
        error: {
          code: 'EXPERIMENT_INVALID_CONFIG',
          message: `splitPercent must be between 0 and 100 (got ${config.splitPercent})`,
        },
      };
    }

    return { ok: true, value: undefined };
  }

  // Multi-variant split (object)
  const total = Object.values(config.splitPercent).reduce(
    (sum, pct) => sum + pct,
    0
  );

  if (Math.abs(total - 100) > 0.01) {
    // Allow tiny floating point error
    return {
      ok: false,
      error: {
        code: 'EXPERIMENT_INVALID_CONFIG',
        message: `split percentages must sum to 100 (got ${total})`,
      },
    };
  }

  return { ok: true, value: undefined };
}
