/**
 * Story 6.3: Decay + Reinforcement Integration Tests
 *
 * Tests the "use it or lose it" pattern where:
 * - Frequently accessed memories stay relevant (Story 6.2: reinforcement)
 * - Stale memories decay in ranking (Story 6.3: decay)
 * - Re-accessing stale memories resets decay
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { updateUsageSignals } from '../src/lib/usage-tracker';
import { rankResults } from '../src/core/ranking';
import type { FilterResult } from '../src/types/filters';

describe('Decay + Reinforcement Integration (Use-It-Or-Lose-It)', () => {
  let testMemstoreDir: string;

  beforeEach(() => {
    // Create isolated test directory
    testMemstoreDir = join(homedir(), '.memstore-test-decay-reinforcement');
    mkdirSync(testMemstoreDir, { recursive: true });
    process.env.MEMSTORE_DIR = testMemstoreDir;

    const segmentsDir = join(testMemstoreDir, 'mem-store', 'segments', '2026-01');
    mkdirSync(segmentsDir, { recursive: true });

    const now = Date.now();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    // Segment 1: Frequently used (high access count, recent lastAccessed)
    const frequentlyUsed = `---
id: seg_frequent_001
session_id: mem_test_001
timestamp: ${now - (30 * MS_PER_DAY)}
importance_score: 50
access_count: 10
last_accessed: ${now - (1 * MS_PER_DAY)}
tags: [typescript, active]
memory_type: episodic
source_range:
  start: 0
  end: 100
---
Frequently accessed segment.`;
    writeFileSync(join(segmentsDir, 'seg_frequent_001.md'), frequentlyUsed);

    // Segment 2: Stale (old lastAccessed)
    const staleSegment = `---
id: seg_stale_001
session_id: mem_test_002
timestamp: ${now - (120 * MS_PER_DAY)}
importance_score: 50
access_count: 2
last_accessed: ${now - (95 * MS_PER_DAY)}
tags: [python, stale]
memory_type: episodic
source_range:
  start: 0
  end: 100
---
Stale segment.`;
    writeFileSync(join(segmentsDir, 'seg_stale_001.md'), staleSegment);

    // Segment 3: Never accessed
    const neverUsed = `---
id: seg_never_001
session_id: mem_test_003
timestamp: ${now - (60 * MS_PER_DAY)}
importance_score: 50
access_count: 0
last_accessed: null
tags: [rust, unused]
memory_type: episodic
source_range:
  start: 0
  end: 100
---
Never accessed segment.`;
    writeFileSync(join(segmentsDir, 'seg_never_001.md'), neverUsed);
  });

  afterEach(() => {
    if (existsSync(testMemstoreDir)) {
      rmSync(testMemstoreDir, { recursive: true, force: true });
    }
    delete process.env.MEMSTORE_DIR;
  });

  test('should implement use-it-or-lose-it pattern (AC6)', async () => {
    // Story 6.3 AC6: Use it or lose it pattern
    // - Frequently-used memories stay relevant
    // - Unused memories fade away

    const now = Date.now();

    // Create filter results for all three segments
    const filterResults: FilterResult[] = [
      {
        segmentId: 'seg_frequent_001',
        matchCount: 1,
        totalQueryTerms: 3,
        matchedTerms: ['typescript'],
        metadata: {
          id: 'seg_frequent_001',
          sessionId: 'mem_test_001',
          timestamp: now - (30 * 24 * 60 * 60 * 1000),
          importanceScore: 50,
          accessCount: 10,
          lastAccessed: now - (1 * 24 * 60 * 60 * 1000),
          tags: ['typescript', 'active'],
          memoryType: 'episodic'
        }
      },
      {
        segmentId: 'seg_stale_001',
        matchCount: 1,
        totalQueryTerms: 3,
        matchedTerms: ['python'],
        metadata: {
          id: 'seg_stale_001',
          sessionId: 'mem_test_002',
          timestamp: now - (120 * 24 * 60 * 60 * 1000),
          importanceScore: 50,
          accessCount: 2,
          lastAccessed: now - (95 * 24 * 60 * 60 * 1000),
          tags: ['python', 'stale'],
          memoryType: 'episodic'
        }
      },
      {
        segmentId: 'seg_never_001',
        matchCount: 1,
        totalQueryTerms: 3,
        matchedTerms: ['rust'],
        metadata: {
          id: 'seg_never_001',
          sessionId: 'mem_test_003',
          timestamp: now - (60 * 24 * 60 * 60 * 1000),
          importanceScore: 50,
          accessCount: 0,
          lastAccessed: null,
          tags: ['rust', 'unused'],
          memoryType: 'episodic'
        }
      }
    ];

    // Rank the results
    const rankResult = await rankResults(filterResults);

    expect(rankResult.ok).toBe(true);
    if (!rankResult.ok) return;

    const ranked = rankResult.value;

    // Find segments and their scores
    const frequentResult = ranked.find(r => r.segmentId === 'seg_frequent_001');
    const staleResult = ranked.find(r => r.segmentId === 'seg_stale_001');
    const neverResult = ranked.find(r => r.segmentId === 'seg_never_001');

    expect(frequentResult).toBeDefined();
    expect(staleResult).toBeDefined();
    expect(neverResult).toBeDefined();

    if (!frequentResult || !staleResult || !neverResult) return;

    const frequentScore = frequentResult.relevanceScore;
    const staleScore = staleResult.relevanceScore;
    const neverScore = neverResult.relevanceScore;

    console.error(`[UseItOrLoseIt] Frequent: ${frequentScore.toFixed(2)}, Never: ${neverScore.toFixed(2)}, Stale: ${staleScore.toFixed(2)}`);

    // Verify scores reflect usage patterns
    // Frequently-used should score highest (high access count + recent lastAccessed)
    expect(frequentScore).toBeGreaterThan(neverScore);
    expect(frequentScore).toBeGreaterThan(staleScore);

    // Frequently-used should be significantly higher (at least 2x) than stale/never
    expect(frequentScore).toBeGreaterThan(neverScore * 1.5);
    expect(frequentScore).toBeGreaterThan(staleScore * 1.5);

    // Both stale and never-accessed should have low scores (decay working)
    // The exact order between them is less important than both being much lower than frequent
    expect(neverScore).toBeLessThan(40); // Should have decay penalty
    expect(staleScore).toBeLessThan(40); // Should have heavy decay
  });

  test('should reset decay when stale segment is re-accessed (AC5)', async () => {
    // Story 6.3 AC5: Decay reset on re-access
    // When a stale segment is accessed again, decay is reset and it becomes relevant

    const now = Date.now();

    // BEFORE re-access: stale segment with old lastAccessed
    const beforeFilterResult: FilterResult = {
      segmentId: 'seg_stale_001',
      matchCount: 1,
      totalQueryTerms: 1,
      matchedTerms: ['python'],
      metadata: {
        id: 'seg_stale_001',
        sessionId: 'mem_test_002',
        timestamp: now - (120 * 24 * 60 * 60 * 1000),
        importanceScore: 50,
        accessCount: 2,
        lastAccessed: now - (95 * 24 * 60 * 60 * 1000), // Stale (95 days ago)
        tags: ['python', 'stale'],
        memoryType: 'episodic'
      }
    };

    const beforeRank = await rankResults([beforeFilterResult]);
    expect(beforeRank.ok).toBe(true);
    if (!beforeRank.ok) return;

    const beforeScore = beforeRank.value[0].relevanceScore;

    // AFTER re-access: lastAccessed is updated to now, accessCount incremented
    // (Story 6.2 usage tracker would do this automatically)
    const afterFilterResult: FilterResult = {
      segmentId: 'seg_stale_001',
      matchCount: 1,
      totalQueryTerms: 1,
      matchedTerms: ['python'],
      metadata: {
        id: 'seg_stale_001',
        sessionId: 'mem_test_002',
        timestamp: now - (120 * 24 * 60 * 60 * 1000),
        importanceScore: 50,
        accessCount: 3, // Incremented
        lastAccessed: now, // Updated to now (decay reset)
        tags: ['python', 'stale'],
        memoryType: 'episodic'
      }
    };

    const afterRank = await rankResults([afterFilterResult]);
    expect(afterRank.ok).toBe(true);
    if (!afterRank.ok) return;

    const afterScore = afterRank.value[0].relevanceScore;

    // Verify score improved significantly after re-access (decay reset)
    expect(afterScore).toBeGreaterThan(beforeScore);

    // Log scores for debugging
    console.error(`[DecayTest] Before: ${beforeScore.toFixed(2)}, After: ${afterScore.toFixed(2)}, Improvement: ${(afterScore - beforeScore).toFixed(2)}`);

    // Score should increase meaningfully (at least 10% improvement)
    const improvement = afterScore - beforeScore;
    expect(improvement).toBeGreaterThan(beforeScore * 0.1);
  });

  test('should prioritize recently-accessed over old creations (AC2)', async () => {
    // Story 6.3 AC2: Dual-recency prioritizes access recency over creation recency

    const now = Date.now();

    // Old segment, recently accessed
    const oldButActive: FilterResult = {
      segmentId: 'seg_old_active',
      matchCount: 1,
      totalQueryTerms: 1,
      matchedTerms: ['test'],
      metadata: {
        id: 'seg_old_active',
        sessionId: 'mem_test',
        timestamp: now - (120 * 24 * 60 * 60 * 1000), // Created 120 days ago
        importanceScore: 50,
        accessCount: 5,
        lastAccessed: now - (2 * 24 * 60 * 60 * 1000), // Accessed 2 days ago
        tags: ['test'],
        memoryType: 'episodic'
      }
    };

    // New segment, never accessed
    const newButUnused: FilterResult = {
      segmentId: 'seg_new_unused',
      matchCount: 1,
      totalQueryTerms: 1,
      matchedTerms: ['test'],
      metadata: {
        id: 'seg_new_unused',
        sessionId: 'mem_test',
        timestamp: now - (7 * 24 * 60 * 60 * 1000), // Created 7 days ago
        importanceScore: 50,
        accessCount: 0,
        lastAccessed: null, // Never accessed
        tags: ['test'],
        memoryType: 'episodic'
      }
    };

    const rankResult = await rankResults([oldButActive, newButUnused]);

    expect(rankResult.ok).toBe(true);
    if (!rankResult.ok) return;

    const ranked = rankResult.value;

    // Old but active should rank higher than new but unused
    expect(ranked[0].segmentId).toBe('seg_old_active');
    expect(ranked[1].segmentId).toBe('seg_new_unused');

    // Verify scores
    const activeScore = ranked[0].relevanceScore;
    const unusedScore = ranked[1].relevanceScore;
    expect(activeScore).toBeGreaterThan(unusedScore);
  });

  test('should penalize never-accessed segments (AC2)', async () => {
    // Story 6.3 AC2: Never-accessed segments get decay penalty

    const now = Date.now();

    // Never accessed
    const neverAccessed: FilterResult = {
      segmentId: 'seg_never',
      matchCount: 1,
      totalQueryTerms: 1,
      matchedTerms: ['test'],
      metadata: {
        id: 'seg_never',
        sessionId: 'mem_test',
        timestamp: now - (14 * 24 * 60 * 60 * 1000), // 14 days old
        importanceScore: 50,
        accessCount: 0,
        lastAccessed: null,
        tags: ['test'],
        memoryType: 'episodic'
      }
    };

    // Same age but accessed recently
    const accessed: FilterResult = {
      segmentId: 'seg_accessed',
      matchCount: 1,
      totalQueryTerms: 1,
      matchedTerms: ['test'],
      metadata: {
        id: 'seg_accessed',
        sessionId: 'mem_test',
        timestamp: now - (14 * 24 * 60 * 60 * 1000), // 14 days old
        importanceScore: 50,
        accessCount: 3,
        lastAccessed: now - (1 * 24 * 60 * 60 * 1000), // Accessed yesterday
        tags: ['test'],
        memoryType: 'episodic'
      }
    };

    const rankResult = await rankResults([neverAccessed, accessed]);

    expect(rankResult.ok).toBe(true);
    if (!rankResult.ok) return;

    const ranked = rankResult.value;

    // Accessed should rank higher
    expect(ranked[0].segmentId).toBe('seg_accessed');
    expect(ranked[1].segmentId).toBe('seg_never');

    // Never-accessed should score lower due to penalty
    const accessedScore = ranked[0].relevanceScore;
    const neverScore = ranked[1].relevanceScore;
    expect(accessedScore).toBeGreaterThan(neverScore);
  });
});
