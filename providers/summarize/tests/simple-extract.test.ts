import { describe, test, expect } from 'bun:test';
import { SimpleExtractProvider } from '../simple-extract';
import type { MemorySegment } from '../../../types/segment';

describe('providers/summarize/simple-extract.ts', () => {
  const provider = new SimpleExtractProvider();

  test('should extract summary and tags', async () => {
    const segment: MemorySegment = {
      id: 'seg_test',
      sessionId: 'mem_test',
      timestamp: Date.now(),
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: [],
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 100 },
      content: 'TypeScript is a strongly typed programming language. It helps catch errors early.'
    };

    const result = await provider.summarize(segment);

    expect(result.ok).toBe(true);
    expect(result.value.summary).toBeDefined();
    expect(result.value.summary).toContain('TypeScript');
    expect(result.value.tags.length).toBeGreaterThan(0);
    expect(result.value.tags).toContain('typescript');
  });

  test('should extract first sentence as summary', async () => {
    const segment: MemorySegment = {
      id: 'seg_test',
      sessionId: 'mem_test',
      timestamp: Date.now(),
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: [],
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 100 },
      content: 'This is the first sentence. This is the second sentence. This is the third.'
    };

    const result = await provider.summarize(segment);

    expect(result.ok).toBe(true);
    expect(result.value.summary).toBe('This is the first sentence.');
  });

  test('should handle text without sentence terminators', async () => {
    const segment: MemorySegment = {
      id: 'seg_test',
      sessionId: 'mem_test',
      timestamp: Date.now(),
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: [],
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 100 },
      content: 'This is a very long text without any sentence terminators that should be truncated to one hundred characters'
    };

    const result = await provider.summarize(segment);

    expect(result.ok).toBe(true);
    expect(result.value.summary).toBeDefined();
    expect(result.value.summary!.length).toBeLessThanOrEqual(103); // 100 + '...'
  });

  test('should extract keywords from capitalized words', async () => {
    const segment: MemorySegment = {
      id: 'seg_test',
      sessionId: 'mem_test',
      timestamp: Date.now(),
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: [],
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 100 },
      content: 'JavaScript and TypeScript are programming languages. Python is also popular.'
    };

    const result = await provider.summarize(segment);

    expect(result.ok).toBe(true);
    expect(result.value.tags.length).toBeGreaterThan(0);
    // Should extract capitalized technical terms
    const hasKeywords = result.value.tags.some(tag =>
      ['javascript', 'typescript', 'python'].includes(tag)
    );
    expect(hasKeywords).toBe(true);
  });

  test('should merge existing tags with extracted tags', async () => {
    const segment: MemorySegment = {
      id: 'seg_test',
      sessionId: 'mem_test',
      timestamp: Date.now(),
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: ['existing', 'tags'],
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 100 },
      content: 'TypeScript programming example.'
    };

    const result = await provider.summarize(segment);

    expect(result.ok).toBe(true);
    expect(result.value.tags).toContain('existing');
    expect(result.value.tags).toContain('tags');
  });

  test('should limit tags to 10 maximum', async () => {
    const segment: MemorySegment = {
      id: 'seg_test',
      sessionId: 'mem_test',
      timestamp: Date.now(),
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'],
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 100 },
      content: 'JavaScript TypeScript Python Rust GoLang Java Kotlin Swift Ruby Perl Haskell Scala'
    };

    const result = await provider.summarize(segment);

    expect(result.ok).toBe(true);
    expect(result.value.tags.length).toBeLessThanOrEqual(10);
  });

  test('should deduplicate tags', async () => {
    const segment: MemorySegment = {
      id: 'seg_test',
      sessionId: 'mem_test',
      timestamp: Date.now(),
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: ['typescript'],
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 100 },
      content: 'TypeScript TypeScript TypeScript'
    };

    const result = await provider.summarize(segment);

    expect(result.ok).toBe(true);
    // Should only have one 'typescript' tag
    const typescriptCount = result.value.tags.filter(t => t === 'typescript').length;
    expect(typescriptCount).toBe(1);
  });

  test('should handle empty content', async () => {
    const segment: MemorySegment = {
      id: 'seg_test',
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

    const result = await provider.summarize(segment);

    expect(result.ok).toBe(true);
    expect(result.value.summary).toBe('');
    expect(result.value.tags).toEqual([]);
  });
});
