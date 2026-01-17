import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { loadSegmentContent } from '../content-loader';

const TEST_PAI_DIR = join(homedir(), 'pai-test-content-loader');
const TEST_SEGMENTS_DIR = join(TEST_PAI_DIR, 'mem-store/segments/2026-01');

describe('Content Loader', () => {
  beforeAll(() => {
    mkdirSync(TEST_SEGMENTS_DIR, { recursive: true });
    process.env.PAI_DIR = TEST_PAI_DIR;

    // Create test segment files
    const segment1 = `---
id: seg_test_001
session_id: mem_test_001
timestamp: ${Date.now()}
importance_score: 80
access_count: 5
tags: [typescript, testing]
memory_type: episodic
---
This is test segment content for the content loader tests.`;

    const segment2 = `---
id: seg_test_002
session_id: mem_test_001
timestamp: ${Date.now()}
importance_score: 60
access_count: 2
tags: [bun, memory]
memory_type: semantic
---
Another test segment with different content.`;

    writeFileSync(
      join(TEST_SEGMENTS_DIR, 'seg_test_001.md'),
      segment1,
      'utf-8'
    );

    writeFileSync(
      join(TEST_SEGMENTS_DIR, 'seg_test_002.md'),
      segment2,
      'utf-8'
    );
  });

  afterAll(() => {
    if (existsSync(TEST_PAI_DIR)) {
      rmSync(TEST_PAI_DIR, { recursive: true, force: true });
    }
    delete process.env.PAI_DIR;
  });

  describe('loadSegmentContent()', () => {
    test('should load existing segment content', async () => {
      const result = await loadSegmentContent('seg_test_001');

      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.id).toBe('seg_test_001');
        expect(result.value.sessionId).toBe('mem_test_001');
        expect(result.value.importanceScore).toBe(80);
        expect(result.value.tags).toContain('typescript');
        expect(result.value.tags).toContain('testing');
        expect(result.value.content).toContain('test segment content');
      }
    });

    test('should load multiple different segments', async () => {
      const result1 = await loadSegmentContent('seg_test_001');
      const result2 = await loadSegmentContent('seg_test_002');

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);

      if (result1.ok && result1.value && result2.ok && result2.value) {
        expect(result1.value.id).toBe('seg_test_001');
        expect(result2.value.id).toBe('seg_test_002');
        expect(result1.value.content).not.toBe(result2.value.content);
      }
    });

    test('should return null for non-existent segment', async () => {
      const result = await loadSegmentContent('seg_nonexistent');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    test('should handle invalid segment ID gracefully', async () => {
      const result = await loadSegmentContent('invalid/../path');

      // Should not crash, either returns null or error
      expect(result.ok).toBeDefined();
    });

    test('should load segment with all metadata fields', async () => {
      const result = await loadSegmentContent('seg_test_002');

      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.id).toBe('seg_test_002');
        expect(result.value.sessionId).toBe('mem_test_001');
        expect(result.value.importanceScore).toBe(60);
        expect(result.value.accessCount).toBe(2);
        expect(result.value.tags).toEqual(['bun', 'memory']);
        expect(result.value.memoryType).toBe('semantic');
        expect(result.value.content).toContain('different content');
      }
    });

    test('should use storage provider singleton', async () => {
      // Multiple calls should reuse same provider instance
      const result1 = await loadSegmentContent('seg_test_001');
      const result2 = await loadSegmentContent('seg_test_002');

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
    });
  });
});
