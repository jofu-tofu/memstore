import { describe, test, expect, beforeAll } from 'bun:test';
import { KeywordTaggerProvider } from '../keyword-tagger';
import type { MemorySegment } from '../../../types/segment';

describe('providers/extract/keyword-tagger.ts', () => {
  let provider: KeywordTaggerProvider;

  beforeAll(async () => {
    provider = new KeywordTaggerProvider();
    const initResult = await provider.initialize();
    expect(initResult.ok).toBe(true);
  });

  test('should extract keywords from segment content', async () => {
    const segment: MemorySegment = {
      id: 'seg_test_001',
      sessionId: 'mem_test',
      timestamp: Date.now(),
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: [],
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 100 },
      content: 'TypeScript useState useEffect implementation for React hooks'
    };

    const result = await provider.extract(segment);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tags).toContain('TypeScript');
      expect(result.value.tags).toContain('useState');
      expect(result.value.tags).toContain('useEffect');
      expect(result.value.tags).toContain('React');
    }
  });

  test('should merge with existing tags from other providers', async () => {
    const segment: MemorySegment = {
      id: 'seg_test_002',
      sessionId: 'mem_test',
      timestamp: Date.now(),
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: ['existing-tag', 'another-tag'],  // From simple-extract
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 100 },
      content: 'TypeScript implementation details'
    };

    const result = await provider.extract(segment);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Existing tags preserved
      expect(result.value.tags).toContain('existing-tag');
      expect(result.value.tags).toContain('another-tag');

      // New keywords added
      expect(result.value.tags).toContain('TypeScript');
      expect(result.value.tags).toContain('implementation');
    }
  });

  test('should limit total tags to 10', async () => {
    const segment: MemorySegment = {
      id: 'seg_test_003',
      sessionId: 'mem_test',
      timestamp: Date.now(),
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'],  // 5 existing
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 100 },
      content: 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda'
    };

    const result = await provider.extract(segment);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tags.length).toBeLessThanOrEqual(10);

      // Existing tags should be prioritized
      expect(result.value.tags).toContain('tag1');
      expect(result.value.tags).toContain('tag2');
    }
  });

  test('should handle empty content gracefully', async () => {
    const segment: MemorySegment = {
      id: 'seg_test_004',
      sessionId: 'mem_test',
      timestamp: Date.now(),
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: [],
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 0 },
      content: ''
    };

    const result = await provider.extract(segment);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tags).toEqual([]);
    }
  });

  test('should handle whitespace-only content', async () => {
    const segment: MemorySegment = {
      id: 'seg_test_005',
      sessionId: 'mem_test',
      timestamp: Date.now(),
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: ['existing'],
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 5 },
      content: '   \n\t  '
    };

    const result = await provider.extract(segment);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Existing tags preserved, no new keywords added
      expect(result.value.tags).toEqual(['existing']);
    }
  });

  test('should preserve programming identifiers with correct casing', async () => {
    const segment: MemorySegment = {
      id: 'seg_test_006',
      sessionId: 'mem_test',
      timestamp: Date.now(),
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: [],
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 100 },
      content: 'camelCase PascalCase snake_case SCREAMING_SNAKE_CASE'
    };

    const result = await provider.extract(segment);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tags).toContain('camelCase');
      expect(result.value.tags).toContain('PascalCase');
      expect(result.value.tags).toContain('snake_case');
      expect(result.value.tags).toContain('SCREAMING_SNAKE_CASE');
    }
  });

  test('should recognize file paths', async () => {
    const segment: MemorySegment = {
      id: 'seg_test_007',
      sessionId: 'mem_test',
      timestamp: Date.now(),
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: [],
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 100 },
      content: 'Modified src/providers/extract/keyword-tagger.ts file'
    };

    const result = await provider.extract(segment);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tags.some(t => t.includes('keyword-tagger.ts'))).toBe(true);
    }
  });

  test('should filter stop words', async () => {
    const segment: MemorySegment = {
      id: 'seg_test_008',
      sessionId: 'mem_test',
      timestamp: Date.now(),
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: [],
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 100 },
      content: 'the quick brown fox jumps over the lazy dog'
    };

    const result = await provider.extract(segment);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tags).not.toContain('the');
      expect(result.value.tags).not.toContain('over');
      expect(result.value.tags).toContain('quick');
      expect(result.value.tags).toContain('brown');
    }
  });

  test('should have correct provider metadata', () => {
    expect(provider.name).toBe('keyword-tagger');
    expect(provider.version).toBe('1.0.0');
  });

  test('should pass health check', async () => {
    const health = await provider.healthCheck();
    expect(health.healthy).toBe(true);
  });

  test('should handle shutdown gracefully', async () => {
    const shutdownProvider = new KeywordTaggerProvider();
    await shutdownProvider.initialize();

    // Should not throw
    await expect(shutdownProvider.shutdown()).resolves.toBeUndefined();
  });

  test('should prevent duplicate tags', async () => {
    const segment: MemorySegment = {
      id: 'seg_test_009',
      sessionId: 'mem_test',
      timestamp: Date.now(),
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: ['TypeScript', 'implementation'],  // Already exist
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 100 },
      content: 'TypeScript implementation details about TypeScript features'
    };

    const result = await provider.extract(segment);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Count occurrences of 'TypeScript'
      const typescriptCount = result.value.tags.filter(t => t === 'TypeScript').length;
      expect(typescriptCount).toBe(1);  // No duplicates

      const implCount = result.value.tags.filter(t => t === 'implementation').length;
      expect(implCount).toBe(1);  // No duplicates
    }
  });
});
