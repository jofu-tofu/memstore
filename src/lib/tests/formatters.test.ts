/**
 * Tests for Formatting Utilities (Story 4.6.2)
 *
 * Validates human-readable formatting functions.
 */

import { describe, test, expect } from 'bun:test';
import { formatAge, formatTags } from '../formatters';

describe('Formatters', () => {
  describe('formatAge', () => {
    test('should format today correctly', () => {
      expect(formatAge(0)).toBe('today');
      expect(formatAge(1000)).toBe('today'); // 1 second
      expect(formatAge(60000)).toBe('today'); // 1 minute
      expect(formatAge(3600000)).toBe('today'); // 1 hour
    });

    test('should format 1 day correctly', () => {
      const oneDay = 24 * 60 * 60 * 1000;
      expect(formatAge(oneDay)).toBe('1d');
    });

    test('should format days < 30 correctly', () => {
      const oneDay = 24 * 60 * 60 * 1000;
      expect(formatAge(oneDay * 2)).toBe('2d');
      expect(formatAge(oneDay * 7)).toBe('7d');
      expect(formatAge(oneDay * 14)).toBe('14d');
      expect(formatAge(oneDay * 29)).toBe('29d');
    });

    test('should format months correctly', () => {
      const oneDay = 24 * 60 * 60 * 1000;
      expect(formatAge(oneDay * 30)).toBe('1mo');
      expect(formatAge(oneDay * 45)).toBe('1mo'); // Rounds down
      expect(formatAge(oneDay * 60)).toBe('2mo');
      expect(formatAge(oneDay * 90)).toBe('3mo');
    });

    test('should handle edge cases', () => {
      const oneDay = 24 * 60 * 60 * 1000;

      // Just under 1 day
      expect(formatAge(oneDay - 1)).toBe('today');

      // Exactly 30 days
      expect(formatAge(oneDay * 30)).toBe('1mo');

      // Large values
      expect(formatAge(oneDay * 365)).toBe('12mo');
    });
  });

  describe('formatTags', () => {
    test('should format empty array', () => {
      expect(formatTags([])).toBe('');
    });

    test('should format single tag', () => {
      expect(formatTags(['typescript'])).toBe('typescript');
    });

    test('should format multiple tags', () => {
      expect(formatTags(['typescript', 'hooks', 'error'])).toBe(
        'typescript,hooks,error'
      );
    });

    test('should preserve tag order', () => {
      expect(formatTags(['a', 'b', 'c'])).toBe('a,b,c');
      expect(formatTags(['c', 'b', 'a'])).toBe('c,b,a');
    });

    test('should handle tags with special characters', () => {
      expect(formatTags(['api-client', 'test_utils', 'error-handling'])).toBe(
        'api-client,test_utils,error-handling'
      );
    });
  });
});
