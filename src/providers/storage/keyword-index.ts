/**
 * Keyword Index Manager
 * Maintains an inverted index mapping keywords to segment IDs for fast lookup
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';

/**
 * Inverted index structure: { keyword: [segmentIds] }
 */
type InvertedIndex = Record<string, string[]>;

export class KeywordIndexManager {
  private indexPath: string;
  private index: InvertedIndex | null = null;

  constructor(memstoreDir?: string) {
    const basePath = memstoreDir || process.env.MEMSTORE_DIR || join(homedir(), '.memstore');
    this.indexPath = join(basePath, 'mem-store', 'indexes', 'keyword', 'index.json');
  }

  /**
   * Initialize the index manager and load existing index
   */
  async initialize(): Promise<void> {
    // Ensure directory exists
    const indexDir = join(this.indexPath, '..');
    if (!existsSync(indexDir)) {
      await fs.mkdir(indexDir, { recursive: true });
    }

    // Load existing index
    await this.loadIndex();
  }

  /**
   * Add a segment to the index for given tags
   *
   * @param segmentId - ID of the segment
   * @param tags - Tags to index the segment under
   */
  async addToIndex(segmentId: string, tags: string[]): Promise<void> {
    await this.loadIndex();

    for (const tag of tags) {
      if (!tag || tag.trim().length === 0) continue;

      const normalizedTag = tag.trim();

      // Initialize array if tag doesn't exist
      if (!this.index![normalizedTag]) {
        this.index![normalizedTag] = [];
      }

      // Prevent duplicates
      if (!this.index![normalizedTag].includes(segmentId)) {
        this.index![normalizedTag].push(segmentId);
      }
    }

    await this.saveIndex();
    console.error(`[Memory:KeywordIndex] Added segment ${segmentId} to index for ${tags.length} tags`);
  }

  /**
   * Remove a segment from the index for given tags
   *
   * @param segmentId - ID of the segment
   * @param tags - Tags to remove the segment from
   */
  async removeFromIndex(segmentId: string, tags: string[]): Promise<void> {
    await this.loadIndex();

    for (const tag of tags) {
      if (!tag || tag.trim().length === 0) continue;

      const normalizedTag = tag.trim();

      if (this.index![normalizedTag]) {
        // Remove segment ID from array
        this.index![normalizedTag] = this.index![normalizedTag].filter(id => id !== segmentId);

        // Remove empty arrays
        if (this.index![normalizedTag].length === 0) {
          delete this.index![normalizedTag];
        }
      }
    }

    await this.saveIndex();
    console.error(`[Memory:KeywordIndex] Removed segment ${segmentId} from index`);
  }

  /**
   * Load index from disk (or create empty if doesn't exist)
   */
  private async loadIndex(): Promise<void> {
    try {
      if (existsSync(this.indexPath)) {
        const content = await fs.readFile(this.indexPath, 'utf-8');
        this.index = JSON.parse(content);
      } else {
        this.index = {};
      }
    } catch (error) {
      console.error(`[Memory:KeywordIndex] Failed to load index, creating new: ${(error as Error).message}`);
      this.index = {};
    }
  }

  /**
   * Save index to disk using atomic write pattern
   * NEVER throws - logs error and continues (Story 3.6)
   */
  private async saveIndex(): Promise<void> {
    try {
      // Ensure directory exists before writing (fix for ENOENT errors)
      const indexDir = join(this.indexPath, '..');
      if (!existsSync(indexDir)) {
        await fs.mkdir(indexDir, { recursive: true });
      }

      // Atomic write: write to temp file, then rename
      const tempPath = `${this.indexPath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(this.index, null, 2), 'utf-8');
      await fs.rename(tempPath, this.indexPath);
    } catch (error) {
      console.error(`[Memory:KeywordIndex] Failed to save index: ${(error as Error).message}`);
      // Log error but don't throw - graceful degradation (Story 3.6)
      // Index updates will be lost but system continues
    }
  }

  /**
   * Get a copy of the current index
   *
   * @returns Copy of the inverted index
   */
  async getIndex(): Promise<InvertedIndex> {
    await this.loadIndex();
    return { ...this.index! };  // Return copy to prevent external mutations
  }
}
