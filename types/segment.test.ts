import { describe, test, expect } from 'bun:test';
import type { MemorySegment, SessionTranscript } from './segment';

describe('MemorySegment', () => {
  test('should have all required fields', () => {
    const segment: MemorySegment = {
      id: 'seg_1704567890123_a1b2c3d4',
      sessionId: 'mem_1704567890123_e5f6a7b8',
      timestamp: 1704567890123,
      importanceScore: 75,
      accessCount: 0,
      lastAccessed: null,
      tags: ['typescript', 'memory-system'],
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 1500 },
      content: 'This is the segment content.'
    };

    expect(segment.id).toMatch(/^seg_\d+_[a-f0-9]{8}$/);
    expect(segment.sessionId).toMatch(/^mem_\d+_[a-f0-9]{8}$/);
    expect(segment.timestamp).toBeGreaterThan(0);
    expect(segment.importanceScore).toBeGreaterThanOrEqual(0);
    expect(segment.importanceScore).toBeLessThanOrEqual(100);
    expect(segment.accessCount).toBe(0);
    expect(segment.lastAccessed).toBeNull();
    expect(segment.tags).toHaveLength(2);
    expect(segment.memoryType).toBe('episodic');
    expect(segment.sourceRange.start).toBe(0);
    expect(segment.sourceRange.end).toBe(1500);
    expect(segment.content).toBe('This is the segment content.');
  });

  test('should support all memory types', () => {
    const episodic: MemorySegment['memoryType'] = 'episodic';
    const semantic: MemorySegment['memoryType'] = 'semantic';
    const procedural: MemorySegment['memoryType'] = 'procedural';

    expect(episodic).toBe('episodic');
    expect(semantic).toBe('semantic');
    expect(procedural).toBe('procedural');
  });

  test('should allow null for lastAccessed when never retrieved', () => {
    const segment: MemorySegment = {
      id: 'seg_1704567890123_a1b2c3d4',
      sessionId: 'mem_1704567890123_e5f6a7b8',
      timestamp: 1704567890123,
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: [],
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 100 },
      content: 'Test content'
    };

    expect(segment.lastAccessed).toBeNull();
  });

  test('should allow timestamp for lastAccessed when retrieved', () => {
    const now = Date.now();
    const segment: MemorySegment = {
      id: 'seg_1704567890123_a1b2c3d4',
      sessionId: 'mem_1704567890123_e5f6a7b8',
      timestamp: 1704567890123,
      importanceScore: 50,
      accessCount: 5,
      lastAccessed: now,
      tags: ['retrieved'],
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 100 },
      content: 'Test content'
    };

    expect(segment.lastAccessed).toBe(now);
    expect(segment.accessCount).toBe(5);
  });

  test('should support empty tags array', () => {
    const segment: MemorySegment = {
      id: 'seg_1704567890123_a1b2c3d4',
      sessionId: 'mem_1704567890123_e5f6a7b8',
      timestamp: 1704567890123,
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: [],
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 100 },
      content: 'Test content'
    };

    expect(segment.tags).toEqual([]);
  });

  test('should support source range positions', () => {
    const segment: MemorySegment = {
      id: 'seg_1704567890123_a1b2c3d4',
      sessionId: 'mem_1704567890123_e5f6a7b8',
      timestamp: 1704567890123,
      importanceScore: 0,
      accessCount: 0,
      lastAccessed: null,
      tags: [],
      memoryType: 'episodic',
      sourceRange: { start: 250, end: 750 },
      content: 'Test content'
    };

    expect(segment.sourceRange.start).toBe(250);
    expect(segment.sourceRange.end).toBe(750);
    expect(segment.sourceRange.end - segment.sourceRange.start).toBe(500);
  });
});

describe('SessionTranscript', () => {
  test('should have required session metadata', () => {
    const transcript: SessionTranscript = {
      sessionId: 'mem_1704567890123_e5f6a7b8',
      timestamp: 1704567890123,
      content: 'Full transcript of the session...',
      metadata: {
        model: 'claude-sonnet-4.5',
        totalTokens: 15000,
        duration: 300000
      }
    };

    expect(transcript.sessionId).toMatch(/^mem_\d+_[a-f0-9]{8}$/);
    expect(transcript.timestamp).toBeGreaterThan(0);
    expect(transcript.content).toContain('transcript');
    expect(transcript.metadata.model).toBe('claude-sonnet-4.5');
    expect(transcript.metadata.totalTokens).toBe(15000);
    expect(transcript.metadata.duration).toBe(300000);
  });

  test('should support optional metadata fields', () => {
    const transcript: SessionTranscript = {
      sessionId: 'mem_1704567890123_e5f6a7b8',
      timestamp: 1704567890123,
      content: 'Full transcript',
      metadata: {
        model: 'claude-sonnet-4.5'
      }
    };

    expect(transcript.metadata.model).toBe('claude-sonnet-4.5');
    expect(transcript.metadata.totalTokens).toBeUndefined();
    expect(transcript.metadata.duration).toBeUndefined();
  });
});
