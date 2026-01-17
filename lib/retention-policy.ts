/**
 * Retention Policy Checker
 *
 * Utilities for checking retention thresholds and identifying sessions
 * that are candidates for archival.
 *
 * NOTE: This module only CHECKS and TRACKS retention metadata.
 * Actual consolidation/deletion logic is deferred to Story 3.5.
 *
 * @module lib/retention-policy
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';

/**
 * Retention configuration
 */
export interface RetentionConfig {
  /** Maximum number of active sessions before archival candidates are identified */
  shortTermMaxSessions: number; // Default: 50

  /** Maximum age in days for active sessions */
  shortTermMaxAgeDays: number; // Default: 30

  /** Whether to automatically consolidate (MVP: false, manual only) */
  autoConsolidate: boolean; // Default: false
}

/**
 * Session entry in the registry
 */
export interface SessionEntry {
  sessionId: string;
  capturedAt: number;
  segmentCount: number;
  segments: any[];
  tags: string[];

  // Retention metadata (Story 1.8)
  archived: boolean;
  consolidatedAt: number | null;
  totalSize?: number;
  lastAccessed?: number | null;
}

/**
 * Result of checking retention thresholds
 */
export interface RetentionCheckResult {
  /** True if session count exceeds threshold */
  exceedsCount: boolean;

  /** True if any sessions exceed age threshold */
  exceedsAge: boolean;

  /** Sessions that are candidates for archival (sorted oldest first) */
  candidates: SessionEntry[];
}

/**
 * Retention Policy Checker
 *
 * Checks retention thresholds and identifies sessions that are candidates
 * for archival based on count and age limits.
 */
export class RetentionPolicyChecker {
  private paiDir: string;
  private registryPath: string;

  constructor(paiDir?: string) {
    this.paiDir = paiDir || process.env.PAI_DIR || join(homedir(), 'pai');
    this.registryPath = join(this.paiDir, 'mem-store', 'structured', 'session-registry.json');
  }

  /**
   * Check if retention thresholds are exceeded and identify candidate sessions
   *
   * @param config - Retention configuration
   * @returns Result with threshold status and candidate sessions
   */
  async checkRetentionThresholds(config: RetentionConfig): Promise<RetentionCheckResult> {
    // Load session registry
    const sessions = await this.loadRegistry();

    // Filter out already archived sessions
    const activeSessions = sessions.filter(s => !s.archived);

    // Check if we exceed session count threshold
    const exceedsCount = activeSessions.length > config.shortTermMaxSessions;

    // Check if any sessions exceed age threshold
    const now = Date.now();
    const maxAgeMs = config.shortTermMaxAgeDays * 24 * 60 * 60 * 1000;
    const exceedsAge = activeSessions.some(s => (now - s.capturedAt) > maxAgeMs);

    // Identify candidates for archival (oldest first)
    const candidates: SessionEntry[] = [];

    if (exceedsCount) {
      // Sort by capturedAt (oldest first), take excess sessions
      const excess = activeSessions.length - config.shortTermMaxSessions;
      const sorted = [...activeSessions].sort((a, b) => a.capturedAt - b.capturedAt);
      candidates.push(...sorted.slice(0, excess));
    }

    if (exceedsAge) {
      // Add any sessions older than threshold
      activeSessions.forEach(s => {
        if ((now - s.capturedAt) > maxAgeMs) {
          if (!candidates.find(c => c.sessionId === s.sessionId)) {
            candidates.push(s);
          }
        }
      });
    }

    // Sort final candidates list oldest first
    candidates.sort((a, b) => a.capturedAt - b.capturedAt);

    return { exceedsCount, exceedsAge, candidates };
  }

  /**
   * Mark sessions as archived in the registry
   *
   * @param sessionIds - Array of session IDs to mark as archived
   */
  async markAsArchived(sessionIds: string[]): Promise<void> {
    const sessions = await this.loadRegistry();
    const now = Date.now();

    // Convert to object map for faster lookup
    const sessionMap: Record<string, SessionEntry> = {};
    sessions.forEach(s => {
      sessionMap[s.sessionId] = s;
    });

    // Mark sessions as archived
    sessionIds.forEach(id => {
      const session = sessionMap[id];
      if (session) {
        session.archived = true;
        session.consolidatedAt = now;
      }
    });

    // Convert back to sessions object
    const sessionsObj: Record<string, SessionEntry> = {};
    Object.values(sessionMap).forEach(s => {
      sessionsObj[s.sessionId] = s;
    });

    await this.saveRegistry(sessionsObj);
    console.error(`[Memory:Lifecycle] Marked ${sessionIds.length} sessions as archived`);
  }

  /**
   * Load session registry from disk
   *
   * @returns Array of session entries (empty if registry doesn't exist)
   */
  private async loadRegistry(): Promise<SessionEntry[]> {
    if (!existsSync(this.registryPath)) {
      return [];
    }

    try {
      const content = await fs.readFile(this.registryPath, 'utf-8');
      const data = JSON.parse(content);

      // Registry format: { sessions: { sessionId: SessionEntry, ... } }
      const sessionsObj = data.sessions || {};
      return Object.values(sessionsObj);
    } catch (error) {
      console.error(`[Memory:Lifecycle] Failed to load registry: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Save session registry to disk (atomic write)
   *
   * @param sessions - Sessions object map
   */
  private async saveRegistry(sessions: Record<string, SessionEntry>): Promise<void> {
    try {
      // Ensure directory exists
      const registryDir = join(this.paiDir, 'mem-store', 'structured');
      await fs.mkdir(registryDir, { recursive: true });

      const data = { sessions };
      const tempPath = `${this.registryPath}.tmp`;

      // Atomic write: write to temp, then rename
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      await fs.rename(tempPath, this.registryPath);
    } catch (error) {
      console.error(`[Memory:Lifecycle] Failed to save registry: ${(error as Error).message}`);
      throw error;
    }
  }
}
