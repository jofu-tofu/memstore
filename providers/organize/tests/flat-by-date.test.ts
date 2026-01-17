import { describe, test, expect, beforeEach } from 'bun:test';
import { FlatByDateOrganizeProvider } from '../flat-by-date';
import type { MemorySegment } from '../../../types/segment';

describe('providers/organize/flat-by-date.ts', () => {
  let provider: FlatByDateOrganizeProvider;

  beforeEach(async () => {
    provider = new FlatByDateOrganizeProvider();
    await provider.initialize();
  });

  test('should generate YYYY-MM path from timestamp', async () => {
    const segment: MemorySegment = {
      id: 'seg_test',
      sessionId: 'mem_test',
      timestamp: 1736611200000, // 2025-01-11 UTC
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: [],
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 100 },
      content: 'test'
    };

    const result = await provider.organize(segment);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('segments/2025-01');
    }
  });

  test('should handle different months and years', async () => {
    const testCases = [
      { timestamp: 1704067200000, expected: 'segments/2024-01' }, // 2024-01-01 UTC
      { timestamp: 1735689600000, expected: 'segments/2025-01' }, // 2025-01-01 UTC
      { timestamp: 1733097600000, expected: 'segments/2024-12' } // 2024-12-01 UTC
    ];

    for (const { timestamp, expected } of testCases) {
      const segment: MemorySegment = {
        id: 'seg_test',
        sessionId: 'mem_test',
        timestamp,
        importanceScore: 0,
        accessCount: 0,
        lastAccessed: null,
        tags: [],
        memoryType: 'episodic',
        sourceRange: { start: 0, end: 100 },
        content: 'test'
      };

      const result = await provider.organize(segment);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(expected);
      }
    }
  });

  test('should handle invalid timestamp (0) gracefully', async () => {
    const segment: MemorySegment = {
      id: 'seg_test',
      sessionId: 'mem_test',
      timestamp: 0, // Invalid
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: [],
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 100 },
      content: 'test'
    };

    const result = await provider.organize(segment);
    expect(result.ok).toBe(true);
    // Should default to current month (exact value tested by checking format)
    if (result.ok) {
      expect(result.value).toMatch(/^segments\/\d{4}-\d{2}$/);
    }
  });

  test('should handle negative timestamp gracefully', async () => {
    const segment: MemorySegment = {
      id: 'seg_test',
      sessionId: 'mem_test',
      timestamp: -1, // Invalid
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: [],
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 100 },
      content: 'test'
    };

    const result = await provider.organize(segment);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatch(/^segments\/\d{4}-\d{2}$/);
    }
  });

  test('should handle future dates correctly', async () => {
    const segment: MemorySegment = {
      id: 'seg_test',
      sessionId: 'mem_test',
      timestamp: 1893456000000, // 2030-01-01
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: [],
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 100 },
      content: 'test'
    };

    const result = await provider.organize(segment);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('segments/2030-01');
    }
  });

  test('should pad month with leading zero', async () => {
    const segment: MemorySegment = {
      id: 'seg_test',
      sessionId: 'mem_test',
      timestamp: new Date('2026-03-01').getTime(),
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: [],
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 100 },
      content: 'test'
    };

    const result = await provider.organize(segment);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('segments/2026-03');
    }
  });

  test('should initialize successfully', async () => {
    const initResult = await provider.initialize();
    expect(initResult.ok).toBe(true);
  });

  test('should report healthy status', async () => {
    const health = await provider.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.message).toBeDefined();
  });

  test('should shutdown gracefully', async () => {
    await expect(provider.shutdown()).resolves.toBeUndefined();
  });

  test('should have correct name and version', () => {
    expect(provider.name).toBe('flat-by-date');
    expect(provider.version).toBe('1.0.0');
  });
});
