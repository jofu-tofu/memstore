/**
 * Tests for Memory Metadata Browser
 *
 * Story 4.2: Memory Metadata Browser
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import {
  listAllSessions,
  getSessionById,
  getSegmentMetadata,
  findSegmentsByTag,
  getTagIndex,
  formatSessionList,
  formatSegmentMetadata,
  formatTagIndex,
  type SessionMeta,
  type TagIndex,
} from '../metadata-browser';

describe('MetadataBrowser', () => {
  let testMemstoreDir: string;
  let testMemStore: string;

  beforeEach(() => {
    // Create isolated test directory
    testMemstoreDir = join(homedir(), '.memstore-test-metadata-browser');
    testMemStore = join(testMemstoreDir, 'mem-store');

    mkdirSync(join(testMemStore, 'structured'), { recursive: true });
    mkdirSync(join(testMemStore, 'segments', '2024-01'), { recursive: true });
    mkdirSync(join(testMemStore, 'indexes', 'keyword'), { recursive: true });

    process.env.MEMSTORE_DIR = testMemstoreDir;
  });

  afterEach(() => {
    // ALWAYS clean up
    delete process.env.MEMSTORE_DIR;

    // Clean up test directory with retry for Windows file handle issues
    if (existsSync(testMemstoreDir)) {
      try {
        rmSync(testMemstoreDir, { recursive: true, force: true });
      } catch (error) {
        // Retry once after a brief delay (Windows may have file handles open)
        setTimeout(() => {
          try {
            if (existsSync(testMemstoreDir)) {
              rmSync(testMemstoreDir, { recursive: true, force: true });
            }
          } catch (retryError) {
            // Ignore cleanup errors - test directory will be cleaned up next run
            console.warn(`Failed to clean up test directory: ${testMemstoreDir}`);
          }
        }, 100);
      }
    }
  });

  describe('listAllSessions', () => {
    test('should return error when registry file missing', () => {
      const result = listAllSessions();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('REGISTRY_NOT_FOUND');
      }
    });

    test('should return all sessions when registry exists', () => {
      const registry = {
        sessions: {
          mem_001: {
            sessionId: 'mem_1704900000000_a1b2c3d4',
            capturedAt: 1704900000000,
            segmentCount: 5,
            tags: ['typescript', 'memory'],
            archived: false,
          },
          mem_002: {
            sessionId: 'mem_1704910000000_b2c3d4e5',
            capturedAt: 1704910000000,
            segmentCount: 3,
            tags: ['bun'],
            archived: false,
          },
        },
      };

      writeFileSync(
        join(testMemStore, 'structured', 'session-registry.json'),
        JSON.stringify(registry)
      );

      const result = listAllSessions();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(2);
        expect(result.value[0].sessionId).toBe('mem_1704900000000_a1b2c3d4');
        expect(result.value[0].segmentCount).toBe(5);
        expect(result.value[0].tags).toEqual(['typescript', 'memory']);
        expect(result.value[1].sessionId).toBe('mem_1704910000000_b2c3d4e5');
      }
    });

    test('should handle empty sessions object gracefully', () => {
      const registry = { sessions: {} };

      writeFileSync(
        join(testMemStore, 'structured', 'session-registry.json'),
        JSON.stringify(registry)
      );

      const result = listAllSessions();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(0);
      }
    });

    test('should return error when registry JSON is malformed', () => {
      writeFileSync(
        join(testMemStore, 'structured', 'session-registry.json'),
        '{ invalid json'
      );

      const result = listAllSessions();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('REGISTRY_READ_FAILED');
      }
    });
  });

  describe('getSessionById', () => {
    beforeEach(() => {
      const registry = {
        sessions: {
          mem_001: {
            sessionId: 'mem_1704900000000_a1b2c3d4',
            capturedAt: 1704900000000,
            segmentCount: 5,
            tags: ['typescript'],
            archived: false,
          },
        },
      };

      writeFileSync(
        join(testMemStore, 'structured', 'session-registry.json'),
        JSON.stringify(registry)
      );
    });

    test('should return session when ID exists', () => {
      const result = getSessionById('mem_1704900000000_a1b2c3d4');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toBeNull();
        expect(result.value!.sessionId).toBe('mem_1704900000000_a1b2c3d4');
        expect(result.value!.segmentCount).toBe(5);
      }
    });

    test('should return null when ID does not exist', () => {
      const result = getSessionById('mem_nonexistent');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    test('should return error when registry missing', () => {
      rmSync(join(testMemStore, 'structured', 'session-registry.json'));

      const result = getSessionById('mem_1704900000000_a1b2c3d4');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('REGISTRY_NOT_FOUND');
      }
    });
  });

  describe('getSegmentMetadata', () => {
    test('should return segment metadata when segment exists', () => {
      const segmentContent = `---
id: seg_1704900000000_f1e2d3c4
session_id: mem_1704900000000_e5f6g7h8
timestamp: 1704900000000
importance_score: 75
access_count: 5
last_accessed: 1704920000000
tags:
  - typescript
  - testing
memory_type: episodic
source_range:
  start: 0
  end: 250
---
This is test segment content.
`;

      writeFileSync(
        join(testMemStore, 'segments', '2024-01', 'seg_1704900000000_f1e2d3c4.md'),
        segmentContent
      );

      const result = getSegmentMetadata('seg_1704900000000_f1e2d3c4');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('seg_1704900000000_f1e2d3c4');
        expect(result.value.sessionId).toBe('mem_1704900000000_e5f6g7h8');
        expect(result.value.importanceScore).toBe(75);
        expect(result.value.accessCount).toBe(5);
        expect(result.value.tags).toEqual(['typescript', 'testing']);
        expect(result.value.memoryType).toBe('episodic');
        expect(result.value.content).toBe('This is test segment content.\n');
      }
    });

    test('should return error when segment not found', () => {
      const result = getSegmentMetadata('seg_1704900000000_deadbeef');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SEGMENT_NOT_FOUND');
      }
    });

    test('should return error when segment ID is invalid', () => {
      const result = getSegmentMetadata('invalid_id_format');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_SEGMENT_ID');
      }
    });

    test('should return error when segment ID contains path traversal', () => {
      const result = getSegmentMetadata('seg_1704900000000_../../../etc/passwd');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_SEGMENT_ID');
      }
    });

    test('should accept segment ID with valid hex characters', () => {
      const segmentContent = `---
id: seg_1704900000000_abcdef123456
session_id: mem_1704900000000_e5f6g7h8
timestamp: 1704900000000
importance_score: 50
access_count: 0
last_accessed: null
tags: []
memory_type: episodic
source_range:
  start: 0
  end: 100
---
Test content
`;

      writeFileSync(
        join(testMemStore, 'segments', '2024-01', 'seg_1704900000000_abcdef123456.md'),
        segmentContent
      );

      const result = getSegmentMetadata('seg_1704900000000_abcdef123456');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('seg_1704900000000_abcdef123456');
      }
    });

    test('should reject segment ID with invalid characters (uppercase outside hex range)', () => {
      const result = getSegmentMetadata('seg_1704900000000_GHIJKL');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_SEGMENT_ID');
      }
    });

    test('should handle segment with empty frontmatter gracefully', () => {
      // Test that empty/minimal frontmatter is handled gracefully
      const minimalContent = `---
---
Content with no frontmatter fields
`;

      writeFileSync(
        join(testMemStore, 'segments', '2024-01', 'seg_1704900000000_abc12345.md'),
        minimalContent
      );

      const result = getSegmentMetadata('seg_1704900000000_abc12345');

      // This should succeed but have empty/undefined fields
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe('Content with no frontmatter fields\n');
      }
    });
  });

  describe('findSegmentsByTag', () => {
    beforeEach(() => {
      const index: TagIndex = {
        typescript: ['seg_001', 'seg_042', 'seg_089'],
        memory: ['seg_001', 'seg_023'],
        bun: ['seg_042'],
      };

      writeFileSync(
        join(testMemStore, 'indexes', 'keyword', 'index.json'),
        JSON.stringify(index)
      );
    });

    test('should return segment IDs when tag exists', () => {
      const result = findSegmentsByTag('typescript');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(['seg_001', 'seg_042', 'seg_089']);
      }
    });

    test('should return empty array when tag does not exist', () => {
      const result = findSegmentsByTag('nonexistent');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    test('should return error when tag is empty string', () => {
      const result = findSegmentsByTag('');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_TAG');
      }
    });

    test('should return error when tag is whitespace only', () => {
      const result = findSegmentsByTag('   ');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_TAG');
      }
    });

    test('should return error when keyword index missing', () => {
      rmSync(join(testMemStore, 'indexes', 'keyword', 'index.json'));

      const result = findSegmentsByTag('typescript');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INDEX_NOT_FOUND');
      }
    });

    test('should return error when keyword index JSON is malformed', () => {
      writeFileSync(
        join(testMemStore, 'indexes', 'keyword', 'index.json'),
        '{ bad json'
      );

      const result = findSegmentsByTag('typescript');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INDEX_READ_FAILED');
      }
    });
  });

  describe('getTagIndex', () => {
    test('should return full tag index when exists', () => {
      const index: TagIndex = {
        typescript: ['seg_001', 'seg_042'],
        memory: ['seg_001'],
        bun: ['seg_042', 'seg_089'],
      };

      writeFileSync(
        join(testMemStore, 'indexes', 'keyword', 'index.json'),
        JSON.stringify(index)
      );

      const result = getTagIndex();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Object.keys(result.value).length).toBe(3);
        expect(result.value.typescript).toEqual(['seg_001', 'seg_042']);
        expect(result.value.memory).toEqual(['seg_001']);
        expect(result.value.bun).toEqual(['seg_042', 'seg_089']);
      }
    });

    test('should return error when index missing', () => {
      const result = getTagIndex();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INDEX_NOT_FOUND');
      }
    });

    test('should return error when index JSON is malformed', () => {
      writeFileSync(
        join(testMemStore, 'indexes', 'keyword', 'index.json'),
        'not valid json'
      );

      const result = getTagIndex();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INDEX_READ_FAILED');
      }
    });
  });

  describe('formatSessionList', () => {
    test('should format session list correctly', () => {
      const sessions: SessionMeta[] = [
        {
          sessionId: 'mem_1704900000000_a1b2c3d4',
          capturedAt: 1704900000000,
          segmentCount: 5,
          tags: ['typescript', 'memory'],
          archived: false,
        },
        {
          sessionId: 'mem_1704910000000_b2c3d4e5',
          capturedAt: 1704910000000,
          segmentCount: 3,
          tags: [],
          archived: true,
        },
      ];

      const formatted = formatSessionList(sessions);

      expect(formatted).toContain('Session ID');
      expect(formatted).toContain('Captured At');
      expect(formatted).toContain('mem_1704900000000_a1b2c3d4');
      expect(formatted).toContain('mem_1704910000000_b2c3d4e5');
      expect(formatted).toContain('typescript');
      expect(formatted).toContain('Yes'); // archived
      expect(formatted).toContain('No'); // not archived
    });

    test('should handle empty sessions array', () => {
      const formatted = formatSessionList([]);

      expect(formatted).toBe('No sessions found.');
    });
  });

  describe('formatSegmentMetadata', () => {
    test('should format segment metadata correctly', () => {
      const segment = {
        id: 'seg_1704900000000_f1e2d3c4',
        sessionId: 'mem_1704900000000_e5f6g7h8',
        timestamp: 1704900000000,
        importanceScore: 75,
        accessCount: 5,
        lastAccessed: 1704920000000,
        tags: ['typescript', 'testing'],
        memoryType: 'episodic' as const,
        sourceRange: { start: 0, end: 250 },
        content: 'Test content',
      };

      const formatted = formatSegmentMetadata(segment);

      expect(formatted).toContain('Segment Metadata');
      expect(formatted).toContain('seg_1704900000000_f1e2d3c4');
      expect(formatted).toContain('mem_1704900000000_e5f6g7h8');
      expect(formatted).toContain('episodic');
      expect(formatted).toContain('75');
      expect(formatted).toContain('5');
      expect(formatted).toContain('typescript, testing');
      expect(formatted).toContain('0 - 250');
    });

    test('should handle segment with no tags', () => {
      const segment = {
        id: 'seg_1704900000000_f1e2d3c4',
        sessionId: 'mem_1704900000000_e5f6g7h8',
        timestamp: 1704900000000,
        importanceScore: 50,
        accessCount: 0,
        lastAccessed: null,
        tags: [],
        memoryType: 'semantic' as const,
        sourceRange: { start: 0, end: 100 },
        content: 'Test',
      };

      const formatted = formatSegmentMetadata(segment);

      expect(formatted).toContain('None');
      expect(formatted).toContain('Never');
    });
  });

  describe('formatTagIndex', () => {
    test('should format tag index correctly', () => {
      const index: TagIndex = {
        typescript: ['seg_001', 'seg_042', 'seg_089'],
        memory: ['seg_001', 'seg_023'],
        bun: ['seg_042'],
      };

      const formatted = formatTagIndex(index);

      expect(formatted).toContain('Tag');
      expect(formatted).toContain('Count');
      expect(formatted).toContain('typescript');
      expect(formatted).toContain('memory');
      expect(formatted).toContain('bun');
      expect(formatted).toContain('3'); // typescript count
      expect(formatted).toContain('2'); // memory count
      expect(formatted).toContain('1'); // bun count
    });

    test('should handle empty tag index', () => {
      const formatted = formatTagIndex({});

      expect(formatted).toBe('No tags found in index.');
    });

    test('should sort tags by count descending', () => {
      const index: TagIndex = {
        'tag-a': ['seg_001'],
        'tag-b': ['seg_001', 'seg_002', 'seg_003'],
        'tag-c': ['seg_001', 'seg_002'],
      };

      const formatted = formatTagIndex(index);

      // 'tag-b' should appear before 'tag-c' and 'tag-a' (sorted by count desc)
      const bIndex = formatted.indexOf('tag-b');
      const cIndex = formatted.indexOf('tag-c');
      const aIndex = formatted.indexOf('tag-a');

      expect(bIndex).toBeLessThan(cIndex);
      expect(cIndex).toBeLessThan(aIndex);
    });
  });

  describe('Integration Test', () => {
    test('should work end-to-end with realistic data', () => {
      // Set up realistic test data
      const registry = {
        sessions: {
          mem_001: {
            sessionId: 'mem_1704900000000_a1b2c3d4',
            capturedAt: 1704900000000,
            segmentCount: 2,
            tags: ['typescript', 'memory'],
            archived: false,
          },
        },
      };

      const segmentContent = `---
id: seg_1704900000000_f1e2d3c4
session_id: mem_1704900000000_a1b2c3d4
timestamp: 1704900000000
importance_score: 80
access_count: 3
last_accessed: 1704920000000
tags:
  - typescript
  - memory
memory_type: episodic
source_range:
  start: 0
  end: 500
---
This is a realistic segment content about TypeScript and memory system implementation.
`;

      const index: TagIndex = {
        typescript: ['seg_1704900000000_f1e2d3c4'],
        memory: ['seg_1704900000000_f1e2d3c4'],
      };

      writeFileSync(
        join(testMemStore, 'structured', 'session-registry.json'),
        JSON.stringify(registry)
      );

      writeFileSync(
        join(testMemStore, 'segments', '2024-01', 'seg_1704900000000_f1e2d3c4.md'),
        segmentContent
      );

      writeFileSync(
        join(testMemStore, 'indexes', 'keyword', 'index.json'),
        JSON.stringify(index)
      );

      // Test complete workflow
      const sessionsResult = listAllSessions();
      expect(sessionsResult.ok).toBe(true);
      if (sessionsResult.ok) {
        expect(sessionsResult.value.length).toBe(1);
      }

      const sessionResult = getSessionById('mem_1704900000000_a1b2c3d4');
      expect(sessionResult.ok).toBe(true);
      if (sessionResult.ok) {
        expect(sessionResult.value).not.toBeNull();
      }

      const segmentResult = getSegmentMetadata('seg_1704900000000_f1e2d3c4');
      expect(segmentResult.ok).toBe(true);
      if (segmentResult.ok) {
        expect(segmentResult.value.id).toBe('seg_1704900000000_f1e2d3c4');
        expect(segmentResult.value.tags).toEqual(['typescript', 'memory']);
      }

      const tagResult = findSegmentsByTag('typescript');
      expect(tagResult.ok).toBe(true);
      if (tagResult.ok) {
        expect(tagResult.value).toEqual(['seg_1704900000000_f1e2d3c4']);
      }

      const indexResult = getTagIndex();
      expect(indexResult.ok).toBe(true);
      if (indexResult.ok) {
        expect(Object.keys(indexResult.value).length).toBe(2);
      }
    });
  });
});
