import { describe, test, expect } from 'bun:test';
import { formatAge } from '../age-formatter';

describe('Age Formatter', () => {
  const now = Date.now();

  describe('formatAge()', () => {
    test('should format seconds', () => {
      expect(formatAge(now - 30 * 1000, now)).toBe('30s');
      expect(formatAge(now - 45 * 1000, now)).toBe('45s');
      expect(formatAge(now - 1 * 1000, now)).toBe('1s');
    });

    test('should format minutes', () => {
      expect(formatAge(now - 5 * 60 * 1000, now)).toBe('5m');
      expect(formatAge(now - 30 * 60 * 1000, now)).toBe('30m');
      expect(formatAge(now - 1 * 60 * 1000, now)).toBe('1m');
    });

    test('should format hours', () => {
      expect(formatAge(now - 3 * 60 * 60 * 1000, now)).toBe('3h');
      expect(formatAge(now - 12 * 60 * 60 * 1000, now)).toBe('12h');
      expect(formatAge(now - 1 * 60 * 60 * 1000, now)).toBe('1h');
    });

    test('should format days', () => {
      expect(formatAge(now - 2 * 24 * 60 * 60 * 1000, now)).toBe('2d');
      expect(formatAge(now - 5 * 24 * 60 * 60 * 1000, now)).toBe('5d');
      expect(formatAge(now - 1 * 24 * 60 * 60 * 1000, now)).toBe('1d');
    });

    test('should format weeks', () => {
      expect(formatAge(now - 2 * 7 * 24 * 60 * 60 * 1000, now)).toBe('2w');
      expect(formatAge(now - 3 * 7 * 24 * 60 * 60 * 1000, now)).toBe('3w');
      expect(formatAge(now - 1 * 7 * 24 * 60 * 60 * 1000, now)).toBe('1w');
    });

    test('should format months', () => {
      expect(formatAge(now - 3 * 30 * 24 * 60 * 60 * 1000, now)).toBe('3mo');
      expect(formatAge(now - 6 * 30 * 24 * 60 * 60 * 1000, now)).toBe('6mo');
      expect(formatAge(now - 1 * 30 * 24 * 60 * 60 * 1000, now)).toBe('1mo');
    });

    test('should handle future timestamps (clock skew)', () => {
      const futureTime = now + 1000;
      expect(formatAge(futureTime, now)).toBe('0s');
    });

    test('should handle zero elapsed time', () => {
      expect(formatAge(now, now)).toBe('0s');
    });

    test('should prefer larger units (months over weeks)', () => {
      // 31 days = 1 month (30+ days)
      expect(formatAge(now - 31 * 24 * 60 * 60 * 1000, now)).toBe('1mo');
    });

    test('should prefer larger units (weeks over days)', () => {
      // 14 days = 2 weeks
      expect(formatAge(now - 14 * 24 * 60 * 60 * 1000, now)).toBe('2w');
    });

    test('should handle very old timestamps', () => {
      // 1 year = ~12 months
      expect(formatAge(now - 365 * 24 * 60 * 60 * 1000, now)).toBe('12mo');
    });

    test('should use default current time when not provided', () => {
      const past = Date.now() - 5 * 60 * 1000;
      const result = formatAge(past);
      expect(result).toMatch(/^[0-9]+[smhd]$/); // Should be valid format
    });
  });
});
