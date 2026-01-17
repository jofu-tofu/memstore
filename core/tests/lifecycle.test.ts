import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import {
  identifyDecayCandidates,
  generateDecayReport
} from '../lifecycle';

describe('Lifecycle Module - Decay Detection', () => {
  let testPaiDir: string;

  beforeEach(() => {
    // Create isolated test directory
    testPaiDir = join(homedir(), 'pai-test-lifecycle');
    mkdirSync(testPaiDir, { recursive: true });
    process.env.PAI_DIR = testPaiDir;

    // Create test segments directory
    const segmentsDir = join(testPaiDir, 'mem-store', 'segments', '2026-01');
    mkdirSync(segmentsDir, { recursive: true });

    const now = Date.now();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    // Fresh segment (accessed recently)
    const freshSegment = `---
id: seg_fresh_001
session_id: mem_session_001
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

    // Never accessed, old (HIGH priority delete)
    const neverAccessedOld = `---
id: seg_never_old_001
session_id: mem_session_002
timestamp: ${now - (100 * MS_PER_DAY)}
importance_score: 50
access_count: 0
last_accessed: null
tags: [unused, old]
memory_type: episodic
source_range:
  start: 0
  end: 100
---
Never accessed, old segment.`;
    writeFileSync(join(segmentsDir, 'seg_never_old_001.md'), neverAccessedOld);

    // Never accessed, medium age (MEDIUM priority monitor)
    const neverAccessedRecent = `---
id: seg_never_recent_001
session_id: mem_session_003
timestamp: ${now - (45 * MS_PER_DAY)}
importance_score: 50
access_count: 0
last_accessed: null
tags: [unused, recent]
memory_type: episodic
source_range:
  start: 0
  end: 100
---
Never accessed, recent segment.`;
    writeFileSync(join(segmentsDir, 'seg_never_recent_001.md'), neverAccessedRecent);

    // Stale but previously used (LOW priority archive)
    const stalePreviouslyUsed = `---
id: seg_stale_used_001
session_id: mem_session_004
timestamp: ${now - (120 * MS_PER_DAY)}
importance_score: 50
access_count: 3
last_accessed: ${now - (95 * MS_PER_DAY)}
tags: [old, used]
memory_type: episodic
source_range:
  start: 0
  end: 100
---
Stale but previously used segment.`;
    writeFileSync(join(segmentsDir, 'seg_stale_used_001.md'), stalePreviouslyUsed);

    // Stale session (all segments stale)
    const staleSessionSeg1 = `---
id: seg_stale_session_001
session_id: mem_stale_session_001
timestamp: ${now - (120 * MS_PER_DAY)}
importance_score: 50
access_count: 1
last_accessed: ${now - (100 * MS_PER_DAY)}
tags: [old]
memory_type: episodic
source_range:
  start: 0
  end: 100
---
Stale session segment 1.`;
    writeFileSync(join(segmentsDir, 'seg_stale_session_001.md'), staleSessionSeg1);

    const staleSessionSeg2 = `---
id: seg_stale_session_002
session_id: mem_stale_session_001
timestamp: ${now - (120 * MS_PER_DAY)}
importance_score: 50
access_count: 2
last_accessed: ${now - (95 * MS_PER_DAY)}
tags: [old]
memory_type: episodic
source_range:
  start: 0
  end: 100
---
Stale session segment 2.`;
    writeFileSync(join(segmentsDir, 'seg_stale_session_002.md'), staleSessionSeg2);
  });

  afterEach(() => {
    // ALWAYS clean up
    if (existsSync(testPaiDir)) {
      rmSync(testPaiDir, { recursive: true, force: true });
    }
    delete process.env.PAI_DIR;
  });

  describe('identifyDecayCandidates', () => {
    test('should identify decay candidates with correct priorities', async () => {
      const result = await identifyDecayCandidates();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const report = result.value;

        // Should have 3 candidates (not counting fresh segment or stale session segments)
        // High: seg_never_old_001
        // Medium: seg_never_recent_001
        // Low: seg_stale_used_001
        // Plus 2 from stale session: seg_stale_session_001, seg_stale_session_002
        expect(report.totalCandidates).toBeGreaterThanOrEqual(3);

        expect(report.highPriority).toBeGreaterThanOrEqual(1);
        expect(report.mediumPriority).toBeGreaterThanOrEqual(1);
        expect(report.lowPriority).toBeGreaterThanOrEqual(1);
      }
    });

    test('should classify never-accessed old segments as HIGH priority', async () => {
      const result = await identifyDecayCandidates();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const highPriorityCandidates = result.value.candidates.filter(
          c => c.priority === 'high'
        );

        const neverOld = highPriorityCandidates.find(c => c.segmentId === 'seg_never_old_001');
        expect(neverOld).toBeDefined();
        if (neverOld) {
          expect(neverOld.reason).toBe('never_accessed_old');
          expect(neverOld.recommendation).toBe('delete');
          expect(neverOld.accessCount).toBe(0);
          expect(neverOld.ageDays).toBeGreaterThan(90);
        }
      }
    });

    test('should classify never-accessed recent segments as MEDIUM priority', async () => {
      const result = await identifyDecayCandidates();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const mediumPriorityCandidates = result.value.candidates.filter(
          c => c.priority === 'medium'
        );

        const neverRecent = mediumPriorityCandidates.find(c => c.segmentId === 'seg_never_recent_001');
        expect(neverRecent).toBeDefined();
        if (neverRecent) {
          expect(neverRecent.reason).toBe('never_accessed_recent');
          expect(neverRecent.recommendation).toBe('monitor');
          expect(neverRecent.accessCount).toBe(0);
          expect(neverRecent.ageDays).toBeGreaterThan(30);
          expect(neverRecent.ageDays).toBeLessThan(90);
        }
      }
    });

    test('should classify stale previously-used segments as LOW priority', async () => {
      const result = await identifyDecayCandidates();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const lowPriorityCandidates = result.value.candidates.filter(
          c => c.priority === 'low'
        );

        const stalePrevUsed = lowPriorityCandidates.find(c => c.segmentId === 'seg_stale_used_001');
        expect(stalePrevUsed).toBeDefined();
        if (stalePrevUsed) {
          expect(stalePrevUsed.reason).toBe('stale_previously_used');
          expect(stalePrevUsed.recommendation).toBe('archive');
          expect(stalePrevUsed.accessCount).toBeGreaterThan(0);
        }
      }
    });

    test('should NOT include fresh segments in candidates', async () => {
      const result = await identifyDecayCandidates();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const candidateIds = result.value.candidates.map(c => c.segmentId);
        expect(candidateIds).not.toContain('seg_fresh_001');
      }
    });

    test('should identify stale sessions', async () => {
      const result = await identifyDecayCandidates();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.staleSessions.length).toBeGreaterThanOrEqual(1);

        const staleSession = result.value.staleSessions.find(
          s => s.sessionId === 'mem_stale_session_001'
        );
        expect(staleSession).toBeDefined();
        if (staleSession) {
          expect(staleSession.segmentCount).toBe(2);
          expect(staleSession.staleCount).toBe(2);
        }
      }
    });

    test('should include timestamp in report', async () => {
      const beforeTest = Date.now();
      const result = await identifyDecayCandidates();
      const afterTest = Date.now();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.timestamp).toBeGreaterThanOrEqual(beforeTest);
        expect(result.value.timestamp).toBeLessThanOrEqual(afterTest);
      }
    });

    test('should handle empty database gracefully', async () => {
      // Remove all segments
      const segmentsDir = join(testPaiDir, 'mem-store', 'segments');
      rmSync(segmentsDir, { recursive: true, force: true });

      const result = await identifyDecayCandidates();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.totalCandidates).toBe(0);
        expect(result.value.highPriority).toBe(0);
        expect(result.value.mediumPriority).toBe(0);
        expect(result.value.lowPriority).toBe(0);
        expect(result.value.candidates).toHaveLength(0);
        expect(result.value.staleSessions).toHaveLength(0);
      }
    });

    test('should not duplicate candidates', async () => {
      const result = await identifyDecayCandidates();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const candidateIds = result.value.candidates.map(c => c.segmentId);
        const uniqueIds = new Set(candidateIds);
        expect(candidateIds.length).toBe(uniqueIds.size);
      }
    });
  });

  describe('generateDecayReport', () => {
    test('should be an alias for identifyDecayCandidates', async () => {
      const result1 = await identifyDecayCandidates();
      const result2 = await generateDecayReport();

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);

      // Both should return similar structure (timestamps will differ)
      if (result1.ok && result2.ok) {
        expect(result1.value.totalCandidates).toBe(result2.value.totalCandidates);
        expect(result1.value.highPriority).toBe(result2.value.highPriority);
        expect(result1.value.mediumPriority).toBe(result2.value.mediumPriority);
        expect(result1.value.lowPriority).toBe(result2.value.lowPriority);
      }
    });
  });

  describe('priority counting', () => {
    test('should correctly sum priority counts', async () => {
      const result = await identifyDecayCandidates();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const report = result.value;
        const summedTotal = report.highPriority + report.mediumPriority + report.lowPriority;
        expect(summedTotal).toBe(report.totalCandidates);
      }
    });

    test('should include all candidates in priority buckets', async () => {
      const result = await identifyDecayCandidates();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const report = result.value;

        const highCount = report.candidates.filter(c => c.priority === 'high').length;
        const mediumCount = report.candidates.filter(c => c.priority === 'medium').length;
        const lowCount = report.candidates.filter(c => c.priority === 'low').length;

        expect(highCount).toBe(report.highPriority);
        expect(mediumCount).toBe(report.mediumPriority);
        expect(lowCount).toBe(report.lowPriority);
      }
    });
  });

  describe('edge cases', () => {
    test('should handle segments with very old timestamps', async () => {
      const segmentsDir = join(testPaiDir, 'mem-store', 'segments', '2025-01');
      mkdirSync(segmentsDir, { recursive: true });

      const now = Date.now();
      const MS_PER_DAY = 24 * 60 * 60 * 1000;
      const oneYearAgo = now - (365 * MS_PER_DAY);

      const veryOldSegment = `---
id: seg_very_old_001
session_id: mem_session_old
timestamp: ${oneYearAgo}
importance_score: 50
access_count: 0
last_accessed: null
tags: [ancient]
memory_type: episodic
source_range:
  start: 0
  end: 100
---
Very old segment.`;
      writeFileSync(join(segmentsDir, 'seg_very_old_001.md'), veryOldSegment);

      const result = await identifyDecayCandidates();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const veryOld = result.value.candidates.find(c => c.segmentId === 'seg_very_old_001');
        expect(veryOld).toBeDefined();
        if (veryOld) {
          expect(veryOld.priority).toBe('high');
          expect(veryOld.ageDays).toBeGreaterThan(360);
        }
      }
    });

    test('should handle corrupted segment files gracefully', async () => {
      const segmentsDir = join(testPaiDir, 'mem-store', 'segments', '2026-01');

      // Add a corrupted segment file
      writeFileSync(join(segmentsDir, 'seg_corrupted.md'), 'invalid frontmatter');

      const result = await identifyDecayCandidates();

      // Should still succeed (corrupted files logged but not fatal)
      expect(result.ok).toBe(true);
    });
  });
});
