import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { promises as fs } from 'fs';
import { RetentionPolicyChecker } from '../retention-policy';

const TEST_MEMSTORE_DIR = join(homedir(), '.memstore-test-retention');

describe('lib/retention-policy.ts', () => {
  let checker: RetentionPolicyChecker;
  let registryPath: string;

  beforeEach(async () => {
    if (existsSync(TEST_MEMSTORE_DIR)) {
      rmSync(TEST_MEMSTORE_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_MEMSTORE_DIR, { recursive: true });

    checker = new RetentionPolicyChecker(TEST_MEMSTORE_DIR);
    registryPath = join(TEST_MEMSTORE_DIR, 'mem-store', 'structured', 'session-registry.json');
  });

  afterAll(() => {
    if (existsSync(TEST_MEMSTORE_DIR)) {
      rmSync(TEST_MEMSTORE_DIR, { recursive: true, force: true });
    }
  });

  test('should identify sessions exceeding count threshold', async () => {
    // Create registry with 55 sessions (exceeds threshold of 50)
    const sessions: any = {};
    for (let i = 0; i < 55; i++) {
      sessions[`mem_${i}`] = {
        sessionId: `mem_${i}`,
        capturedAt: Date.now() - (i * 1000 * 60 * 60), // Staggered times
        segmentCount: 10,
        segments: [],
        tags: [],
        archived: false,
        consolidatedAt: null,
        totalSize: 1000,
        lastAccessed: null
      };
    }

    await fs.mkdir(join(TEST_MEMSTORE_DIR, 'mem-store', 'structured'), { recursive: true });
    await fs.writeFile(registryPath, JSON.stringify({ sessions }), 'utf-8');

    const result = await checker.checkRetentionThresholds({
      shortTermMaxSessions: 50,
      shortTermMaxAgeDays: 30,
      autoConsolidate: false
    });

    expect(result.exceedsCount).toBe(true);
    expect(result.candidates.length).toBe(5); // 5 oldest sessions
  });

  test('should identify sessions exceeding age threshold', async () => {
    const now = Date.now();
    const oldTimestamp = now - (35 * 24 * 60 * 60 * 1000); // 35 days ago

    const sessions: any = {
      mem_recent: {
        sessionId: 'mem_recent',
        capturedAt: now - (5 * 24 * 60 * 60 * 1000), // 5 days ago
        segmentCount: 10,
        segments: [],
        tags: [],
        archived: false,
        consolidatedAt: null,
        totalSize: 1000,
        lastAccessed: null
      },
      mem_old: {
        sessionId: 'mem_old',
        capturedAt: oldTimestamp,
        segmentCount: 8,
        segments: [],
        tags: [],
        archived: false,
        consolidatedAt: null,
        totalSize: 800,
        lastAccessed: null
      }
    };

    await fs.mkdir(join(TEST_MEMSTORE_DIR, 'mem-store', 'structured'), { recursive: true });
    await fs.writeFile(registryPath, JSON.stringify({ sessions }), 'utf-8');

    const result = await checker.checkRetentionThresholds({
      shortTermMaxSessions: 50,
      shortTermMaxAgeDays: 30,
      autoConsolidate: false
    });

    expect(result.exceedsAge).toBe(true);
    expect(result.candidates).toContainEqual(expect.objectContaining({ sessionId: 'mem_old' }));
    expect(result.candidates).not.toContainEqual(expect.objectContaining({ sessionId: 'mem_recent' }));
  });

  test('should mark sessions as archived', async () => {
    const sessions: any = {
      mem_001: {
        sessionId: 'mem_001',
        capturedAt: Date.now(),
        segmentCount: 10,
        segments: [],
        tags: [],
        archived: false,
        consolidatedAt: null,
        totalSize: 1000,
        lastAccessed: null
      }
    };

    await fs.mkdir(join(TEST_MEMSTORE_DIR, 'mem-store', 'structured'), { recursive: true });
    await fs.writeFile(registryPath, JSON.stringify({ sessions }), 'utf-8');

    await checker.markAsArchived(['mem_001']);

    const updatedContent = await fs.readFile(registryPath, 'utf-8');
    const updated = JSON.parse(updatedContent);

    expect(updated.sessions.mem_001.archived).toBe(true);
    expect(updated.sessions.mem_001.consolidatedAt).toBeGreaterThan(0);
  });

  test('should not include already archived sessions in candidates', async () => {
    const now = Date.now();
    const oldTimestamp = now - (35 * 24 * 60 * 60 * 1000);

    const sessions: any = {
      mem_old_archived: {
        sessionId: 'mem_old_archived',
        capturedAt: oldTimestamp,
        segmentCount: 10,
        segments: [],
        tags: [],
        archived: true, // Already archived
        consolidatedAt: now - (5 * 24 * 60 * 60 * 1000),
        totalSize: 1000,
        lastAccessed: null
      },
      mem_old_active: {
        sessionId: 'mem_old_active',
        capturedAt: oldTimestamp,
        segmentCount: 8,
        segments: [],
        tags: [],
        archived: false,
        consolidatedAt: null,
        totalSize: 800,
        lastAccessed: null
      }
    };

    await fs.mkdir(join(TEST_MEMSTORE_DIR, 'mem-store', 'structured'), { recursive: true });
    await fs.writeFile(registryPath, JSON.stringify({ sessions }), 'utf-8');

    const result = await checker.checkRetentionThresholds({
      shortTermMaxSessions: 50,
      shortTermMaxAgeDays: 30,
      autoConsolidate: false
    });

    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0].sessionId).toBe('mem_old_active');
  });

  test('should handle empty registry gracefully', async () => {
    const result = await checker.checkRetentionThresholds({
      shortTermMaxSessions: 50,
      shortTermMaxAgeDays: 30,
      autoConsolidate: false
    });

    expect(result.exceedsCount).toBe(false);
    expect(result.exceedsAge).toBe(false);
    expect(result.candidates.length).toBe(0);
  });

  test('should sort candidates by capturedAt (oldest first)', async () => {
    const sessions: any = {};
    for (let i = 0; i < 55; i++) {
      sessions[`mem_${i}`] = {
        sessionId: `mem_${i}`,
        capturedAt: Date.now() - (i * 1000 * 60 * 60), // Staggered times
        segmentCount: 10,
        segments: [],
        tags: [],
        archived: false,
        consolidatedAt: null,
        totalSize: 1000,
        lastAccessed: null
      };
    }

    await fs.mkdir(join(TEST_MEMSTORE_DIR, 'mem-store', 'structured'), { recursive: true });
    await fs.writeFile(registryPath, JSON.stringify({ sessions }), 'utf-8');

    const result = await checker.checkRetentionThresholds({
      shortTermMaxSessions: 50,
      shortTermMaxAgeDays: 30,
      autoConsolidate: false
    });

    // Verify candidates are sorted oldest first
    for (let i = 0; i < result.candidates.length - 1; i++) {
      expect(result.candidates[i].capturedAt).toBeLessThanOrEqual(result.candidates[i + 1].capturedAt);
    }
  });
});
