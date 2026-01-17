import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import {
  findSegmentsByKeyword,
  findSegmentsByKeywords,
  loadKeywordIndex,
  clearKeywordIndexCache,
  findStaleSegments,
  findNeverAccessedSegments,
  findStaleSessions,
  type KeywordIndex,
  type SegmentMatch
} from '../segment-search';

describe('SegmentSearch', () => {
  let testPaiDir: string;
  let indexPath: string;

  beforeEach(() => {
    // Clear cache
    clearKeywordIndexCache();

    // Create isolated test directory
    testPaiDir = join(homedir(), 'pai-test-segment-search');
    mkdirSync(testPaiDir, { recursive: true });
    process.env.PAI_DIR = testPaiDir;

    // Create test keyword index
    const indexDir = join(testPaiDir, 'mem-store', 'indexes', 'keyword');
    mkdirSync(indexDir, { recursive: true });
    indexPath = join(indexDir, 'index.json');

    const index: KeywordIndex = {
      typescript: ['seg_001', 'seg_042', 'seg_089'],
      hooks: ['seg_001', 'seg_055'],
      memory: ['seg_001', 'seg_089', 'seg_120'],
      auth: ['seg_200', 'seg_201'],
      security: ['seg_200', 'seg_201', 'seg_202']
    };

    writeFileSync(indexPath, JSON.stringify(index, null, 2));
  });

  afterEach(() => {
    // ALWAYS clean up
    if (existsSync(testPaiDir)) {
      rmSync(testPaiDir, { recursive: true, force: true });
    }
    delete process.env.PAI_DIR;
  });

  describe('loadKeywordIndex', () => {
    test('should return index when file exists and is valid', async () => {
      // Act
      const result = await loadKeywordIndex();

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Object.keys(result.value)).toHaveLength(5);
        expect(result.value.typescript).toEqual(['seg_001', 'seg_042', 'seg_089']);
      }
    });

    test('should return error when index file does not exist', async () => {
      // Arrange
      rmSync(indexPath, { force: true });

      // Act
      const result = await loadKeywordIndex();

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SEGMENT_SEARCH_INDEX_NOT_FOUND');
      }
    });

    test('should return error when index file is corrupted', async () => {
      // Arrange
      writeFileSync(indexPath, 'invalid json {{{');

      // Act
      const result = await loadKeywordIndex();

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SEGMENT_SEARCH_INDEX_CORRUPT');
      }
    });
  });

  describe('findSegmentsByKeyword', () => {
    test('should return segment IDs when keyword exists in index', async () => {
      // Arrange
      const keyword = 'typescript';

      // Act
      const result = await findSegmentsByKeyword(keyword);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(3);
        expect(result.value).toEqual(['seg_001', 'seg_042', 'seg_089']);
      }
    });

    test('should return empty array when keyword does not exist', async () => {
      // Arrange
      const keyword = 'nonexistent';

      // Act
      const result = await findSegmentsByKeyword(keyword);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });

    test('should support case-insensitive keyword matching', async () => {
      // Arrange
      const keyword = 'TypeScript';

      // Act
      const result = await findSegmentsByKeyword(keyword);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(3);
      }
    });

    test('should handle missing index gracefully when searching', async () => {
      // Arrange
      rmSync(indexPath, { force: true });
      const keyword = 'typescript';

      // Act
      const result = await findSegmentsByKeyword(keyword);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SEGMENT_SEARCH_INDEX_NOT_FOUND');
      }
    });

    test('should handle corrupted index gracefully when searching', async () => {
      // Arrange
      writeFileSync(indexPath, 'invalid json');
      const keyword = 'typescript';

      // Act
      const result = await findSegmentsByKeyword(keyword);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SEGMENT_SEARCH_INDEX_CORRUPT');
      }
    });
  });

  describe('findSegmentsByKeywords', () => {
    test('should return segment matches with scores for multiple keywords', async () => {
      // Arrange
      const keywords = ['typescript', 'memory'];

      // Act
      const result = await findSegmentsByKeywords(keywords);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(0);

        // seg_001 and seg_089 should have highest scores (match both keywords)
        const topMatches = result.value.filter(m => m.matchScore === 2);
        expect(topMatches.length).toBe(2);
        expect(topMatches.some(m => m.segmentId === 'seg_001')).toBe(true);
        expect(topMatches.some(m => m.segmentId === 'seg_089')).toBe(true);
      }
    });

    test('should sort results by match score descending', async () => {
      // Arrange
      const keywords = ['typescript', 'memory', 'hooks'];

      // Act
      const result = await findSegmentsByKeywords(keywords);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Results should be sorted by score (highest first)
        for (let i = 1; i < result.value.length; i++) {
          expect(result.value[i - 1].matchScore).toBeGreaterThanOrEqual(result.value[i].matchScore);
        }

        // seg_001 matches all 3 keywords
        expect(result.value[0].segmentId).toBe('seg_001');
        expect(result.value[0].matchScore).toBe(3);
        expect(result.value[0].matchedKeywords).toEqual(['typescript', 'memory', 'hooks']);
      }
    });

    test('should return empty array when no keywords match', async () => {
      // Arrange
      const keywords = ['nonexistent1', 'nonexistent2'];

      // Act
      const result = await findSegmentsByKeywords(keywords);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });

    test('should include matched keywords in result', async () => {
      // Arrange
      const keywords = ['auth', 'security'];

      // Act
      const result = await findSegmentsByKeywords(keywords);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        const seg200 = result.value.find(m => m.segmentId === 'seg_200');
        expect(seg200).toBeDefined();
        if (seg200) {
          expect(seg200.matchedKeywords).toEqual(['auth', 'security']);
          expect(seg200.matchScore).toBe(2);
        }
      }
    });

    test('should deduplicate segment IDs across keywords', async () => {
      // Arrange
      const keywords = ['typescript', 'hooks'];

      // Act
      const result = await findSegmentsByKeywords(keywords);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        const segmentIds = result.value.map(m => m.segmentId);
        const uniqueIds = new Set(segmentIds);
        expect(segmentIds.length).toBe(uniqueIds.size);
      }
    });
  });

  // Story 6.3: Stale Segment Query Tests
  describe('findStaleSegments', () => {
    beforeEach(() => {
      // Create test segments directory
      const segmentsDir = join(testPaiDir, 'mem-store', 'segments', '2026-01');
      mkdirSync(segmentsDir, { recursive: true });

      const now = Date.now();
      const MS_PER_DAY = 24 * 60 * 60 * 1000;

      // Fresh segment (accessed 2 days ago)
      const freshSegment = `---
id: seg_fresh_001
session_id: mem_test_001
timestamp: ${now - (30 * MS_PER_DAY)}
importance_score: 50
access_count: 5
last_accessed: ${now - (2 * MS_PER_DAY)}
tags: [typescript, fresh]
memory_type: episodic
source_range:
  start: 0
  end: 100
---
Fresh segment content.`;
      writeFileSync(join(segmentsDir, 'seg_fresh_001.md'), freshSegment);

      // Stale segment (accessed 95 days ago)
      const staleSegment = `---
id: seg_stale_001
session_id: mem_test_001
timestamp: ${now - (120 * MS_PER_DAY)}
importance_score: 50
access_count: 3
last_accessed: ${now - (95 * MS_PER_DAY)}
tags: [old, stale]
memory_type: episodic
source_range:
  start: 0
  end: 100
---
Stale segment content.`;
      writeFileSync(join(segmentsDir, 'seg_stale_001.md'), staleSegment);

      // Never accessed segment
      const neverAccessedSegment = `---
id: seg_never_001
session_id: mem_test_002
timestamp: ${now - (60 * MS_PER_DAY)}
importance_score: 50
access_count: 0
last_accessed: null
tags: [unused]
memory_type: episodic
source_range:
  start: 0
  end: 100
---
Never accessed segment content.`;
      writeFileSync(join(segmentsDir, 'seg_never_001.md'), neverAccessedSegment);
    });

    test('should identify segments not accessed in 90+ days', async () => {
      const result = await findStaleSegments(90);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should find: seg_stale_001 (95 days) + seg_never_001 (never accessed)
        expect(result.value.length).toBe(2);

        const staleIds = result.value.map(s => s.id);
        expect(staleIds).toContain('seg_stale_001');
        expect(staleIds).toContain('seg_never_001');

        // Should NOT include seg_fresh_001 (accessed 2 days ago)
        expect(staleIds).not.toContain('seg_fresh_001');
      }
    });

    test('should include ageDays for stale segments', async () => {
      const result = await findStaleSegments(90);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const stale = result.value.find(s => s.id === 'seg_stale_001');
        expect(stale).toBeDefined();
        if (stale) {
          expect(stale.ageDays).toBeGreaterThan(90);
          expect(stale.ageDays).toBeLessThan(100);
          expect(stale.accessCount).toBe(3);
        }
      }
    });

    test('should handle never-accessed segments (lastAccessed === null)', async () => {
      const result = await findStaleSegments(90);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const neverAccessed = result.value.find(s => s.id === 'seg_never_001');
        expect(neverAccessed).toBeDefined();
        if (neverAccessed) {
          expect(neverAccessed.lastAccessed).toBe(null);
          expect(neverAccessed.ageDays).toBe(null);
          expect(neverAccessed.accessCount).toBe(0);
        }
      }
    });

    test('should return only never-accessed when threshold is very long', async () => {
      const result = await findStaleSegments(200); // Very long threshold

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should still find never-accessed segments (lastAccessed === null is always stale)
        expect(result.value.length).toBe(1);
        expect(result.value[0].id).toBe('seg_never_001');
        expect(result.value[0].lastAccessed).toBe(null);
      }
    });

    test('should handle missing segments directory gracefully', async () => {
      // Remove segments directory
      const segmentsDir = join(testPaiDir, 'mem-store', 'segments');
      rmSync(segmentsDir, { recursive: true, force: true });

      const result = await findStaleSegments(90);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });
  });

  describe('findNeverAccessedSegments', () => {
    beforeEach(() => {
      const segmentsDir = join(testPaiDir, 'mem-store', 'segments', '2026-01');
      mkdirSync(segmentsDir, { recursive: true });

      const now = Date.now();
      const MS_PER_DAY = 24 * 60 * 60 * 1000;

      // Accessed segment
      const accessedSegment = `---
id: seg_accessed_001
session_id: mem_test_001
timestamp: ${now - (30 * MS_PER_DAY)}
importance_score: 50
access_count: 5
last_accessed: ${now - (2 * MS_PER_DAY)}
tags: [used]
memory_type: episodic
source_range:
  start: 0
  end: 100
---
Accessed segment content.`;
      writeFileSync(join(segmentsDir, 'seg_accessed_001.md'), accessedSegment);

      // Never accessed (accessCount = 0)
      const neverAccessed1 = `---
id: seg_never_001
session_id: mem_test_002
timestamp: ${now - (60 * MS_PER_DAY)}
importance_score: 50
access_count: 0
last_accessed: null
tags: [unused]
memory_type: episodic
source_range:
  start: 0
  end: 100
---
Never accessed 1.`;
      writeFileSync(join(segmentsDir, 'seg_never_001.md'), neverAccessed1);

      // Never accessed (lastAccessed = null but accessCount > 0 is impossible, but test edge case)
      const neverAccessed2 = `---
id: seg_never_002
session_id: mem_test_002
timestamp: ${now - (10 * MS_PER_DAY)}
importance_score: 50
access_count: 0
last_accessed: null
tags: [unused]
memory_type: episodic
source_range:
  start: 0
  end: 100
---
Never accessed 2.`;
      writeFileSync(join(segmentsDir, 'seg_never_002.md'), neverAccessed2);
    });

    test('should find all never-accessed segments', async () => {
      const result = await findNeverAccessedSegments();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(2);

        const ids = result.value.map(s => s.id);
        expect(ids).toContain('seg_never_001');
        expect(ids).toContain('seg_never_002');
        expect(ids).not.toContain('seg_accessed_001');
      }
    });

    test('should verify accessCount === 0 for never-accessed', async () => {
      const result = await findNeverAccessedSegments();

      expect(result.ok).toBe(true);
      if (result.ok) {
        result.value.forEach(segment => {
          expect(segment.accessCount).toBe(0);
          expect(segment.lastAccessed).toBe(null);
        });
      }
    });

    test('should return empty array when all segments accessed', async () => {
      // Remove never-accessed segments
      const segmentsDir = join(testPaiDir, 'mem-store', 'segments', '2026-01');
      rmSync(join(segmentsDir, 'seg_never_001.md'));
      rmSync(join(segmentsDir, 'seg_never_002.md'));

      const result = await findNeverAccessedSegments();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });
  });

  describe('findStaleSessions', () => {
    beforeEach(() => {
      const segmentsDir = join(testPaiDir, 'mem-store', 'segments', '2026-01');
      mkdirSync(segmentsDir, { recursive: true });

      const now = Date.now();
      const MS_PER_DAY = 24 * 60 * 60 * 1000;

      // Session 1: All segments stale
      const staleSession1Seg1 = `---
id: seg_stale_s1_001
session_id: mem_stale_session_001
timestamp: ${now - (120 * MS_PER_DAY)}
importance_score: 50
access_count: 1
last_accessed: ${now - (95 * MS_PER_DAY)}
tags: [old]
memory_type: episodic
source_range:
  start: 0
  end: 100
---
Stale session 1, segment 1.`;
      writeFileSync(join(segmentsDir, 'seg_stale_s1_001.md'), staleSession1Seg1);

      const staleSession1Seg2 = `---
id: seg_stale_s1_002
session_id: mem_stale_session_001
timestamp: ${now - (120 * MS_PER_DAY)}
importance_score: 50
access_count: 2
last_accessed: ${now - (100 * MS_PER_DAY)}
tags: [old]
memory_type: episodic
source_range:
  start: 0
  end: 100
---
Stale session 1, segment 2.`;
      writeFileSync(join(segmentsDir, 'seg_stale_s1_002.md'), staleSession1Seg2);

      // Session 2: Mixed (one fresh, one stale)
      const mixedSession2Seg1 = `---
id: seg_mixed_s2_001
session_id: mem_mixed_session_002
timestamp: ${now - (30 * MS_PER_DAY)}
importance_score: 50
access_count: 5
last_accessed: ${now - (2 * MS_PER_DAY)}
tags: [fresh]
memory_type: episodic
source_range:
  start: 0
  end: 100
---
Mixed session 2, fresh segment.`;
      writeFileSync(join(segmentsDir, 'seg_mixed_s2_001.md'), mixedSession2Seg1);

      const mixedSession2Seg2 = `---
id: seg_mixed_s2_002
session_id: mem_mixed_session_002
timestamp: ${now - (120 * MS_PER_DAY)}
importance_score: 50
access_count: 1
last_accessed: ${now - (95 * MS_PER_DAY)}
tags: [old]
memory_type: episodic
source_range:
  start: 0
  end: 100
---
Mixed session 2, stale segment.`;
      writeFileSync(join(segmentsDir, 'seg_mixed_s2_002.md'), mixedSession2Seg2);
    });

    test('should find sessions where all segments are stale', async () => {
      const result = await findStaleSessions(90);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should only find mem_stale_session_001 (all segments stale)
        expect(result.value.length).toBe(1);

        const staleSession = result.value[0];
        expect(staleSession.sessionId).toBe('mem_stale_session_001');
        expect(staleSession.segmentCount).toBe(2);
        expect(staleSession.staleCount).toBe(2);
      }
    });

    test('should NOT include sessions with mixed freshness', async () => {
      const result = await findStaleSessions(90);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const sessionIds = result.value.map(s => s.sessionId);
        // mem_mixed_session_002 has one fresh segment, so should NOT be included
        expect(sessionIds).not.toContain('mem_mixed_session_002');
      }
    });

    test('should include oldestAccess timestamp', async () => {
      const result = await findStaleSessions(90);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const staleSession = result.value[0];
        expect(staleSession.oldestAccess).not.toBe(null);
        // Should be ~100 days ago (the older of the two segments)
        if (staleSession.oldestAccess) {
          const ageDays = (Date.now() - staleSession.oldestAccess) / (24 * 60 * 60 * 1000);
          expect(ageDays).toBeGreaterThan(95);
        }
      }
    });

    test('should return empty array when no stale sessions', async () => {
      const result = await findStaleSessions(200); // Very long threshold

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });
  });
});
