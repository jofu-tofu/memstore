/**
 * Experiment lifecycle management (Story 5.4 Task 8)
 *
 * Manages experiment start/stop, historical data preservation,
 * and experiment listing.
 */

import { join } from 'path';
import { homedir } from 'os';
import { readdir, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import type { Result } from '../types/common';
import type { ExperimentConfig } from '../core/config';
import { getMemoryConfig, clearConfigCache } from '../core/config';

/**
 * Experiment lifecycle error
 */
export interface ExperimentLifecycleError {
  code:
    | 'EXPERIMENT_NOT_FOUND'
    | 'EXPERIMENT_ALREADY_RUNNING'
    | 'EXPERIMENT_NOT_RUNNING'
    | 'EXPERIMENT_LIST_FAILED';
  message: string;
  cause?: Error;
}

/**
 * Experiment summary
 */
export interface ExperimentSummary {
  /** Experiment identifier */
  id: string;

  /** Current status */
  status: 'running' | 'stopped' | 'never-started';

  /** Configuration */
  config: ExperimentConfig;

  /** Unix timestamp when started (if started) */
  startedAt?: number;

  /** Unix timestamp when stopped (if stopped) */
  stoppedAt?: number;

  /** Number of data points collected */
  dataPointCount: number;
}

/**
 * Get PAI directory path
 */
function getPaiDir(): string {
  return process.env.PAI_DIR || join(homedir(), 'pai');
}

/**
 * Get settings file path
 */
function getSettingsPath(): string {
  return join(getPaiDir(), '.claude', 'settings.json');
}

/**
 * Persist config update to settings.json
 *
 * Reads current settings, updates memory.experiments section, writes back.
 *
 * @param config - Updated memory config
 * @returns Success or error
 */
async function persistConfigUpdate(
  config: any
): Promise<Result<void, ExperimentLifecycleError>> {
  try {
    const settingsPath = getSettingsPath();
    const claudeDir = join(getPaiDir(), '.claude');

    // Ensure .claude directory exists
    const { mkdir } = await import('fs/promises');
    if (!existsSync(claudeDir)) {
      await mkdir(claudeDir, { recursive: true });
    }

    // Read current settings
    let settings: any = {};
    if (existsSync(settingsPath)) {
      const contents = await readFile(settingsPath, 'utf-8');
      settings = JSON.parse(contents);
    }

    // Update memory.experiments section
    if (!settings.memory) {
      settings.memory = {};
    }
    settings.memory.experiments = config.experiments;

    // Write back to disk
    await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

    // Debug logging
    if (process.env.DEBUG_EXPERIMENT_LIFECYCLE) {
      console.error(`[Lifecycle:Debug] Wrote settings to ${settingsPath}`);
      console.error(`[Lifecycle:Debug] Experiments:`, JSON.stringify(settings.memory.experiments));
    }

    // Clear config cache so next getMemoryConfig() reads updated settings
    clearConfigCache();

    return { ok: true, value: undefined };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'EXPERIMENT_NOT_FOUND',
        message: `Failed to persist config: ${
          error instanceof Error ? error.message : String(error)
        }`,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}

/**
 * Count data points in experiment file
 */
async function countDataPoints(experimentId: string): Promise<number> {
  const dataPath = join(
    getPaiDir(),
    'mem-store/metrics/experiments',
    `${experimentId}.jsonl`
  );

  if (!existsSync(dataPath)) {
    return 0;
  }

  try {
    const { readFile } = await import('fs/promises');
    const contents = await readFile(dataPath, 'utf-8');
    const lines = contents.trim().split('\n').filter(line => line.length > 0);
    return lines.length;
  } catch {
    return 0;
  }
}

/**
 * Start an experiment
 *
 * Marks experiment as started by setting startedAt timestamp.
 * Clears stoppedAt if experiment was previously stopped.
 *
 * @param experimentId - Experiment to start
 * @returns Success or error
 *
 * @example
 * ```typescript
 * const result = await startExperiment('search-comparison');
 *
 * if (!result.ok) {
 *   console.error(`Failed to start: ${result.error.message}`);
 * }
 * ```
 */
export async function startExperiment(
  experimentId: string
): Promise<Result<void, ExperimentLifecycleError>> {
  const configResult = await getMemoryConfig();
  if (!configResult.ok) {
    return {
      ok: false,
      error: {
        code: 'EXPERIMENT_NOT_FOUND',
        message: `Failed to load config: ${configResult.error.message}`,
      },
    };
  }
  const config = configResult.value;

  // Debug logging
  if (process.env.DEBUG_EXPERIMENT_LIFECYCLE) {
    console.error(`[Lifecycle:Debug] Looking for experiment '${experimentId}'`);
    console.error(`[Lifecycle:Debug] config.experiments:`, config.experiments);
  }

  // Check if experiment exists
  if (!config.experiments || !config.experiments[experimentId]) {
    return {
      ok: false,
      error: {
        code: 'EXPERIMENT_NOT_FOUND',
        message: `Experiment '${experimentId}' not found in configuration`,
      },
    };
  }

  const experiment = config.experiments[experimentId];

  // Check if already running
  if (experiment.enabled && experiment.startedAt && !experiment.stoppedAt) {
    return {
      ok: false,
      error: {
        code: 'EXPERIMENT_ALREADY_RUNNING',
        message: `Experiment '${experimentId}' is already running`,
      },
    };
  }

  // Update experiment: enable and set startedAt timestamp
  const updated = {
    ...experiment,
    enabled: true,
    startedAt: Date.now(),
    stoppedAt: undefined, // Clear stop time if resuming
  };

  config.experiments[experimentId] = updated;

  // Persist config update to settings.json
  const updateResult = await persistConfigUpdate(config);
  if (!updateResult.ok) {
    return updateResult;
  }

  return { ok: true, value: undefined };
}

/**
 * Stop an experiment
 *
 * Marks experiment as stopped by setting stoppedAt timestamp.
 * Disables experiment but preserves historical data.
 *
 * @param experimentId - Experiment to stop
 * @returns Success or error
 *
 * @example
 * ```typescript
 * const result = await stopExperiment('search-comparison');
 *
 * if (result.ok) {
 *   console.log('Experiment stopped. Data preserved for analysis.');
 * }
 * ```
 */
export async function stopExperiment(
  experimentId: string
): Promise<Result<void, ExperimentLifecycleError>> {
  const configResult = await getMemoryConfig();
  if (!configResult.ok) {
    return {
      ok: false,
      error: {
        code: 'EXPERIMENT_NOT_FOUND',
        message: `Failed to load config: ${configResult.error.message}`,
      },
    };
  }
  const config = configResult.value;

  // Check if experiment exists
  if (!config.experiments || !config.experiments[experimentId]) {
    return {
      ok: false,
      error: {
        code: 'EXPERIMENT_NOT_FOUND',
        message: `Experiment '${experimentId}' not found in configuration`,
      },
    };
  }

  const experiment = config.experiments[experimentId];

  // Check if already stopped
  if (!experiment.enabled || experiment.stoppedAt) {
    return {
      ok: false,
      error: {
        code: 'EXPERIMENT_NOT_RUNNING',
        message: `Experiment '${experimentId}' is not currently running`,
      },
    };
  }

  // Update experiment: disable and set stoppedAt timestamp
  const updated = {
    ...experiment,
    enabled: false,
    stoppedAt: Date.now(),
  };

  config.experiments[experimentId] = updated;

  // Persist config update to settings.json
  const updateResult = await persistConfigUpdate(config);
  if (!updateResult.ok) {
    return updateResult;
  }

  return { ok: true, value: undefined };
}

/**
 * List all experiments (active and historical)
 *
 * Returns summary for all experiments in configuration and data directory.
 * Includes experiments from config even if no data collected yet.
 * Includes experiments with data but not in config (orphaned).
 *
 * @returns List of experiment summaries or error
 *
 * @example
 * ```typescript
 * const result = await listExperiments();
 *
 * if (result.ok) {
 *   for (const exp of result.value) {
 *     console.log(`${exp.id}: ${exp.status} (${exp.dataPointCount} points)`);
 *   }
 * }
 * ```
 */
export async function listExperiments(): Promise<
  Result<ExperimentSummary[], ExperimentLifecycleError>
> {
  try {
    const configResult = await getMemoryConfig();
    if (!configResult.ok) {
      return {
        ok: false,
        error: {
          code: 'EXPERIMENT_LIST_FAILED',
          message: `Failed to load config: ${configResult.error.message}`,
        },
      };
    }
    const config = configResult.value;
    const experimentsFromConfig = Object.keys(config.experiments || {});

    // Find experiments with data files
    const experimentsDir = join(getPaiDir(), 'mem-store/metrics/experiments');
    let experimentsFromFiles: string[] = [];

    if (existsSync(experimentsDir)) {
      const files = await readdir(experimentsDir);
      experimentsFromFiles = files
        .filter(f => f.endsWith('.jsonl'))
        .map(f => f.replace('.jsonl', ''));
    }

    // Combine (unique set)
    const allExperimentIds = Array.from(
      new Set([...experimentsFromConfig, ...experimentsFromFiles])
    );

    // Build summaries
    const summaries: ExperimentSummary[] = [];

    for (const id of allExperimentIds) {
      const experimentConfig = config.experiments?.[id];
      const dataPointCount = await countDataPoints(id);

      let status: 'running' | 'stopped' | 'never-started';
      if (!experimentConfig) {
        // Orphaned data (no config)
        status = 'stopped';
      } else if (experimentConfig.enabled && experimentConfig.startedAt && !experimentConfig.stoppedAt) {
        status = 'running';
      } else if (experimentConfig.stoppedAt || !experimentConfig.enabled) {
        status = 'stopped';
      } else {
        status = 'never-started';
      }

      summaries.push({
        id,
        status,
        config: experimentConfig || {
          enabled: false,
          variants: {},
          splitPercent: 50,
        },
        startedAt: experimentConfig?.startedAt,
        stoppedAt: experimentConfig?.stoppedAt,
        dataPointCount,
      });
    }

    return { ok: true, value: summaries };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'EXPERIMENT_LIST_FAILED',
        message: `Failed to list experiments: ${
          error instanceof Error ? error.message : String(error)
        }`,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}

/**
 * Get experiment status
 *
 * Convenience function to check if experiment is running.
 *
 * @param experimentId - Experiment to check
 * @returns Status or error
 */
export async function getExperimentStatus(
  experimentId: string
): Promise<Result<'running' | 'stopped' | 'never-started', ExperimentLifecycleError>> {
  const listResult = await listExperiments();

  if (!listResult.ok) {
    return listResult;
  }

  const experiment = listResult.value.find(e => e.id === experimentId);

  if (!experiment) {
    return {
      ok: false,
      error: {
        code: 'EXPERIMENT_NOT_FOUND',
        message: `Experiment '${experimentId}' not found`,
      },
    };
  }

  return { ok: true, value: experiment.status };
}
