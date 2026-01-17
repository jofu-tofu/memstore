import { describe, test, expect } from 'bun:test';
import { estimateTokens, truncateToTokenLimit, sumTokens } from '../token-counter';

describe('Token Counter', () => {
  describe('estimateTokens()', () => {
    test('should return 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
      expect(estimateTokens('   ')).toBe(0);
    });

    test('should estimate tokens for simple text', () => {
      // "hello world" = 2 words * 1.3 = 2.6 → 3 tokens
      expect(estimateTokens('hello world')).toBe(3);
    });

    test('should estimate tokens for longer text', () => {
      // 10 words * 1.3 = 13 tokens
      const text = 'This is a test sentence with exactly ten words here';
      expect(estimateTokens(text)).toBe(13);
    });

    test('should handle extra whitespace', () => {
      expect(estimateTokens('hello    world')).toBe(3);
      expect(estimateTokens('  hello world  ')).toBe(3);
    });

    test('should handle newlines', () => {
      expect(estimateTokens('hello\nworld')).toBe(3);
      expect(estimateTokens('hello\n\nworld')).toBe(3);
    });

    test('should round up for conservative estimate', () => {
      // 1 word * 1.3 = 1.3 → 2 tokens (rounded up)
      expect(estimateTokens('word')).toBe(2);
    });
  });

  describe('truncateToTokenLimit()', () => {
    test('should not truncate if within limit', () => {
      const text = 'hello world';
      const tokens = estimateTokens(text);
      expect(truncateToTokenLimit(text, tokens)).toBe(text);
      expect(truncateToTokenLimit(text, tokens + 10)).toBe(text);
    });

    test('should truncate if exceeding limit', () => {
      const text = 'one two three four five six';
      const result = truncateToTokenLimit(text, 5);
      expect(result).toContain('...');
      expect(result.length).toBeLessThan(text.length);
    });

    test('should return ... for very small limits', () => {
      const text = 'hello world';
      expect(truncateToTokenLimit(text, 0)).toBe('...');
      expect(truncateToTokenLimit(text, 1)).toBe('...');
    });

    test('should preserve word boundaries when truncating', () => {
      const text = 'word1 word2 word3 word4 word5';
      const result = truncateToTokenLimit(text, 3);
      // Should truncate at word boundaries, not mid-word
      expect(result).toMatch(/^word1 word2\.\.\.$/);
    });

    test('should handle empty text', () => {
      expect(truncateToTokenLimit('', 10)).toBe('');
      expect(truncateToTokenLimit('   ', 10)).toBe('');
    });

    test('should handle exact limit', () => {
      const text = 'hello world';
      const tokens = estimateTokens(text);
      const result = truncateToTokenLimit(text, tokens);
      expect(result).toBe(text);
    });

    test('should truncate long text appropriately', () => {
      const longText = 'This is a very long text that contains many words and should be truncated to fit within the token budget limit';
      const result = truncateToTokenLimit(longText, 10);
      expect(result).toContain('...');
      expect(estimateTokens(result)).toBeLessThanOrEqual(10);
    });
  });

  describe('sumTokens()', () => {
    test('should sum tokens for multiple texts', () => {
      const texts = ['hello world', 'foo bar'];
      const sum = sumTokens(texts);
      const expected = estimateTokens('hello world') + estimateTokens('foo bar');
      expect(sum).toBe(expected);
    });

    test('should handle empty array', () => {
      expect(sumTokens([])).toBe(0);
    });

    test('should handle array with empty strings', () => {
      expect(sumTokens(['', '   ', ''])).toBe(0);
    });

    test('should handle mixed content', () => {
      const texts = ['hello', '', 'world', '   '];
      const sum = sumTokens(texts);
      const expected = estimateTokens('hello') + estimateTokens('world');
      expect(sum).toBe(expected);
    });

    test('should handle single element array', () => {
      const texts = ['hello world'];
      expect(sumTokens(texts)).toBe(estimateTokens('hello world'));
    });
  });
});
