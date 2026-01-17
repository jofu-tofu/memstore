/**
 * Experiment data logging (Story 5.4 Task 3)
 *
 * Logs experiment data points to JSONL files for analysis.
 * Uses fire-and-forget async append for performance.
 */

import { join } from 'path';
import { homedir } from 'os';
import { appendFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import type { Result } from '../../types/common';

/**
 * Experiment data point structure
 */
export interface ExperimentDataPoint {
  /** Experiment identifier */
  experimentId: string;

  /** Variant name assigned to this request */
  variant: string;

  /** Unix timestamp in milliseconds */
  timestamp: number;

  /** Provider execution time in milliseconds */
  latencyMs: number;

  /** Number of results returned */
  resultCount: number;

  /** Estimated token count of injected context */
  injectedTokens: number;

  /** Hash of query (for privacy - don't store full query) */
  queryHash: string;

  /** Whether provider succeeded */
  success: boolean;

  /** Error code if success=false */
  errorCode?: string;

  /** Optional additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Experiment logging error
 */
export interface ExperimentLogError {
  code: 'EXPERIMENT_LOG_FAILED';
  message: string;
  cause?: Error;
}

/**
 * Get PAI directory path
 */
function getPaiDir(): string {
  return process.env.PAI_DIR || join(homedir(), 'pai');
}

/**
 * Get experiments directory path
 *
 * @returns Path to experiments directory
 */
function getExperimentsDir(): string {
  return join(getPaiDir(), 'mem-store/metrics/experiments');
}

/**
 * Ensure experiments directory exists
 *
 * Creates directory if it doesn't exist.
 *
 * @returns Result indicating success or failure
 */
async function ensureExperimentDir(): Promise<Result<void, ExperimentLogError>> {
  try {
    const experimentsDir = getExperimentsDir();

    if (!existsSync(experimentsDir)) {
      await mkdir(experimentsDir, { recursive: true });
    }

    return { ok: true, value: undefined };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'EXPERIMENT_LOG_FAILED',
        message: `Failed to create experiments directory: ${
          error instanceof Error ? error.message : String(error)
        }`,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}

/**
 * Log experiment result data point
 *
 * Appends data point to experiment JSONL file.
 * Creates directory and file if they don't exist.
 * Uses fire-and-forget async append for performance.
 *
 * @param dataPoint - Experiment data to log
 * @returns Result indicating success or failure
 *
 * @example
 * ```typescript
 * const result = await logExperimentResult({
 *   experimentId: 'search-comparison',
 *   variant: 'control',
 *   timestamp: Date.now(),
 *   latencyMs: 180,
 *   resultCount: 3,
 *   injectedTokens: 920,
 *   queryHash: hashQuery(query),
 *   success: true
 * });
 *
 * if (!result.ok) {
 *   console.error(`[Memory:Experiment] Log failed: ${result.error.message}`);
 * }
 * ```
 */
export async function logExperimentResult(
  dataPoint: ExperimentDataPoint
): Promise<Result<void, ExperimentLogError>> {
  try {
    // Ensure experiments directory exists
    const dirResult = await ensureExperimentDir();
    if (!dirResult.ok) {
      return dirResult;
    }

    // Build file path: $PAI_DIR/mem-store/metrics/experiments/{experiment-id}.jsonl
    const logPath = join(
      getExperimentsDir(),
      `${dataPoint.experimentId}.jsonl`
    );

    // Serialize data point as JSON line
    const jsonLine = JSON.stringify(dataPoint) + '\n';

    // Append to file (creates if doesn't exist)
    await appendFile(logPath, jsonLine, 'utf-8');

    return { ok: true, value: undefined };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'EXPERIMENT_LOG_FAILED',
        message: `Failed to log experiment data: ${
          error instanceof Error ? error.message : String(error)
        }`,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}
