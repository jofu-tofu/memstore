/**
 * Retrieval logging for diagnostics and analysis.
 *
 * Logs all memory retrievals to append-only JSONL file.
 */

import { join } from 'path';
import { homedir } from 'os';
import { existsSync, appendFileSync, mkdirSync, statSync, renameSync, unlinkSync } from 'fs';
import { RankedResult } from '../../types/ranking';

export interface RetrievalLogEntry {
  timestamp: number;
  query: string;
  retrieved: string[];           // Segment IDs
  scores: number[];              // Relevance scores
  latencyMs: number;
  injectedTokens: number;
}

function getPaiDir(): string {
  return process.env.PAI_DIR || join(homedir(), 'pai');
}

const LOG_PATH = 'mem-store/metrics/retrieval-log.jsonl';
const MAX_LOG_SIZE_BYTES = 10 * 1024 * 1024;  // 10MB

/**
 * Log retrieval operation to append-only JSONL file.
 *
 * @param entry - Retrieval details to log
 */
export function logRetrieval(entry: RetrievalLogEntry): void {
  try {
    const paiDir = getPaiDir();
    const logPath = join(paiDir, LOG_PATH);
    const logDir = join(paiDir, 'mem-store/metrics');

    // Create log directory if needed
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    // Check log rotation
    if (existsSync(logPath)) {
      const stats = statSync(logPath);
      if (stats.size > MAX_LOG_SIZE_BYTES) {
        rotateLog(logPath);
      }
    }

    // Append entry as single JSON line
    const line = JSON.stringify(entry) + '\n';
    appendFileSync(logPath, line, 'utf-8');

  } catch (error) {
    console.error(
      `[Memory:RetrievalLogger] Failed to log retrieval: ${(error as Error).message}`
    );
    // Don't throw - logging failure shouldn't break retrieval
  }
}

/**
 * Rotate log file when it exceeds size limit.
 *
 * Renames current log to .1, .2, etc. and keeps last 5 rotations.
 */
function rotateLog(logPath: string): void {
  try {
    const MAX_ROTATIONS = 5;

    // Shift existing rotations
    for (let i = MAX_ROTATIONS - 1; i >= 1; i--) {
      const oldPath = `${logPath}.${i}`;
      const newPath = `${logPath}.${i + 1}`;

      if (existsSync(oldPath)) {
        if (i === MAX_ROTATIONS - 1) {
          // Delete oldest rotation
          unlinkSync(oldPath);
        } else {
          renameSync(oldPath, newPath);
        }
      }
    }

    // Rotate current log
    renameSync(logPath, `${logPath}.1`);

    console.error(`[Memory:RetrievalLogger] Rotated log file`);

  } catch (error) {
    console.error(
      `[Memory:RetrievalLogger] Log rotation failed: ${(error as Error).message}`
    );
  }
}

/**
 * Helper to create log entry from ranked results.
 *
 * @param query - User's search query
 * @param results - Ranked results that were retrieved
 * @param latencyMs - Total retrieval latency
 * @param injectedTokens - Estimated tokens injected
 * @returns Log entry ready for logging
 */
export function createLogEntry(
  query: string,
  results: RankedResult[],
  latencyMs: number,
  injectedTokens: number
): RetrievalLogEntry {
  return {
    timestamp: Date.now(),
    query: query.length > 200 ? query.slice(0, 197) + '...' : query,
    retrieved: results.map(r => r.segmentId),
    scores: results.map(r => Math.round(r.relevanceScore)),
    latencyMs,
    injectedTokens
  };
}
