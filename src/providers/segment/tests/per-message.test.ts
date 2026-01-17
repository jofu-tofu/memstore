import { describe, test, expect } from 'bun:test';
import { PerMessageSegmentProvider } from '../per-message';

describe('providers/segment/per-message.ts', () => {
  const provider = new PerMessageSegmentProvider();

  test('should segment per-message correctly', async () => {
    const transcript = 'User: First question\nAssistant: First answer\nUser: Second question\nAssistant: Second answer';

    const result = await provider.segment(transcript, 'mem_test');

    expect(result.ok).toBe(true);
    expect(result.value.length).toBe(2); // 2 user/assistant pairs
    expect(result.value[0].memoryType).toBe('episodic');
    expect(result.value[0].sourceRange).toBeDefined();
    expect(result.value[0].sessionId).toBe('mem_test');
  });

  test('should pair user and assistant exchanges', async () => {
    const transcript = 'User: Yes\nAssistant: Okay, let me help you with that. Here is a detailed explanation.';

    const result = await provider.segment(transcript, 'mem_test');

    expect(result.ok).toBe(true);
    // Should create one segment pairing user + assistant
    expect(result.value.length).toBe(1);
    expect(result.value[0].content).toContain('Yes');
    expect(result.value[0].content).toContain('Okay');
  });

  test('should handle empty transcript gracefully', async () => {
    const result = await provider.segment('', 'mem_test');

    expect(result.ok).toBe(true);
    expect(result.value.length).toBe(0);
  });

  test('should handle whitespace-only transcript', async () => {
    const result = await provider.segment('   \n  \n  ', 'mem_test');

    expect(result.ok).toBe(true);
    expect(result.value.length).toBe(0);
  });

  test('should set correct sourceRange for segments', async () => {
    const transcript = 'User: Question one\nAssistant: Answer one\nUser: Question two\nAssistant: Answer two';

    const result = await provider.segment(transcript, 'mem_test');

    expect(result.ok).toBe(true);
    expect(result.value.length).toBe(2); // 2 user/assistant pairs

    // First segment should start at 0
    expect(result.value[0].sourceRange.start).toBe(0);

    // Each segment should have valid range
    for (const segment of result.value) {
      expect(segment.sourceRange.start).toBeGreaterThanOrEqual(0);
      expect(segment.sourceRange.end).toBeGreaterThan(segment.sourceRange.start);
    }
  });

  test('should set default metadata fields', async () => {
    const transcript = 'User: Test question\nAssistant: Test answer';

    const result = await provider.segment(transcript, 'mem_test_session');

    expect(result.ok).toBe(true);
    expect(result.value.length).toBeGreaterThan(0);

    const segment = result.value[0];
    expect(segment.id).toBeDefined();
    expect(typeof segment.id).toBe('string');
    expect(segment.id.startsWith('seg_')).toBe(true);
    expect(segment.sessionId).toBe('mem_test_session');
    expect(segment.timestamp).toBeGreaterThan(0);
    expect(segment.importanceScore).toBe(0);
    expect(segment.accessCount).toBe(0);
    expect(segment.lastAccessed).toBe(null);
    expect(Array.isArray(segment.tags)).toBe(true);
    expect(segment.memoryType).toBe('episodic');
  });

  test('should handle single turn', async () => {
    const transcript = 'User: Single question';

    const result = await provider.segment(transcript, 'mem_test');

    expect(result.ok).toBe(true);
    expect(result.value.length).toBe(1);
  });

  test('should handle multi-line turns', async () => {
    const transcript = `User: This is a question
that spans multiple
lines
Assistant: This is an answer
that also spans
multiple lines`;

    const result = await provider.segment(transcript, 'mem_test');

    expect(result.ok).toBe(true);
    expect(result.value.length).toBe(1);
    expect(result.value[0].content).toContain('multiple');
  });
});