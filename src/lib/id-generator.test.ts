import { describe, test, expect } from 'bun:test';
import { generateSessionId, generateSegmentId } from './id-generator';

describe('ID Generator', () => {
  test('generateSessionId returns success result with correct format', () => {
    const result = generateSessionId();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatch(/^mem_\d+_[a-f0-9]{8}$/);
    }
  });

  test('generateSessionId creates unique IDs', () => {
    const result1 = generateSessionId();
    const result2 = generateSessionId();
    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    if (result1.ok && result2.ok) {
      expect(result1.value).not.toBe(result2.value);
    }
  });

  test('generateSessionId has timestamp component', () => {
    const before = Date.now();
    const result = generateSessionId();
    const after = Date.now();

    expect(result.ok).toBe(true);
    if (result.ok) {
      const timestampStr = result.value.split('_')[1];
      const timestamp = parseInt(timestampStr, 10);

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    }
  });

  test('generateSegmentId returns success result with correct format', () => {
    const result = generateSegmentId();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatch(/^seg_\d+_[a-f0-9]{8}$/);
    }
  });

  test('generateSegmentId creates unique IDs', () => {
    const result1 = generateSegmentId();
    const result2 = generateSegmentId();
    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    if (result1.ok && result2.ok) {
      expect(result1.value).not.toBe(result2.value);
    }
  });

  test('generateSegmentId has timestamp component', () => {
    const before = Date.now();
    const result = generateSegmentId();
    const after = Date.now();

    expect(result.ok).toBe(true);
    if (result.ok) {
      const timestampStr = result.value.split('_')[1];
      const timestamp = parseInt(timestampStr, 10);

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    }
  });
});
