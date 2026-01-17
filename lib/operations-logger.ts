/**
 * Operations Logger - Raw operational event logging for data-driven optimization
 *
 * This module collects metadata about capture and retrieval operations,
 * logging raw events to JSONL for analysis and performance monitoring.
 *
 * ## Purpose
 *
 * - Collect operational metrics (timing, success rates, provider performance)
 * - Enable data-driven optimization decisions
 * - Foundation for Epic 6 continuous improvement features
 *
 * ## Data Location
 *
 * Logs written to: `$PAI_DIR/mem-store/metrics/operations.jsonl`
 *
 * ## Format
 *
 * JSONL (JSON Lines): One JSON object per line, append-only
 * - Memory efficient (streaming reads)
 * - Each line independently parseable
 * - No trailing commas
 *
 * ## Graceful Degradation
 *
 * - Logging failures NEVER crash the pipeline
 * - Errors logged to stderr but processing continues
 * - Returns Result type for explicit error handling
 *
 * @module operations-logger
 */

import { join, dirname } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import { appendFile } from 'node:fs/promises';
import type { Result } from '../types/common';

/**
 * Error type for operations logging failures.
 *
 * Returned when JSONL write operations fail due to permissions,
 * disk space, or other I/O errors.
 */
export interface OperationsLogError {
  code: 'OPERATIONS_LOG_WRITE_FAILED';
  message: string;
  cause?: Error;
}

/**
 * Per-provider timing information for capture pipeline.
 *
 * Story 6.4: Enables performance monitoring at provider level.
 */
export interface ProviderTiming {
  /** Provider name */
  provider: string;

  /** Latency in milliseconds */
  latencyMs: number;
}

/**
 * Metadata collected during session capture operations.
 *
 * Tracks processing performance, provider usage, and output metrics.
 *
 * Story 6.4: Extended with per-provider timing for performance monitoring.
 * Supports both old schema (providers + processingMs) and new schema
 * (providerTiming + totalProcessingMs) for backward compatibility.
 *
 * @example Old schema (Story 6.1):
 * ```typescript
 * const metadata: CaptureOperationMetadata = {
 *   sessionId: 'mem_123_abc',
 *   capturedAt: 1704912345000,
 *   segmentsCreated: 8,
 *   processingMs: 2100,
 *   providers: {
 *     segment: 'per-message',
 *     extract: ['frontmatter-gen', 'keyword-tagger'],
 *     summarize: 'simple-extract',
 *     storage: 'file-backend'
 *   }
 * };
 * ```
 *
 * @example New schema (Story 6.4):
 * ```typescript
 * const metadata: CaptureOperationMetadata = {
 *   sessionId: 'mem_123_abc',
 *   capturedAt: 1704912345000,
 *   segmentsCreated: 8,
 *   totalProcessingMs: 2100,
 *   providerTiming: {
 *     segment: { provider: 'per-message', latencyMs: 450 },
 *     extract: [
 *       { provider: 'frontmatter-gen', latencyMs: 320 },
 *       { provider: 'keyword-tagger', latencyMs: 180 }
 *     ],
 *     summarize: { provider: 'simple-extract', latencyMs: 280 },
 *     storage: { provider: 'file-backend', latencyMs: 870 }
 *   }
 * };
 * ```
 */
export interface CaptureOperationMetadata {
  /** Session identifier */
  sessionId: string;

  /** Unix timestamp (ms) when session was captured */
  capturedAt: number;

  /** Number of segments created from session */
  segmentsCreated: number;

  /** Processing time in milliseconds (OLD SCHEMA - Story 6.1) */
  processingMs?: number;

  /** Total processing time in milliseconds (NEW SCHEMA - Story 6.4) */
  totalProcessingMs?: number;

  /** Providers used during capture (OLD SCHEMA - Story 6.1) */
  providers?: {
    /** Segment provider name */
    segment: string;

    /** Extract provider names (can be multiple) */
    extract: string[];

    /** Summarize provider name */
    summarize: string;

    /** Storage provider name */
    storage: string;
  };

  /** Per-provider timing breakdown (NEW SCHEMA - Story 6.4) */
  providerTiming?: {
    /** Segment provider timing */
    segment: ProviderTiming;

    /** Extract providers timing (array - multiple providers) */
    extract: ProviderTiming[];

    /** Summarize provider timing */
    summarize: ProviderTiming;

    /** Storage provider timing */
    storage: ProviderTiming;
  };
}

/**
 * Layer timing information (for layers without provider variation).
 *
 * Story 6.4: Filter, rank, and inject layers use fixed implementations.
 */
export interface LayerTiming {
  /** Latency in milliseconds */
  latencyMs: number;
}

/**
 * Search layer timing information (includes provider name).
 *
 * Story 6.4: Search layer can use different providers.
 */
export interface SearchLayerTiming {
  /** Search provider name */
  provider: string;

  /** Latency in milliseconds */
  latencyMs: number;
}

/**
 * Metadata collected during retrieval operations.
 *
 * Tracks query characteristics, result metrics, and performance.
 *
 * Story 6.4: Extended with per-layer timing for performance monitoring.
 * Supports both old schema (latencyMs + provider) and new schema
 * (totalLatencyMs + layerTiming) for backward compatibility.
 *
 * @example Old schema (Story 6.1):
 * ```typescript
 * const metadata: RetrievalOperationMetadata = {
 *   timestamp: 1704912345000,
 *   queryLength: 45,
 *   termsExtracted: 4,
 *   candidatesFound: 23,
 *   resultsReturned: 5,
 *   tokensInjected: 920,
 *   latencyMs: 180,
 *   success: true,
 *   provider: 'keyword-search'
 * };
 * ```
 *
 * @example New schema (Story 6.4):
 * ```typescript
 * const metadata: RetrievalOperationMetadata = {
 *   timestamp: 1704912345000,
 *   queryLength: 45,
 *   termsExtracted: 4,
 *   candidatesFound: 23,
 *   resultsReturned: 5,
 *   tokensInjected: 920,
 *   totalLatencyMs: 280,
 *   success: true,
 *   layerTiming: {
 *     search: { provider: 'keyword-search', latencyMs: 180 },
 *     filter: { latencyMs: 35 },
 *     rank: { latencyMs: 40 },
 *     inject: { latencyMs: 25 }
 *   }
 * };
 * ```
 */
export interface RetrievalOperationMetadata {
  /** Unix timestamp (ms) when retrieval occurred */
  timestamp: number;

  /** Length of the query string in characters */
  queryLength: number;

  /** Number of terms extracted from query */
  termsExtracted: number;

  /** Number of candidate segments found */
  candidatesFound: number;

  /** Number of segments returned to user */
  resultsReturned: number;

  /** Total tokens injected into context */
  tokensInjected: number;

  /** Retrieval latency in milliseconds (OLD SCHEMA - Story 6.1) */
  latencyMs?: number;

  /** Total retrieval latency in milliseconds (NEW SCHEMA - Story 6.4) */
  totalLatencyMs?: number;

  /** Whether retrieval was successful (results returned) */
  success: boolean;

  /** Reason for failure (when success=false) */
  reason?: 'no_matches' | 'filtered_all';

  /** Search provider name used (OLD SCHEMA - Story 6.1) */
  provider?: string;

  /** Per-layer timing breakdown (NEW SCHEMA - Story 6.4) */
  layerTiming?: {
    /** Search layer timing (includes provider) */
    search: SearchLayerTiming;

    /** Filter layer timing */
    filter: LayerTiming;

    /** Rank layer timing */
    rank: LayerTiming;

    /** Inject layer timing */
    inject: LayerTiming;
  };
}

/**
 * Get the path to the operations log file.
 *
 * @returns Absolute path to operations.jsonl
 */
function getOperationsLogPath(): string {
  const paiDir = process.env.PAI_DIR || join(homedir(), 'pai');
  return join(paiDir, 'mem-store', 'metrics', 'operations.jsonl');
}

/**
 * Ensure the metrics directory exists.
 *
 * Creates the directory structure if it doesn't exist.
 *
 * @param logPath - Path to the operations log file
 */
function ensureMetricsDir(logPath: string): void {
  const dir = dirname(logPath);
  mkdirSync(dir, { recursive: true });
}

/**
 * Append a JSON object to the JSONL log file.
 *
 * Each entry is written as a single line with newline separator.
 * Uses fs/promises appendFile for efficient async I/O (Bun compatible).
 *
 * @param filePath - Path to JSONL file
 * @param data - Object to serialize and append
 * @returns Result indicating success or write error
 */
async function appendToJSONL(
  filePath: string,
  data: Record<string, unknown>
): Promise<Result<void, OperationsLogError>> {
  try {
    ensureMetricsDir(filePath);
    const line = JSON.stringify(data) + '\n';
    await appendFile(filePath, line, 'utf-8');
    return { ok: true, value: undefined };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'OPERATIONS_LOG_WRITE_FAILED',
        message: `Failed to write to operations log: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}

/**
 * Log capture operation metadata.
 *
 * Records session capture performance and provider usage to operations.jsonl.
 *
 * ## Usage
 *
 * Call this after segment creation completes in the capture pipeline:
 *
 * ```typescript
 * const metadata: CaptureOperationMetadata = {
 *   sessionId: session.id,
 *   capturedAt: session.timestamp,
 *   segmentsCreated: segments.length,
 *   processingMs: Date.now() - startTime,
 *   providers: {
 *     segment: config.providers.segment,
 *     extract: config.providers.extract,
 *     summarize: config.providers.summarize,
 *     storage: config.providers.storage
 *   }
 * };
 *
 * const result = await logCaptureOperation(metadata);
 * if (!result.ok) {
 *   console.error(`[Memory:Queue] Failed to log capture metadata: ${result.error.message}`);
 *   // Continue processing - don't fail on logging error
 * }
 * ```
 *
 * @param metadata - Capture operation metadata to log
 * @returns Result indicating success or write error
 */
export async function logCaptureOperation(
  metadata: CaptureOperationMetadata
): Promise<Result<void, OperationsLogError>> {
  const logPath = getOperationsLogPath();
  return appendToJSONL(logPath, metadata);
}

/**
 * Log retrieval operation metadata.
 *
 * Records retrieval performance, result metrics, and success/failure to operations.jsonl.
 *
 * ## Usage
 *
 * Call this after retrieval completes in the retrieval pipeline:
 *
 * ```typescript
 * const metadata: RetrievalOperationMetadata = {
 *   timestamp: Date.now(),
 *   queryLength: query.length,
 *   termsExtracted: extractedTerms.length,
 *   candidatesFound: candidates.length,
 *   resultsReturned: results.length,
 *   tokensInjected: calculateTokens(results),
 *   latencyMs: Date.now() - startTime,
 *   success: results.length > 0,
 *   reason: results.length === 0 ? (candidates.length === 0 ? 'no_matches' : 'filtered_all') : undefined,
 *   provider: config.providers.search
 * };
 *
 * const result = await logRetrievalOperation(metadata);
 * if (!result.ok) {
 *   console.error(`[Memory:Retrieval] Failed to log retrieval metadata: ${result.error.message}`);
 *   // Continue - don't fail on logging error
 * }
 * ```
 *
 * @param metadata - Retrieval operation metadata to log
 * @returns Result indicating success or write error
 */
export async function logRetrievalOperation(
  metadata: RetrievalOperationMetadata
): Promise<Result<void, OperationsLogError>> {
  const logPath = getOperationsLogPath();
  return appendToJSONL(logPath, metadata);
}
