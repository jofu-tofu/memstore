/**
 * Content loading utilities for memory retrieval.
 *
 * Loads full segment content from storage for injection.
 */

import { StorageProvider } from '../providers/storage/interface';
import { FileBackend } from '../providers/storage/file-backend';
import { Result } from '../types/common';
import { MemorySegment } from '../types/segment';

export interface ContentError {
  code: string;
  message: string;
  cause?: Error;
}

let storageProvider: StorageProvider | null = null;

async function getStorageProvider(): Promise<StorageProvider> {
  if (!storageProvider) {
    storageProvider = new FileBackend();
    const initResult = await storageProvider.initialize();
    if (!initResult.ok) {
      throw new Error(`Storage init failed: ${initResult.error.message}`);
    }
  }
  return storageProvider;
}

/**
 * Reset the cached storage provider.
 * Used for testing when MEMSTORE_DIR changes between tests.
 */
export function resetStorageProvider(): void {
  storageProvider = null;
}

/**
 * Load full content for a segment from storage.
 *
 * @param segmentId - Segment ID to load
 * @returns Result with MemorySegment or null if not found
 */
export async function loadSegmentContent(
  segmentId: string
): Promise<Result<MemorySegment | null, ContentError>> {
  try {
    const storage = await getStorageProvider();
    const result = await storage.retrieve(segmentId);

    if (!result.ok) {
      return {
        ok: false,
        error: {
          code: 'CONTENT_LOAD_FAILED',
          message: `Failed to load segment ${segmentId}: ${result.error.message}`,
          cause: result.error.cause
        }
      };
    }

    if (!result.value) {
      console.error(
        `[Memory:ContentLoader] Segment ${segmentId} not found, skipping`
      );
      return { ok: true, value: null };
    }

    return { ok: true, value: result.value };

  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'CONTENT_LOAD_ERROR',
        message: (error as Error).message,
        cause: error as Error
      }
    };
  }
}
