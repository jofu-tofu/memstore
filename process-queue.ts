import { promises as fs } from 'fs';
import { existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { acquireLock, releaseLock } from './lib/lock';
import { processPipeline, loadPipelineProviders, type ProcessingMetadata } from './core/pipeline';
import { getMemoryConfig } from './core/config';
import type { MemoryConfig } from './core/config';
import { RetentionPolicyChecker } from './lib/retention-policy';
import { updateProcessingStats } from './lib/logging/stats-manager';
import { logCaptureOperation, type CaptureOperationMetadata } from './lib/operations-logger';
import './core/register-providers'; // Register MVP providers

const MAX_ITEMS_PER_RUN = 10;        // Exit after N items
const MAX_RUNTIME_MS = 30_000;       // Hard timeout: 30 seconds
const STALE_LOCK_MS = 60_000;        // Consider lock stale after 60s

function getPaiDir(): string {
  return process.env.PAI_DIR || join(homedir(), 'pai');
}

interface QueueItem {
  path: string;
  filename: string;
  timestamp: number;
  data: {
    sessionId: string;
    transcript: string;
    capturedAt: number;
    metadata: any;
  };
}

async function getOldestQueueItem(queueDir: string): Promise<QueueItem | null> {
  try {
    // Read directory
    const files = readdirSync(queueDir);

    // Filter for JSON files (exclude lock and failed/ directory)
    const queueFiles = files.filter(f =>
      f.endsWith('.json') &&
      !f.startsWith('.')
    );

    if (queueFiles.length === 0) {
      return null;
    }

    // Sort by timestamp (oldest first)
    // Filename format: {timestamp}_{sessionId}.json
    const sorted = queueFiles.sort((a, b) => {
      const tsA = parseInt(a.split('_')[0]);
      const tsB = parseInt(b.split('_')[0]);
      return tsA - tsB;
    });

    const oldest = sorted[0];
    const filePath = join(queueDir, oldest);

    // Read and parse
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);

    return {
      path: filePath,
      filename: oldest,
      timestamp: parseInt(oldest.split('_')[0]),
      data
    };
  } catch (error) {
    console.error(`[Memory:Queue] Error reading queue: ${(error as Error).message}`);
    return null;
  }
}

async function moveToFailed(item: QueueItem, error?: Error): Promise<void> {
  try {
    const failedDir = join(dirname(item.path), 'failed');
    await fs.mkdir(failedDir, { recursive: true });

    const failedPath = join(failedDir, item.filename);

    // Read original content
    const content = await fs.readFile(item.path, 'utf-8');
    const data = JSON.parse(content);

    // Add error information
    const failedData = {
      ...data,
      failureInfo: {
        error: error ? error.message : 'Unknown error',
        stack: error ? error.stack : undefined,
        failedAt: Date.now(),
        processor: {
          pid: process.pid,
          hostname: require('os').hostname()
        }
      }
    };

    // Write to failed directory
    await fs.writeFile(failedPath, JSON.stringify(failedData, null, 2), 'utf-8');

    // Delete original
    await fs.unlink(item.path);

    console.error(`[Memory:Queue] Moved to failed: ${item.filename}`);
  } catch (e) {
    console.error(`[Memory:Queue] Error moving to failed: ${(e as Error).message}`);
    // Don't throw - we tried our best
  }
}

async function processItem(
  item: QueueItem,
  pipelineConfig: PipelineConfig
): Promise<{ success: boolean; segmentsCreated: number }> {
  const processingStartTime = Date.now();

  try {
    console.error(`[Memory:Queue] Processing ${item.filename} (session: ${item.data.sessionId})`);

    // Process through full pipeline
    const result = await processPipeline(item.data, pipelineConfig);

    if (!result.ok) {
      console.error(`[Memory:Queue] Pipeline failed: ${result.error.message}`);
      return { success: false, segmentsCreated: 0 };
    }

    const processingMs = Date.now() - processingStartTime;

    // === Story 6.1: Log capture operation metadata ===
    const captureMetadata: CaptureOperationMetadata = {
      sessionId: item.data.sessionId,
      capturedAt: item.data.capturedAt,
      segmentsCreated: result.value.segmentsCreated,
      processingMs,
      providers: {
        segment: pipelineConfig.segmentProvider.name,
        extract: pipelineConfig.extractProviders.map(p => p.name),
        summarize: pipelineConfig.summarizeProvider.name,
        storage: pipelineConfig.storageProvider.name,
      },
    };

    const logResult = await logCaptureOperation(captureMetadata);
    if (!logResult.ok) {
      console.error(`[Memory:Queue] Failed to log capture metadata: ${logResult.error.message}`);
      // Continue processing - don't fail on logging error
    }
    // === End Story 6.1 ===

    console.error(`[Memory:Queue] Successfully processed ${item.filename}`);
    return { success: true, segmentsCreated: result.value.segmentsCreated };
  } catch (error) {
    console.error(`[Memory:Queue] Processing failed: ${(error as Error).message}`);
    return { success: false, segmentsCreated: 0 };
  }
}

/**
 * Check retention policy and consolidate old sessions if needed
 *
 * @param config - Memory configuration
 */
async function checkRetentionPolicy(config: MemoryConfig): Promise<void> {
  try {
    const paiDir = getPaiDir();
    const checker = new RetentionPolicyChecker(paiDir);

    // Check if retention thresholds are exceeded
    const result = await checker.checkRetentionThresholds(config.retention);

    if (result.candidates.length === 0) {
      return; // No sessions to consolidate
    }

    // Log threshold exceeded
    console.error(
      `[Memory:Lifecycle] Retention threshold exceeded: ${result.candidates.length} sessions to consolidate`
    );

    // If autoConsolidate disabled, just warn
    if (!config.retention.autoConsolidate) {
      console.error(
        '[Memory:Lifecycle] Retention threshold exceeded, manual consolidation recommended'
      );
      return;
    }

    // Auto-consolidate
    const sessionIds = result.candidates.map(c => c.sessionId);
    await checker.markAsArchived(sessionIds);

    console.error(
      `[Memory:Lifecycle] Auto-consolidated ${sessionIds.length} sessions`
    );
  } catch (error) {
    console.error(`[Memory:Lifecycle] Retention check failed: ${(error as Error).message}`);
    // Don't throw - graceful degradation
  }
}

async function main() {
  const startTime = Date.now();
  const lockFile = join(getPaiDir(), 'mem-store', 'queue', '.processor.lock');
  let totalSegmentsCreated = 0;
  let failedCount = 0;
  let initialQueueDepth = 0;

  try {
    // 1. Acquire lock (or exit if locked and not stale)
    const lockResult = await acquireLock(lockFile, STALE_LOCK_MS);

    if (!lockResult.ok) {
      console.error(`[Memory:Queue] Lock error: ${lockResult.error.message}`);
      process.exit(0);
    }

    if (!lockResult.value) {
      console.error('[Memory:Queue] Lock held by another process, exiting');
      process.exit(0);
    }

    console.error('[Memory:Queue] Lock acquired, starting processing');

    // 2. Set hard timeout - force exit no matter what
    const timeout = setTimeout(() => {
      console.error('[Memory:Queue] Hard timeout reached, forcing exit');
      releaseLock(lockFile);
      process.exit(1);
    }, MAX_RUNTIME_MS);

    try {
      // 3. Load configuration
      const configResult = await getMemoryConfig();
      if (!configResult.ok) {
        console.error(
          `[Memory:Queue] Failed to load config: ${configResult.error.message}`
        );
        process.exit(1);
      }

      const config = configResult.value;

      // 4. Load pipeline providers based on configuration
      console.error('[Memory:Queue] Loading pipeline providers from configuration');
      const pipelineResult = await loadPipelineProviders(config);

      if (!pipelineResult.ok) {
        console.error(
          `[Memory:Queue] Failed to load pipeline providers: ${pipelineResult.error.message}`
        );
        process.exit(1);
      }

      const pipelineConfig = pipelineResult.value;
      console.error('[Memory:Queue] All providers loaded successfully');

      // 4. Measure queue depth before processing (Story 4.3)
      const queueDir = join(getPaiDir(), 'mem-store', 'queue');
      const queueFiles = readdirSync(queueDir).filter(f =>
        f.endsWith('.json') && !f.startsWith('.')
      );
      initialQueueDepth = queueFiles.length;
      console.error(`[Memory:Queue] Initial queue depth: ${initialQueueDepth} items`);

      // 5. Process up to N items
      let processed = 0;

      while (processed < MAX_ITEMS_PER_RUN) {
        const item = await getOldestQueueItem(queueDir);
        if (!item) {
          console.error('[Memory:Queue] Queue empty, exiting');
          break;  // Queue empty
        }

        const result = await processItem(item, pipelineConfig);

        if (result.success) {
          totalSegmentsCreated += result.segmentsCreated;
          await fs.unlink(item.path);
          console.error(`[Memory:Queue] Processed and deleted: ${item.filename}`);
        } else {
          failedCount++;
          await moveToFailed(item);
          console.error(`[Memory:Queue] Failed and moved to failed/: ${item.filename}`);
        }

        processed++;
      }

      // 6. Check retention policy after processing batch
      await checkRetentionPolicy(config);

      // 7. Shutdown providers
      console.error('[Memory:Queue] Shutting down pipeline providers');
      await Promise.all([
        pipelineConfig.segmentProvider.shutdown(),
        ...pipelineConfig.extractProviders.map(p => p.shutdown()),
        pipelineConfig.summarizeProvider.shutdown(),
        pipelineConfig.organizeProvider.shutdown(),
        pipelineConfig.storageProvider.shutdown()
      ]);

      const elapsed = Date.now() - startTime;
      console.error(`[Memory:Queue] Completed ${processed} items in ${elapsed}ms`);
    } finally {
      clearTimeout(timeout);
      await releaseLock(lockFile);
      console.error('[Memory:Queue] Lock released');

      // === Story 4.3: Performance Logging ===
      // Update processing stats (fire-and-forget)
      try {
        const processingMs = Date.now() - startTime;
        // Final queue depth after processing
        const queueDir = join(getPaiDir(), 'mem-store', 'queue');
        const finalQueueFiles = existsSync(queueDir)
          ? readdirSync(queueDir).filter(f => f.endsWith('.json') && !f.startsWith('.'))
          : [];
        const finalQueueDepth = finalQueueFiles.length;

        updateProcessingStats(
          totalSegmentsCreated,
          processingMs,
          finalQueueDepth,
          failedCount
        );
      } catch (statsError) {
        console.error(`[Memory:Queue] Stats update failed: ${statsError instanceof Error ? statsError.message : String(statsError)}`);
      }
      // === End Story 4.3 ===
    }

    process.exit(0);
  } catch (error) {
    console.error(`[Memory:Queue] Fatal error: ${(error as Error).message}`);
    // Try to release lock even on fatal error
    try {
      await releaseLock(lockFile);
    } catch (e) {
      // Ignore cleanup errors
    }
    process.exit(1);
  }
}

main();
