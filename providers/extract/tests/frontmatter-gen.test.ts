import { describe, test, expect } from 'bun:test';
import { FrontmatterGenProvider } from '../frontmatter-gen';
import type { MemorySegment } from '../../../types/segment';

describe('providers/extract/frontmatter-gen.ts', () => {
  const provider = new FrontmatterGenProvider();

  test('should generate frontmatter with all required fields', async () => {
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
      content: 'Test content'
    };

    const result = await provider.extract(segment);

    expect(result.ok).toBe(true);
    expect(result.value.importanceScore).toBe(0);
    expect(result.value.accessCount).toBe(0);
    expect(result.value.lastAccessed).toBe(null);
    expect(result.value.tags).toEqual([]);
    expect(result.value.memoryType).toBe('episodic');
  });

  test('should apply defaults for missing fields', async () => {
    const segment: Partial<MemorySegment> = {
      id: 'seg_test',
      sessionId: 'mem_test',
      content: 'Test content',
      sourceRange: { start: 0, end: 100 }
    };

    const result = await provider.extract(segment as MemorySegment);

    expect(result.ok).toBe(true);
    expect(result.value.importanceScore).toBe(0);
    expect(result.value.accessCount).toBe(0);
    expect(result.value.lastAccessed).toBe(null);
    expect(result.value.tags).toEqual([]);
    expect(result.value.memoryType).toBe('episodic');
    expect(result.value.timestamp).toBeGreaterThan(0);
  });

  test('should preserve existing metadata', async () => {
    const segment: MemorySegment = {
      id: 'seg_test',
      sessionId: 'mem_test',
      timestamp: 1234567890,
      importanceScore: 50,
      accessCount: 5,
      lastAccessed: 1234567800,
      tags: ['test', 'example'],
      memoryType: 'semantic',
      sourceRange: { start: 0, end: 100 },
      content: 'Test content'
    };

    const result = await provider.extract(segment);

    expect(result.ok).toBe(true);
    expect(result.value.importanceScore).toBe(50);
    expect(result.value.accessCount).toBe(5);
    expect(result.value.lastAccessed).toBe(1234567800);
    expect(result.value.tags).toEqual(['test', 'example']);
    expect(result.value.memoryType).toBe('semantic');
  });
});
