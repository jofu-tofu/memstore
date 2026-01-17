import { promises as fs } from 'fs';
import { join } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';
import type { SegmentProvider } from '../providers/segment/interface';
import type { ExtractProvider } from '../providers/extract/interface';
import type { SummarizeProvider } from '../providers/summarize/interface';
import type { OrganizeProvider } from '../providers/organize/interface';
import type { StorageProvider } from '../providers/storage/interface';
import type { MemorySegment } from '../types/segment';
import type { Result } from '../types/result';
import type { ProviderError } from '../types/provider';
import { globalProviderRegistry } from './provider-registry';
import { getMemoryConfig, MemoryConfig } from './config';
import { logCaptureOperation, type CaptureOperationMetadata, type ProviderTiming } from '../lib/operations-logger';

/**
 * PipelineError - Errors during pipeline execution
 */
export interface PipelineError extends ProviderError {
  code:
    | 'PIPELINE_SEGMENT_FAILED'
    | 'PIPELINE_ORGANIZE_FAILED'
    | 'PIPELINE_STORAGE_FAILED'
    | 'PIPELINE_UNEXPECTED_ERROR';
}

/**
 * ProcessingMetadata - Metadata about pipeline execution (Story 4.3)
 */
export interface ProcessingMetadata {
  segmentsCreated: number;
}

/**
 * PipelineConfig - Provider configuration for pipeline
 */
export interface PipelineConfig {
  segmentProvider: SegmentProvider;
  extractProviders: ExtractProvider[];
  summarizeProvider: SummarizeProvider;
  organizeProvider: OrganizeProvider;
  storageProvider: StorageProvider;
}

/**
 * QueueItem - Structure of queue items from process-queue.ts
 */
export interface QueueItem {
  sessionId: string;
  transcript: string;
  capturedAt: number;
  metadata: any;
}

/**
 * SessionRegistryEntry - Entry in session-registry.json
 */
interface SessionRegistryEntry {
  sessionId: string;
  segmentCount: number;
  capturedAt: number;
  tags: string[];
}

/**
 * Get PAI directory path
 */
function getPaiDir(): string {
  return process.env.PAI_DIR || join(homedir(), 'pai');
}

/**
 * MVP default providers (fallback values)
 */
const MVP_DEFAULTS = {
  segment: 'per-message',
  extract: ['frontmatter-gen', 'keyword-tagger'],
  summarize: 'simple-extract',
  storage: 'file-backend',
  search: 'keyword-search',
  organize: 'flat-by-date',
} as const;

/**
 * Load provider with fallback to MVP default
 *
 * @param type - Provider type
 * @param name - Provider name from config
 * @param defaultName - MVP default provider name
 * @returns Result with provider instance or error
 */
async function loadProviderWithFallback<T>(
  type: string,
  name: string,
  defaultName: string
): Promise<Result<T, PipelineError>> {
  // Try to load configured provider
  const providerResult = await globalProviderRegistry.getProvider<T>(
    type as any,
    name
  );

  if (!providerResult.ok) {
    console.error(
      `[Memory:Config] Provider '${name}' not found, using default`
    );

    // Fallback to MVP default
    const fallbackResult = await globalProviderRegistry.getProvider<T>(
      type as any,
      defaultName
    );

    if (!fallbackResult.ok) {
      return {
        ok: false,
        error: {
          code: 'PIPELINE_SEGMENT_FAILED',
          message: `Fatal: Default ${type} provider '${defaultName}' not registered`,
        },
      };
    }

    console.error(
      `[Memory:Pipeline] Using ${type} provider: ${fallbackResult.value.name}`
    );
    return { ok: true, value: fallbackResult.value };
  }

  console.error(
    `[Memory:Pipeline] Using ${type} provider: ${providerResult.value.name}`
  );
  return { ok: true, value: providerResult.value };
}

/**
 * Load all pipeline providers based on configuration
 *
 * Loads providers with fallback to MVP defaults if configured provider not found.
 * Handles extract providers as array (can run multiple in sequence).
 *
 * @param config - Memory system configuration
 * @returns Result with pipeline config or error
 */
export async function loadPipelineProviders(
  config: MemoryConfig
): Promise<Result<PipelineConfig, PipelineError>> {
  try {
    // Load segment provider
    const segmentResult = await loadProviderWithFallback<SegmentProvider>(
      'segment',
      config.providers.segment,
      MVP_DEFAULTS.segment
    );
    if (!segmentResult.ok) {
      return segmentResult;
    }

    // Load storage provider
    const storageResult = await loadProviderWithFallback<StorageProvider>(
      'storage',
      config.providers.storage,
      MVP_DEFAULTS.storage
    );
    if (!storageResult.ok) {
      return storageResult;
    }

    // Load organize provider
    const organizeResult = await loadProviderWithFallback<OrganizeProvider>(
      'organize',
      config.providers.organize,
      MVP_DEFAULTS.organize
    );
    if (!organizeResult.ok) {
      return organizeResult;
    }

    // Load summarize provider
    const summarizeResult = await loadProviderWithFallback<SummarizeProvider>(
      'summarize',
      config.providers.summarize,
      MVP_DEFAULTS.summarize
    );
    if (!summarizeResult.ok) {
      return summarizeResult;
    }

    // Load extract providers (array - run in sequence)
    const extractProviders: ExtractProvider[] = [];
    for (const extractName of config.providers.extract) {
      const extractResult = await globalProviderRegistry.getProvider<ExtractProvider>(
        'extract',
        extractName
      );

      if (!extractResult.ok) {
        console.error(
          `[Memory:Pipeline] Extract provider '${extractName}' not found, skipping`
        );
        continue; // Skip missing extractors, don't fail entire pipeline
      }

      console.error(
        `[Memory:Pipeline] Using extract provider: ${extractResult.value.name}`
      );
      extractProviders.push(extractResult.value);
    }

    // Ensure at least one extract provider loaded
    if (extractProviders.length === 0) {
      console.error(
        `[Memory:Pipeline] No extract providers loaded, falling back to MVP defaults`
      );

      // Load MVP default extractors
      for (const defaultExtractName of MVP_DEFAULTS.extract) {
        const extractResult = await globalProviderRegistry.getProvider<ExtractProvider>(
          'extract',
          defaultExtractName
        );

        if (extractResult.ok) {
          extractProviders.push(extractResult.value);
        }
      }

      if (extractProviders.length === 0) {
        return {
          ok: false,
          error: {
            code: 'PIPELINE_SEGMENT_FAILED',
            message: 'Fatal: No extract providers available (not even defaults)',
          },
        };
      }
    }

    return {
      ok: true,
      value: {
        segmentProvider: segmentResult.value,
        extractProviders,
        summarizeProvider: summarizeResult.value,
        organizeProvider: organizeResult.value,
        storageProvider: storageResult.value,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'PIPELINE_UNEXPECTED_ERROR',
        message: `Failed to load pipeline providers: ${
          error instanceof Error ? error.message : String(error)
        }`,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}

/**
 * Update session registry with processed session metadata
 */
async function updateSessionRegistry(
  sessionId: string,
  segments: MemorySegment[],
  capturedAt: number
): Promise<void> {
  const paiDir = getPaiDir();
  const registryPath = join(paiDir, 'mem-store', 'structured', 'session-registry.json');

  try {
    // Load existing registry
    let registry: Record<string, SessionRegistryEntry> = {};
    if (existsSync(registryPath)) {
      const content = await fs.readFile(registryPath, 'utf-8');
      registry = JSON.parse(content);
    }

    // Aggregate all tags from segments
    const allTags = new Set<string>();
    segments.forEach(seg => seg.tags.forEach(tag => allTags.add(tag)));

    // Add/update session entry
    registry[sessionId] = {
      sessionId,
      segmentCount: segments.length,
      capturedAt,
      tags: Array.from(allTags)
    };

    // Ensure directory exists
    const registryDir = join(paiDir, 'mem-store', 'structured');
    await fs.mkdir(registryDir, { recursive: true });

    // Write updated registry
    await fs.writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf-8');

    console.error(`[Memory:Pipeline] Updated session-registry.json for session ${sessionId}`);
  } catch (error) {
    console.error(`[Memory:Pipeline] Failed to update session-registry: ${(error as Error).message}`);
    // Don't throw - registry update failure shouldn't fail entire pipeline
  }
}

/**
 * Process a queue item through the complete pipeline
 *
 * Pipeline stages:
 * 1. Segment: transcript → segments
 * 2. Extract: apply all extract providers (frontmatter, keywords, etc.)
 * 3. Summarize: generate summaries and tags
 * 4. Organize: determine storage path for each segment
 * 5. Storage: persist segments to disk
 * 6. Registry: update session registry
 *
 * Story 6.4: Now captures per-provider timing for performance monitoring.
 *
 * @param item - Queue item to process
 * @param config - Pipeline provider configuration
 * @returns Result indicating success or failure
 */
export async function processPipeline(
  item: QueueItem,
  config: PipelineConfig
): Promise<Result<ProcessingMetadata, PipelineError>> {
  const pipelineStartTime = Date.now();

  try {
    // Initialize provider timing tracking (Story 6.4)
    const extractTimings: ProviderTiming[] = [];

    // 1. Segment: transcript → segments
    const segmentStart = Date.now();
    const segmentResult = await config.segmentProvider.segment(item.transcript, item.sessionId);
    const segmentLatency = Date.now() - segmentStart;

    if (!segmentResult.ok) {
      return {
        ok: false,
        error: {
          code: 'PIPELINE_SEGMENT_FAILED',
          message: segmentResult.error.message,
          cause: segmentResult.error.cause
        }
      };
    }

    let segments = segmentResult.value;
    console.error(`[Memory:Pipeline] Segmented into ${segments.length} segments`);

    // If no segments (empty transcript), still succeed but skip remaining stages
    if (segments.length === 0) {
      console.error(`[Memory:Pipeline] No segments created from empty transcript - pipeline complete`);

      // Log capture operation even for empty sessions (Story 6.4)
      const totalProcessingMs = Date.now() - pipelineStartTime;
      const captureMetadata: CaptureOperationMetadata = {
        sessionId: item.sessionId,
        capturedAt: item.capturedAt,
        segmentsCreated: 0,
        totalProcessingMs,
        providerTiming: {
          segment: { provider: config.segmentProvider.name, latencyMs: segmentLatency },
          extract: [],
          summarize: { provider: config.summarizeProvider.name, latencyMs: 0 },
          storage: { provider: config.storageProvider.name, latencyMs: 0 },
        },
      };

      const logResult = await logCaptureOperation(captureMetadata);
      if (!logResult.ok) {
        console.error(`[Memory:Pipeline] Failed to log capture metadata: ${logResult.error.message}`);
        // Continue - don't fail pipeline on logging error
      }

      return { ok: true, value: { segmentsCreated: 0 } };
    }

    // 2. Extract: apply all extract providers (frontmatter, keywords, etc.)
    for (const extractProvider of config.extractProviders) {
      const extractStart = Date.now();
      const enrichedSegments: MemorySegment[] = [];

      for (const segment of segments) {
        const extractResult = await extractProvider.extract(segment);
        if (!extractResult.ok) {
          console.error(
            `[Memory:Pipeline] Extract failed for segment ${segment.id}: ${extractResult.error.message}`
          );
          enrichedSegments.push(segment); // Continue with unenriched segment
        } else {
          enrichedSegments.push(extractResult.value);
        }
      }

      const extractLatency = Date.now() - extractStart;
      extractTimings.push({
        provider: extractProvider.name,
        latencyMs: extractLatency,
      });

      segments = enrichedSegments;
    }

    console.error(`[Memory:Pipeline] Extracted metadata for ${segments.length} segments`);

    // 3. Summarize: apply summarization
    const summarizeStart = Date.now();
    const summarizedSegments: MemorySegment[] = [];

    for (const segment of segments) {
      const summarizeResult = await config.summarizeProvider.summarize(segment);
      if (!summarizeResult.ok) {
        console.error(
          `[Memory:Pipeline] Summarize failed for segment ${segment.id}: ${summarizeResult.error.message}`
        );
        summarizedSegments.push(segment); // Continue without summary
      } else {
        summarizedSegments.push(summarizeResult.value);
      }
    }

    const summarizeLatency = Date.now() - summarizeStart;
    segments = summarizedSegments;

    console.error(`[Memory:Pipeline] Summarized ${segments.length} segments`);

    // 4. Organize: determine storage path for each segment
    const organizedSegments: Array<{ segment: MemorySegment; path: string }> = [];
    for (const segment of segments) {
      const organizeResult = await config.organizeProvider.organize(segment);
      if (!organizeResult.ok) {
        return {
          ok: false,
          error: {
            code: 'PIPELINE_ORGANIZE_FAILED',
            message: organizeResult.error.message,
            cause: organizeResult.error.cause
          }
        };
      }
      organizedSegments.push({ segment, path: organizeResult.value });
    }

    // 5. Storage: persist segments
    const storageStart = Date.now();

    for (const { segment } of organizedSegments) {
      const storeResult = await config.storageProvider.store(segment);
      if (!storeResult.ok) {
        console.error(
          `[Memory:Pipeline] Storage failed for segment ${segment.id}: ${storeResult.error.message}`
        );
        // Continue storing other segments
      }
    }

    const storageLatency = Date.now() - storageStart;

    console.error(`[Memory:Pipeline] Stored ${segments.length} segments`);

    // 6. Update session-registry
    await updateSessionRegistry(item.sessionId, segments, item.capturedAt);

    console.error(`[Memory:Pipeline] Pipeline complete for session ${item.sessionId}`);

    // === Story 6.4: Log capture operation with per-provider timing ===
    const totalProcessingMs = Date.now() - pipelineStartTime;

    const captureMetadata: CaptureOperationMetadata = {
      sessionId: item.sessionId,
      capturedAt: item.capturedAt,
      segmentsCreated: segments.length,
      totalProcessingMs,
      providerTiming: {
        segment: { provider: config.segmentProvider.name, latencyMs: segmentLatency },
        extract: extractTimings,
        summarize: { provider: config.summarizeProvider.name, latencyMs: summarizeLatency },
        storage: { provider: config.storageProvider.name, latencyMs: storageLatency },
      },
    };

    const logResult = await logCaptureOperation(captureMetadata);
    if (!logResult.ok) {
      console.error(`[Memory:Pipeline] Failed to log capture metadata: ${logResult.error.message}`);
      // Continue - don't fail pipeline on logging error
    }
    // === End Story 6.4 ===

    return { ok: true, value: { segmentsCreated: segments.length } };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'PIPELINE_UNEXPECTED_ERROR',
        message: (error as Error).message,
        cause: error as Error
      }
    };
  }
}
