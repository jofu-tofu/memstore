import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import {
  readSegment,
  readSessionSegments,
  getSegmentPath
} from '../segment-reader';
import type { MemorySegment } from '../../types';

describe('SegmentReader', () => {
  let testMemstoreDir: string;

  beforeEach(() => {
    // Create isolated test directory
    testMemstoreDir = join(homedir(), '.memstore-test-segment-reader');
    mkdirSync(testMemstoreDir, { recursive: true });
    process.env.MEMSTORE_DIR = testMemstoreDir;

    // Create test segments in date-based structure
    const segmentsDir2026_01 = join(testMemstoreDir, 'mem-store', 'segments', '2026-01');
    const segmentsDir2026_02 = join(testMemstoreDir, 'mem-store', 'segments', '2026-02');
    mkdirSync(segmentsDir2026_01, { recursive: true });
    mkdirSync(segmentsDir2026_02, { recursive: true });

    // Create test segment 1 (January 2026)
    // Timestamp: 2026-01-15 (1768867200000 is Jan 15, 2026)
    const segment1 = `---
id: seg_1768867200000_a1b2c3d4
session_id: mem_1768867200000_abcdef12
timestamp: 1768867200000
importance_score: 75
access_count: 5
last_accessed: 1768953600000
tags:
  - typescript
  - hooks
memory_type: episodic
source_range:
  start: 0
  end: 1200
---
This is test segment 1 content.
User asked about TypeScript hooks.`;
    writeFileSync(join(segmentsDir2026_01, 'seg_1768867200000_a1b2c3d4.md'), segment1);

    // Create test segment 2 (January 2026, same session as segment 1)
    // Timestamp: 2026-01-18 (1769126400000)
    const segment2 = `---
id: seg_1769126400000_e5f6abcd
session_id: mem_1768867200000_abcdef12
timestamp: 1769126400000
importance_score: 50
access_count: 0
last_accessed: null
tags:
  - memory
memory_type: semantic
source_range:
  start: 1200
  end: 2000
---
This is test segment 2 content.
Additional context from same session.`;
    writeFileSync(join(segmentsDir2026_01, 'seg_1769126400000_e5f6abcd.md'), segment2);

    // Create test segment 3 (February 2026, different session)
    // Timestamp: 2026-02-10 (1770777600000)
    const segment3 = `---
id: seg_1770777600000_12345678
session_id: mem_1770777600000_abcd1234
timestamp: 1770777600000
importance_score: 90
access_count: 10
last_accessed: 1770864000000
tags:
  - auth
  - security
memory_type: procedural
source_range:
  start: 0
  end: 800
---
This is test segment 3 content.
Authentication implementation guide.`;
    writeFileSync(join(segmentsDir2026_02, 'seg_1770777600000_12345678.md'), segment3);
  });

  afterEach(() => {
    // ALWAYS clean up
    if (existsSync(testMemstoreDir)) {
      rmSync(testMemstoreDir, { recursive: true, force: true });
    }
    delete process.env.MEMSTORE_DIR;
  });

  describe('getSegmentPath', () => {
    test('should return correct path for valid segment ID', () => {
      // Arrange
      const segmentId = 'seg_1768867200000_a1b2c3d4';

      // Act
      const result = getSegmentPath(segmentId);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('2026-01');
        expect(result.value).toContain('seg_1768867200000_a1b2c3d4.md');
      }
    });

    test('should return error for invalid segment ID format', () => {
      // Arrange
      const segmentId = 'invalid_id';

      // Act
      const result = getSegmentPath(segmentId);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('QUERY_INVALID_PARAMS');
      }
    });

    test('should handle path traversal attempts gracefully', () => {
      // Arrange
      const segmentId = 'seg_1768867200000_../../etc/passwd';

      // Act
      const result = getSegmentPath(segmentId);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('QUERY_INVALID_PARAMS');
      }
    });

    test('should reject segment ID with uppercase hex', () => {
      // Arrange
      const segmentId = 'seg_1768867200000_A1B2C3D4'; // Uppercase not allowed

      // Act
      const result = getSegmentPath(segmentId);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('QUERY_INVALID_PARAMS');
        expect(result.error.message).toContain('expected: seg_{timestamp}_{8hex}');
      }
    });

    test('should reject segment ID with wrong prefix', () => {
      // Arrange
      const segmentId = 'mem_1768867200000_a1b2c3d4'; // Wrong prefix

      // Act
      const result = getSegmentPath(segmentId);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('QUERY_INVALID_PARAMS');
      }
    });

    test('should reject segment ID with too short hex', () => {
      // Arrange
      const segmentId = 'seg_1768867200000_a1b2'; // Only 4 hex chars instead of 8

      // Act
      const result = getSegmentPath(segmentId);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('QUERY_INVALID_PARAMS');
      }
    });

    test('should reject segment ID with non-hex characters', () => {
      // Arrange
      const segmentId = 'seg_1768867200000_xxxxxxxx'; // x is not valid hex

      // Act
      const result = getSegmentPath(segmentId);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('QUERY_INVALID_PARAMS');
      }
    });
  });

  describe('readSegment', () => {
    test('should read and parse segment when file exists', () => {
      // Arrange
      const segmentId = 'seg_1768867200000_a1b2c3d4';

      // Act
      const result = readSegment(segmentId);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('seg_1768867200000_a1b2c3d4');
        expect(result.value.sessionId).toBe('mem_1768867200000_abcdef12');
        expect(result.value.timestamp).toBe(1768867200000);
        expect(result.value.importanceScore).toBe(75);
        expect(result.value.accessCount).toBe(5);
        expect(result.value.lastAccessed).toBe(1768953600000);
        expect(result.value.tags).toEqual(['typescript', 'hooks']);
        expect(result.value.memoryType).toBe('episodic');
        expect(result.value.sourceRange).toEqual({ start: 0, end: 1200 });
        expect(result.value.content).toContain('This is test segment 1 content');
      }
    });

    test('should handle missing segment file gracefully', () => {
      // Arrange
      const segmentId = 'seg_1768867200000_99999999'; // Valid format but doesn't exist

      // Act
      const result = readSegment(segmentId);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('QUERY_SEGMENT_NOT_FOUND');
      }
    });

    test('should handle corrupted segment frontmatter gracefully', () => {
      // Arrange
      const segmentId = 'seg_1700000000000_abcdef12'; // Valid format for Nov 2023
      const segmentsDir = join(testMemstoreDir, 'mem-store', 'segments', '2023-11');
      mkdirSync(segmentsDir, { recursive: true });

      // Create actually corrupt YAML (unclosed brackets, tabs/spaces mixing, invalid structure)
      const corruptSegment = `---
id: seg_1700000000000_abcdef12
session_id: [unclosed array
timestamp: "not a number
---
Content`;
      writeFileSync(join(segmentsDir, 'seg_1700000000000_abcdef12.md'), corruptSegment);

      // Act
      const result = readSegment(segmentId);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('QUERY_SEGMENT_CORRUPT');
      }
    });

    test('should handle null values in frontmatter correctly', () => {
      // Arrange
      const segmentId = 'seg_1769126400000_e5f6abcd';

      // Act
      const result = readSegment(segmentId);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.lastAccessed).toBeNull();
      }
    });
  });

  describe('readSessionSegments', () => {
    test('should return all segments from session when querying by sessionId', () => {
      // Arrange
      const sessionId = 'mem_1768867200000_abcdef12';

      // Act
      const result = readSessionSegments(sessionId);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value.every(s => s.sessionId === sessionId)).toBe(true);

        // Check both segments are present
        const ids = result.value.map(s => s.id);
        expect(ids).toContain('seg_1768867200000_a1b2c3d4');
        expect(ids).toContain('seg_1769126400000_e5f6abcd');
      }
    });

    test('should return empty array when no segments found for session', () => {
      // Arrange
      const sessionId = 'mem_1999999999999_99999999'; // Valid format but no segments

      // Act
      const result = readSessionSegments(sessionId);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });

    test('should scan all date folders for session segments', () => {
      // Arrange
      const sessionId = 'mem_1770777600000_abcd1234';

      // Act
      const result = readSessionSegments(sessionId);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].id).toBe('seg_1770777600000_12345678');
      }
    });

    test('should handle invalid session ID format gracefully', () => {
      // Arrange
      const sessionId = 'invalid_session_format';

      // Act
      const result = readSessionSegments(sessionId);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('QUERY_INVALID_PARAMS');
        expect(result.error.message).toContain('expected: mem_{timestamp}_{8hex}');
      }
    });

    test('should reject session ID with wrong prefix', () => {
      // Arrange
      const sessionId = 'seg_1768867200000_abcdef12'; // seg instead of mem

      // Act
      const result = readSessionSegments(sessionId);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('QUERY_INVALID_PARAMS');
      }
    });

    test('should reject session ID with uppercase hex', () => {
      // Arrange
      const sessionId = 'mem_1768867200000_ABCDEF12'; // Uppercase not allowed

      // Act
      const result = readSessionSegments(sessionId);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('QUERY_INVALID_PARAMS');
      }
    });

    test('should reject session ID with path traversal', () => {
      // Arrange
      const sessionId = 'mem_1768867200000_../../../etc/passwd';

      // Act
      const result = readSessionSegments(sessionId);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('QUERY_INVALID_PARAMS');
      }
    });

    test('should skip corrupted segment files when scanning session', () => {
      // Arrange
      const sessionId = 'mem_1768867200000_abcdef12';

      // Add corrupted segment to same session
      const segmentsDir = join(testMemstoreDir, 'mem-store', 'segments', '2026-01');
      const corruptSegment = `---
id: seg_corrupt
session_id: mem_1768867200000_abcdef12
invalid yaml {{{{
---`;
      writeFileSync(join(segmentsDir, 'seg_corrupt.md'), corruptSegment);

      // Act
      const result = readSessionSegments(sessionId);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should still return the 2 valid segments, skip the corrupted one
        expect(result.value).toHaveLength(2);
        expect(result.value.every(s => s.sessionId === sessionId)).toBe(true);
      }
    });
  });
});
