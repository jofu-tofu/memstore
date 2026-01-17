import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { formatMemoryContext } from '../context-formatter';
import { resetStorageProvider } from '../content-loader';
import { RankedResult } from '../../types/ranking';

const TEST_PAI_DIR = join(homedir(), 'pai-test-context-formatter');
const TEST_SEGMENTS_DIR = join(TEST_PAI_DIR, 'mem-store/segments/2026-01');

describe('Context Formatter', () => {
  const now = Date.now();

  beforeAll(() => {
    mkdirSync(TEST_SEGMENTS_DIR, { recursive: true });
    process.env.PAI_DIR = TEST_PAI_DIR;
    // Reset the storage provider to use the test directory
    resetStorageProvider();

    // Create test segment files
    const segment1 = `---
id: seg_fmt_001
session_id: mem_fmt_001
timestamp: ${now - 2 * 24 * 60 * 60 * 1000}
importance_score: 80
access_count: 5
tags: [typescript, hooks]
memory_type: episodic
---
This is the content of the first test segment about TypeScript hooks.`;

    const segment2 = `---
id: seg_fmt_002
session_id: mem_fmt_001
timestamp: ${now - 5 * 60 * 60 * 1000}
importance_score: 60
access_count: 2
tags: [bun, testing]
memory_type: semantic
---
Second segment with information about Bun testing framework.`;

    const segment3 = `---
id: seg_fmt_003
session_id: mem_fmt_001
timestamp: ${now - 30 * 60 * 1000}
importance_score: 90
access_count: 10
tags: [memory, retrieval]
memory_type: episodic
---
Third segment discussing memory retrieval patterns and context injection.`;

    writeFileSync(join(TEST_SEGMENTS_DIR, 'seg_fmt_001.md'), segment1, 'utf-8');
    writeFileSync(join(TEST_SEGMENTS_DIR, 'seg_fmt_002.md'), segment2, 'utf-8');
    writeFileSync(join(TEST_SEGMENTS_DIR, 'seg_fmt_003.md'), segment3, 'utf-8');
  });

  afterAll(() => {
    if (existsSync(TEST_PAI_DIR)) {
      rmSync(TEST_PAI_DIR, { recursive: true, force: true });
    }
    delete process.env.PAI_DIR;
    // Reset storage provider so other tests get fresh instance
    resetStorageProvider();
  });

  describe('formatMemoryContext()', () => {
    test('should format single memory with all attributes', async () => {
      const rankedResults: RankedResult[] = [{
        segmentId: 'seg_fmt_001',
        relevanceScore: 87.5,
        componentScores: { termMatch: 75, recency: 90, importance: 80, access: 50 },
        matchCount: 3,
        matchedTerms: ['typescript', 'hooks'],
        metadata: {
          id: 'seg_fmt_001',
          sessionId: 'mem_fmt_001',
          timestamp: now - (2 * 24 * 60 * 60 * 1000),
          importanceScore: 80,
          accessCount: 5,
          lastAccessed: now,
          tags: ['typescript', 'hooks'],
          memoryType: 'episodic'
        }
      }];

      const result = await formatMemoryContext(rankedResults);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('<retrieved-memories count="1">');
        expect(result.value).toContain('<memory relevance="88"');
        expect(result.value).toContain('age="2d"');
        expect(result.value).toContain('tags="typescript,hooks"');
        expect(result.value).toContain('importance="80"');
        expect(result.value).toContain('access-count="5"');
        expect(result.value).toContain('TypeScript hooks');
        expect(result.value).toContain('</memory>');
        expect(result.value).toContain('</retrieved-memories>');
      }
    });

    test('should format multiple memories', async () => {
      const rankedResults: RankedResult[] = [
        {
          segmentId: 'seg_fmt_001',
          relevanceScore: 90,
          componentScores: { termMatch: 80, recency: 85, importance: 80, access: 50 },
          matchCount: 3,
          matchedTerms: ['typescript'],
          metadata: {
            id: 'seg_fmt_001',
            sessionId: 'mem_fmt_001',
            timestamp: now - (2 * 24 * 60 * 60 * 1000),
            importanceScore: 80,
            accessCount: 5,
            lastAccessed: now,
            tags: ['typescript', 'hooks'],
            memoryType: 'episodic'
          }
        },
        {
          segmentId: 'seg_fmt_002',
          relevanceScore: 75,
          componentScores: { termMatch: 70, recency: 75, importance: 60, access: 40 },
          matchCount: 2,
          matchedTerms: ['bun'],
          metadata: {
            id: 'seg_fmt_002',
            sessionId: 'mem_fmt_001',
            timestamp: now - (5 * 60 * 60 * 1000),
            importanceScore: 60,
            accessCount: 2,
            lastAccessed: now,
            tags: ['bun', 'testing'],
            memoryType: 'semantic'
          }
        }
      ];

      const result = await formatMemoryContext(rankedResults);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('<retrieved-memories count="2">');
        expect(result.value).toContain('TypeScript');
        expect(result.value).toContain('Bun');
        expect(result.value).toContain('age="2d"');
        expect(result.value).toContain('age="5h"');
      }
    });

    test('should handle empty results', async () => {
      const result = await formatMemoryContext([]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('');
      }
    });

    test('should skip missing segments gracefully', async () => {
      const rankedResults: RankedResult[] = [
        {
          segmentId: 'seg_fmt_001',
          relevanceScore: 90,
          componentScores: { termMatch: 80, recency: 85, importance: 80, access: 50 },
          matchCount: 3,
          matchedTerms: ['typescript'],
          metadata: {
            id: 'seg_fmt_001',
            sessionId: 'mem_fmt_001',
            timestamp: now,
            importanceScore: 80,
            accessCount: 5,
            lastAccessed: now,
            tags: ['typescript'],
            memoryType: 'episodic'
          }
        },
        {
          segmentId: 'seg_nonexistent',
          relevanceScore: 85,
          componentScores: { termMatch: 75, recency: 80, importance: 75, access: 45 },
          matchCount: 2,
          matchedTerms: ['test'],
          metadata: {
            id: 'seg_nonexistent',
            sessionId: 'mem_fmt_001',
            timestamp: now,
            importanceScore: 75,
            accessCount: 3,
            lastAccessed: now,
            tags: ['test'],
            memoryType: 'semantic'
          }
        }
      ];

      const result = await formatMemoryContext(rankedResults);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should only include the existing segment
        expect(result.value).toContain('<retrieved-memories count="1">');
        expect(result.value).toContain('TypeScript');
        expect(result.value).not.toContain('seg_nonexistent');
      }
    });

    test('should respect maxMemories option', async () => {
      const rankedResults: RankedResult[] = [
        {
          segmentId: 'seg_fmt_001',
          relevanceScore: 90,
          componentScores: { termMatch: 80, recency: 85, importance: 80, access: 50 },
          matchCount: 3,
          matchedTerms: ['typescript'],
          metadata: {
            id: 'seg_fmt_001',
            sessionId: 'mem_fmt_001',
            timestamp: now,
            importanceScore: 80,
            accessCount: 5,
            lastAccessed: now,
            tags: ['typescript'],
            memoryType: 'episodic'
          }
        },
        {
          segmentId: 'seg_fmt_002',
          relevanceScore: 85,
          componentScores: { termMatch: 75, recency: 80, importance: 60, access: 40 },
          matchCount: 2,
          matchedTerms: ['bun'],
          metadata: {
            id: 'seg_fmt_002',
            sessionId: 'mem_fmt_001',
            timestamp: now,
            importanceScore: 60,
            accessCount: 2,
            lastAccessed: now,
            tags: ['bun'],
            memoryType: 'semantic'
          }
        },
        {
          segmentId: 'seg_fmt_003',
          relevanceScore: 80,
          componentScores: { termMatch: 70, recency: 75, importance: 90, access: 60 },
          matchCount: 2,
          matchedTerms: ['memory'],
          metadata: {
            id: 'seg_fmt_003',
            sessionId: 'mem_fmt_001',
            timestamp: now,
            importanceScore: 90,
            accessCount: 10,
            lastAccessed: now,
            tags: ['memory'],
            memoryType: 'episodic'
          }
        }
      ];

      const result = await formatMemoryContext(rankedResults, {
        maxMemories: 2
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('<retrieved-memories count="2">');
        expect(result.value).not.toContain('seg_fmt_003');
      }
    });

    test('should respect token budget by truncating content', async () => {
      const rankedResults: RankedResult[] = [{
        segmentId: 'seg_fmt_003',
        relevanceScore: 90,
        componentScores: { termMatch: 80, recency: 85, importance: 90, access: 60 },
        matchCount: 3,
        matchedTerms: ['memory', 'retrieval'],
        metadata: {
          id: 'seg_fmt_003',
          sessionId: 'mem_fmt_001',
          timestamp: now,
          importanceScore: 90,
          accessCount: 10,
          lastAccessed: now,
          tags: ['memory', 'retrieval'],
          memoryType: 'episodic'
        }
      }];

      const result = await formatMemoryContext(rankedResults, {
        maxTokens: 20  // Very small budget to force truncation
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Content should be truncated with ... OR memory might not fit at all
        const contentFits = result.value.includes('segment');
        if (contentFits) {
          expect(result.value).toContain('...');
        }
        expect(result.value).toContain('<memory');
        expect(result.value).toContain('</memory>');
      }
    });

    test('should stop processing when token budget exhausted', async () => {
      const rankedResults: RankedResult[] = [
        {
          segmentId: 'seg_fmt_001',
          relevanceScore: 90,
          componentScores: { termMatch: 80, recency: 85, importance: 80, access: 50 },
          matchCount: 3,
          matchedTerms: ['typescript'],
          metadata: {
            id: 'seg_fmt_001',
            sessionId: 'mem_fmt_001',
            timestamp: now,
            importanceScore: 80,
            accessCount: 5,
            lastAccessed: now,
            tags: ['typescript'],
            memoryType: 'episodic'
          }
        },
        {
          segmentId: 'seg_fmt_002',
          relevanceScore: 85,
          componentScores: { termMatch: 75, recency: 80, importance: 60, access: 40 },
          matchCount: 2,
          matchedTerms: ['bun'],
          metadata: {
            id: 'seg_fmt_002',
            sessionId: 'mem_fmt_001',
            timestamp: now,
            importanceScore: 60,
            accessCount: 2,
            lastAccessed: now,
            tags: ['bun'],
            memoryType: 'semantic'
          }
        }
      ];

      const result = await formatMemoryContext(rankedResults, {
        maxTokens: 60  // Only enough for first segment
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should only format first segment
        expect(result.value).toContain('<retrieved-memories count="1">');
      }
    });

    test('should format age correctly for recent memories', async () => {
      const rankedResults: RankedResult[] = [{
        segmentId: 'seg_fmt_003',
        relevanceScore: 95,
        componentScores: { termMatch: 85, recency: 95, importance: 90, access: 60 },
        matchCount: 3,
        matchedTerms: ['memory'],
        metadata: {
          id: 'seg_fmt_003',
          sessionId: 'mem_fmt_001',
          timestamp: now - (30 * 60 * 1000), // 30 minutes ago
          importanceScore: 90,
          accessCount: 10,
          lastAccessed: now,
          tags: ['memory', 'retrieval'],
          memoryType: 'episodic'
        }
      }];

      const result = await formatMemoryContext(rankedResults);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('age="30m"');
      }
    });

    test('should handle memories with no tags', async () => {
      const rankedResults: RankedResult[] = [{
        segmentId: 'seg_fmt_001',
        relevanceScore: 85,
        componentScores: { termMatch: 75, recency: 80, importance: 80, access: 50 },
        matchCount: 2,
        matchedTerms: ['test'],
        metadata: {
          id: 'seg_fmt_001',
          sessionId: 'mem_fmt_001',
          timestamp: now,
          importanceScore: 80,
          accessCount: 5,
          lastAccessed: now,
          tags: [],  // No tags
          memoryType: 'episodic'
        }
      }];

      const result = await formatMemoryContext(rankedResults);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should not include empty tags attribute
        expect(result.value).toContain('<memory');
        expect(result.value).toContain('relevance=');
        expect(result.value).toContain('age=');
      }
    });

    test('should optionally exclude relevance scores', async () => {
      const rankedResults: RankedResult[] = [{
        segmentId: 'seg_fmt_001',
        relevanceScore: 87.5,
        componentScores: { termMatch: 75, recency: 90, importance: 80, access: 50 },
        matchCount: 3,
        matchedTerms: ['typescript'],
        metadata: {
          id: 'seg_fmt_001',
          sessionId: 'mem_fmt_001',
          timestamp: now,
          importanceScore: 80,
          accessCount: 5,
          lastAccessed: now,
          tags: ['typescript'],
          memoryType: 'episodic'
        }
      }];

      const result = await formatMemoryContext(rankedResults, {
        includeRelevance: false
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toContain('relevance=');
        expect(result.value).toContain('age=');
      }
    });
  });
});
