import { describe, test, expect } from 'bun:test';
import type {
  Result,
  Provider,
  ProviderError,
  HealthStatus,
  MemoryType,
  SourceRange,
  MemorySegment,
  SessionMetadata,
  SessionTranscript
} from './index';

describe('types/index exports', () => {
  test('should export Result type from common', () => {
    const result: Result<string, Error> = { ok: true, value: 'test' };
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('test');
    }
  });

  test('should export ProviderError type from common', () => {
    const error: ProviderError = {
      code: 'TEST_ERROR',
      message: 'Test message'
    };
    expect(error.code).toBe('TEST_ERROR');
  });

  test('should export HealthStatus type from common', () => {
    const health: HealthStatus = {
      healthy: true,
      message: 'OK'
    };
    expect(health.healthy).toBe(true);
  });

  test('should export Provider interface from common', async () => {
    const mockProvider: Provider = {
      name: 'TestProvider',
      version: '1.0.0',
      async initialize() {
        return { ok: true, value: undefined };
      },
      async healthCheck() {
        return { healthy: true, message: 'OK' };
      },
      async shutdown() {}
    };

    expect(mockProvider.name).toBe('TestProvider');
  });

  test('should export MemorySegment type from segment', () => {
    const segment: MemorySegment = {
      id: 'seg_1704567890123_a1b2c3d4',
      sessionId: 'mem_1704567890123_e5f6a7b8',
      timestamp: 1704567890123,
      importanceScore: 50,
      accessCount: 0,
      lastAccessed: null,
      tags: ['test'],
      memoryType: 'episodic',
      sourceRange: { start: 0, end: 100 },
      content: 'Test content'
    };

    expect(segment.id).toContain('seg_');
  });

  test('should export MemoryType from segment', () => {
    const episodic: MemoryType = 'episodic';
    const semantic: MemoryType = 'semantic';
    const procedural: MemoryType = 'procedural';

    expect(episodic).toBe('episodic');
    expect(semantic).toBe('semantic');
    expect(procedural).toBe('procedural');
  });

  test('should export SourceRange from segment', () => {
    const range: SourceRange = { start: 0, end: 100 };
    expect(range.start).toBe(0);
    expect(range.end).toBe(100);
  });

  test('should export SessionTranscript from segment', () => {
    const transcript: SessionTranscript = {
      sessionId: 'mem_1704567890123_e5f6a7b8',
      timestamp: 1704567890123,
      content: 'Test content',
      metadata: {
        model: 'claude-sonnet-4.5'
      }
    };

    expect(transcript.sessionId).toContain('mem_');
  });

  test('should export SessionMetadata from segment', () => {
    const metadata: SessionMetadata = {
      model: 'claude-sonnet-4.5',
      totalTokens: 1000,
      duration: 30000
    };

    expect(metadata.model).toBe('claude-sonnet-4.5');
  });
});
