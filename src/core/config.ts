/**
 * Memory System Configuration
 *
 * Manages configuration loading from MemStore settings with:
 * - Type-safe configuration schema
 * - Default value merging
 * - Result-based error handling
 * - Configuration caching
 */

import { join } from 'path';
import { homedir } from 'os';
import type { Result } from '../types/common';

/**
 * Hook-specific configuration
 */
export interface HookConfig {
  /** Enable capture hook on session end */
  sessionEnd: boolean;

  /** Enable retrieval hook on user prompt submit */
  userPromptSubmit: boolean;

  /**
   * Enable session-start hook (FR43)
   *
   * RESERVED FOR FUTURE: This hook would fire on session start to check
   * for incomplete work from previous sessions. Implementation deferred
   * to future story. Default: false (optional feature).
   *
   * @see Story 3.3 - Schema implementation
   * @see FR43 (prd.md:501) - Full implementation spec
   */
  sessionStart: boolean;
}

/**
 * Provider selection configuration
 */
export interface ProviderConfig {
  /** Segmentation provider name */
  segment: string;

  /** Extraction provider names (multiple extractors can run) */
  extract: string[];

  /** Summarization provider name */
  summarize: string;

  /** Storage provider name */
  storage: string;

  /** Search provider name */
  search: string;

  /** Organization provider name */
  organize: string;
}

/**
 * Retention policy configuration
 */
export interface RetentionConfig {
  /** Maximum number of sessions to retain in short-term memory */
  shortTermMaxSessions: number;

  /** Maximum age in days for short-term memory */
  shortTermMaxAgeDays: number;

  /** Enable automatic consolidation to long-term memory */
  autoConsolidate: boolean;
}

/**
 * Performance tuning configuration
 */
export interface PerformanceConfig {
  /** Maximum time allowed for retrieval operations (ms) */
  maxRetrievalMs: number;

  /** Maximum tokens to inject into context */
  maxInjectionTokens: number;

  /** Maximum number of memory results to return */
  maxResultCount: number;
}

/**
 * Experiment configuration for A/B testing (Story 5.4)
 *
 * Enables running A/B tests comparing different provider implementations.
 * Traffic is deterministically split across variants based on request hash.
 *
 * @example Simple 50/50 split
 * ```typescript
 * {
 *   enabled: true,
 *   variants: {
 *     control: 'keyword-search',
 *     treatment: 'semantic-search'
 *   },
 *   splitPercent: 50
 * }
 * ```
 *
 * @example Multi-variant split
 * ```typescript
 * {
 *   enabled: true,
 *   variants: {
 *     control: 'default-ranking',
 *     'treatment-a': 'importance-boost',
 *     'treatment-b': 'recency-boost'
 *   },
 *   splitPercent: {
 *     control: 60,
 *     'treatment-a': 20,
 *     'treatment-b': 20
 *   }
 * }
 * ```
 */
export interface ExperimentConfig {
  /** Whether this experiment is currently active */
  enabled: boolean;

  /** Map of variant names to provider names */
  variants: Record<string, string>;

  /**
   * Traffic split configuration
   * - number: Simple split (e.g., 50 = 50% control, 50% treatment)
   * - object: Per-variant percentages (must sum to 100)
   */
  splitPercent: number | Record<string, number>;

  /** Unix timestamp when experiment was started (optional) */
  startedAt?: number;

  /** Unix timestamp when experiment was stopped (optional) */
  stoppedAt?: number;
}

/**
 * Performance defaults - aligned with NFR-P1 requirements
 */
const PERFORMANCE_DEFAULTS = {
  /** Target <1s for retrieval operations (NFR-P1) */
  MAX_RETRIEVAL_MS: 1000,
  /** Token budget for context injection */
  MAX_INJECTION_TOKENS: 2000,
  /** Limit memories injected to avoid context bloat */
  MAX_RESULT_COUNT: 10,
} as const;

/**
 * Complete memory system configuration
 */
export interface MemoryConfig {
  /** Master enable/disable switch for entire memory system */
  enabled: boolean;

  /** Enable verbose retrieval diagnostics (AC5: Story 4.6.1) */
  debug?: boolean;

  /** Hook enablement configuration */
  hooks: HookConfig;

  /** Provider selection configuration */
  providers: ProviderConfig;

  /** Retention policy configuration */
  retention: RetentionConfig;

  /** Performance tuning configuration */
  performance: PerformanceConfig;

  /** A/B testing experiments configuration (Story 5.4) */
  experiments?: Record<string, ExperimentConfig>;
}

/**
 * Configuration error types
 */
export interface ConfigError {
  /** Error code (namespaced) */
  code: 'CONFIG_READ_FAILED' | 'CONFIG_PARSE_FAILED' | 'CONFIG_INVALID';

  /** Human-readable error message */
  message: string;

  /** Optional original error */
  cause?: Error;
}

/**
 * Default configuration with MVP providers and sensible defaults
 */
const DEFAULT_CONFIG: MemoryConfig = {
  enabled: true,
  debug: false, // Disable verbose diagnostics by default (Story 4.6.1, AC5)
  hooks: {
    sessionEnd: true,
    userPromptSubmit: true,
    sessionStart: false, // Disabled by default - retrieval happens on prompt submit
  },
  providers: {
    segment: 'per-message',
    extract: ['frontmatter-gen', 'keyword-tagger'],
    summarize: 'simple-extract',
    storage: 'file-backend',
    search: 'keyword-search',
    organize: 'flat-by-date',
  },
  retention: {
    shortTermMaxSessions: 50,
    shortTermMaxAgeDays: 30,
    autoConsolidate: true, // Auto-consolidate by default (AC 3)
  },
  performance: {
    maxRetrievalMs: PERFORMANCE_DEFAULTS.MAX_RETRIEVAL_MS,
    maxInjectionTokens: PERFORMANCE_DEFAULTS.MAX_INJECTION_TOKENS,
    maxResultCount: PERFORMANCE_DEFAULTS.MAX_RESULT_COUNT,
  },
  experiments: {}, // No experiments by default (Story 5.4)
};

/**
 * Cached configuration instance
 */
let cachedConfig: MemoryConfig | null = null;

/**
 * Get MemStore directory path
 *
 * Respects MEMSTORE_DIR environment variable, falls back to ~/.memstore
 */
function getMemstoreDir(): string {
  return process.env.MEMSTORE_DIR || join(homedir(), '.memstore');
}

/**
 * Deep merge two objects
 *
 * Recursively merges source into target, preserving nested objects.
 * Arrays are replaced (not merged) because merging arrays is ambiguous:
 * should we concatenate, replace by index, or deduplicate? Replacement
 * gives predictable behavior and matches common config override patterns.
 *
 * @param target - Base object with defaults
 * @param source - Object with overrides
 * @returns Merged object
 */
function deepMerge<T extends Record<string, any>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue !== undefined &&
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      // Recursively merge nested objects
      result[key] = deepMerge(targetValue, sourceValue);
    } else if (sourceValue !== undefined) {
      // Replace primitive values and arrays
      result[key] = sourceValue;
    }
  }

  return result;
}

/**
 * Load configuration from MemStore settings.json
 *
 * Reads from $MEMSTORE_DIR/.claude/settings.json and extracts memory section.
 * Merges with defaults for any missing fields.
 *
 * @returns Result with loaded config or error
 */
/**
 * Validate configuration values
 *
 * Ensures numeric values are positive and types are correct.
 *
 * @param config - Configuration to validate
 * @returns Result with validated config or error
 */
function validateConfig(
  config: MemoryConfig
): Result<MemoryConfig, ConfigError> {
  // Validate debug field type if present (Story 4.6.1, AC5)
  if (config.debug !== undefined && typeof config.debug !== 'boolean') {
    return {
      ok: false,
      error: {
        code: 'CONFIG_INVALID',
        message: `Invalid debug value: ${config.debug} (expected boolean, got ${typeof config.debug})`,
      },
    };
  }

  // Validate retention numbers are positive
  if (
    config.retention.shortTermMaxSessions <= 0 ||
    config.retention.shortTermMaxAgeDays <= 0
  ) {
    return {
      ok: false,
      error: {
        code: 'CONFIG_INVALID',
        message: 'Retention values must be positive numbers',
      },
    };
  }

  // Validate performance numbers are positive
  if (
    config.performance.maxRetrievalMs <= 0 ||
    config.performance.maxInjectionTokens <= 0 ||
    config.performance.maxResultCount <= 0
  ) {
    return {
      ok: false,
      error: {
        code: 'CONFIG_INVALID',
        message: 'Performance values must be positive numbers',
      },
    };
  }

  // Validate provider extract is array
  if (!Array.isArray(config.providers.extract)) {
    return {
      ok: false,
      error: {
        code: 'CONFIG_INVALID',
        message: 'providers.extract must be an array',
      },
    };
  }

  // Validate experiments configuration (Story 5.4)
  if (config.experiments) {
    for (const [experimentId, expConfig] of Object.entries(config.experiments)) {
      // Validate at least 2 variants
      const variantCount = Object.keys(expConfig.variants).length;
      if (variantCount < 2) {
        return {
          ok: false,
          error: {
            code: 'CONFIG_INVALID',
            message: `Experiment '${experimentId}' must have at least 2 variants (found ${variantCount})`,
          },
        };
      }

      // Validate splitPercent
      if (typeof expConfig.splitPercent === 'number') {
        // Simple split: must be between 0 and 100
        if (expConfig.splitPercent < 0 || expConfig.splitPercent > 100) {
          return {
            ok: false,
            error: {
              code: 'CONFIG_INVALID',
              message: `Experiment '${experimentId}': splitPercent must be between 0 and 100 (got ${expConfig.splitPercent})`,
            },
          };
        }
      } else if (typeof expConfig.splitPercent === 'object') {
        // Multi-variant split: percentages must sum to 100
        const total = Object.values(expConfig.splitPercent).reduce(
          (sum, pct) => sum + pct,
          0
        );

        if (Math.abs(total - 100) > 0.01) {
          // Allow tiny floating point error
          return {
            ok: false,
            error: {
              code: 'CONFIG_INVALID',
              message: `Experiment '${experimentId}': split percentages must sum to 100 (got ${total})`,
            },
          };
        }
      }
    }
  }

  return { ok: true, value: config };
}

async function loadConfig(): Promise<Result<MemoryConfig, ConfigError>> {
  try {
    const memstoreDir = getMemstoreDir();
    const settingsPath = join(memstoreDir, '.claude', 'settings.json');

    // Try to read settings.json using async Bun API
    let settingsContent: string;
    try {
      const file = Bun.file(settingsPath);
      settingsContent = await file.text();
    } catch (readError) {
      // Settings file doesn't exist or can't be read - use defaults
      // This is expected behavior, log as info not error
      console.error(
        `[Memory:Config] No settings file at ${settingsPath}, using defaults`
      );
      return { ok: true, value: { ...DEFAULT_CONFIG } };
    }

    // Parse JSON
    let settings: any;
    try {
      settings = JSON.parse(settingsContent);
    } catch (parseError) {
      return {
        ok: false,
        error: {
          code: 'CONFIG_PARSE_FAILED',
          message: `Failed to parse settings.json: ${
            parseError instanceof Error ? parseError.message : String(parseError)
          }`,
          cause: parseError instanceof Error ? parseError : undefined,
        },
      };
    }

    // Extract memory section and merge with defaults
    const userConfig = settings.memory || {};
    const mergedConfig = deepMerge(DEFAULT_CONFIG, userConfig);

    // Validate merged configuration
    const validationResult = validateConfig(mergedConfig);
    if (!validationResult.ok) {
      return validationResult;
    }

    console.error(
      `[Memory:Config] Loaded configuration with ${Object.keys(mergedConfig.providers).length} providers`
    );

    return { ok: true, value: mergedConfig };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'CONFIG_READ_FAILED',
        message: `Failed to load configuration: ${
          error instanceof Error ? error.message : String(error)
        }`,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}

/**
 * Clear cached configuration to force reload on next getMemoryConfig() call
 *
 * Used when configuration changes at runtime or for testing.
 *
 * @example
 * ```typescript
 * // User updates settings.json
 * clearConfigCache();
 * const newConfig = await getMemoryConfig();
 * ```
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * Get debug mode setting from configuration
 *
 * Returns the current debug mode setting, defaulting to false if not configured.
 * Debug mode enables verbose retrieval diagnostics for troubleshooting.
 *
 * @returns true if debug mode is enabled, false otherwise
 *
 * @example
 * ```typescript
 * const debugEnabled = await getDebugMode();
 * if (debugEnabled) {
 *   console.error('[Memory:Retrieve:Debug] Detailed diagnostic info...');
 * }
 * ```
 */
export async function getDebugMode(): Promise<boolean> {
  const configResult = await getMemoryConfig();

  if (!configResult.ok) {
    // If config loading fails, default to false (don't enable debug)
    return false;
  }

  // Return debug setting, defaulting to false if undefined
  return configResult.value.debug ?? false;
}

/**
 * Get memory system configuration
 *
 * Loads configuration from MemStore settings on first call, then returns cached instance.
 * Merges user configuration with defaults for any missing fields.
 *
 * @param forceReload - If true, ignores cache and reloads from disk
 * @returns Result with configuration or error
 *
 * @example
 * ```typescript
 * const result = await getMemoryConfig();
 *
 * if (!result.ok) {
 *   console.error(`[Memory:Component] ${result.error.message}`);
 *   return;
 * }
 *
 * const config = result.value;
 * if (!config.enabled) {
 *   console.error('[Memory:Component] Memory system disabled');
 *   return;
 * }
 * ```
 */
export async function getMemoryConfig(
  forceReload = false
): Promise<Result<MemoryConfig, ConfigError>> {
  // Return cached config if available and not forcing reload
  if (cachedConfig !== null && !forceReload) {
    return { ok: true, value: cachedConfig };
  }

  // Load config from settings
  const result = await loadConfig();

  if (!result.ok) {
    return result;
  }

  // Cache successful load
  cachedConfig = result.value;

  return { ok: true, value: cachedConfig };
}
