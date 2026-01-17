import { describe, test, expect } from 'bun:test';
import { extractKeywords } from '../keyword-extractor';

describe('lib/keyword-extractor.ts', () => {
  test('should extract programming identifiers with preserved casing', () => {
    const text = 'TypeScript useState useEffect camelCase PascalCase';
    const keywords = extractKeywords(text, 10);

    expect(keywords).toContain('TypeScript');
    expect(keywords).toContain('useState');
    expect(keywords).toContain('useEffect');
    expect(keywords).toContain('camelCase');
    expect(keywords).toContain('PascalCase');
  });

  test('should filter out stop words', () => {
    const text = 'the quick brown fox jumps over the lazy dog';
    const keywords = extractKeywords(text, 10);

    // Stop words should be filtered
    expect(keywords).not.toContain('the');
    expect(keywords).not.toContain('over');

    // Meaningful words should be kept
    expect(keywords).toContain('quick');
    expect(keywords).toContain('brown');
    expect(keywords).toContain('fox');
    expect(keywords).toContain('jumps');
    expect(keywords).toContain('lazy');
    expect(keywords).toContain('dog');
  });

  test('should recognize file paths', () => {
    const text = 'See src/index.ts and lib/utils.js for implementation';
    const keywords = extractKeywords(text, 10);

    // File paths should be preserved with their casing
    expect(keywords.some(k => k.includes('src/index.ts'))).toBe(true);
    expect(keywords.some(k => k.includes('lib/utils.js'))).toBe(true);
  });

  test('should limit to max keywords', () => {
    const text = 'one two three four five six seven eight nine ten eleven twelve';
    const keywords = extractKeywords(text, 5);

    expect(keywords.length).toBeLessThanOrEqual(5);
  });

  test('should handle empty text', () => {
    const keywords = extractKeywords('', 10);
    expect(keywords).toEqual([]);
  });

  test('should handle whitespace-only text', () => {
    const keywords = extractKeywords('   \n\t  ', 10);
    expect(keywords).toEqual([]);
  });

  test('should score keywords by frequency', () => {
    const text = 'TypeScript TypeScript TypeScript is great. JavaScript is ok.';
    const keywords = extractKeywords(text, 5);

    // TypeScript appears 3 times, should rank higher than JavaScript (1 time)
    expect(keywords[0]).toBe('TypeScript');
  });

  test('should recognize snake_case identifiers', () => {
    const text = 'The session_id and access_count fields are important';
    const keywords = extractKeywords(text, 10);

    expect(keywords).toContain('session_id');
    expect(keywords).toContain('access_count');
    expect(keywords).toContain('fields');
    expect(keywords).toContain('important');
  });

  test('should recognize SCREAMING_SNAKE_CASE constants', () => {
    const text = 'The MAX_ITEMS_PER_RUN constant controls batch size';
    const keywords = extractKeywords(text, 10);

    expect(keywords).toContain('MAX_ITEMS_PER_RUN');
    expect(keywords).toContain('constant');
    expect(keywords).toContain('controls');
  });

  test('should recognize kebab-case identifiers', () => {
    const text = 'The file-backend and keyword-tagger providers';
    const keywords = extractKeywords(text, 10);

    expect(keywords).toContain('file-backend');
    expect(keywords).toContain('keyword-tagger');
    expect(keywords).toContain('providers');
  });

  test('should skip short words under 3 characters', () => {
    const text = 'I go to it by my ox at am';
    const keywords = extractKeywords(text, 10);

    // All words are either stop words or < 3 chars
    expect(keywords.length).toBe(0);
  });

  test('should skip pure numbers', () => {
    const text = 'The values 123 and 456 are important numbers';
    const keywords = extractKeywords(text, 10);

    expect(keywords).not.toContain('123');
    expect(keywords).not.toContain('456');
    expect(keywords).toContain('values');
    expect(keywords).toContain('important');
    expect(keywords).toContain('numbers');
  });

  test('should boost capitalized words', () => {
    const text = 'React component uses TypeScript and JavaScript';
    const keywords = extractKeywords(text, 10);

    // Capitalized tech terms should rank high
    expect(keywords).toContain('React');
    expect(keywords).toContain('TypeScript');
    expect(keywords).toContain('JavaScript');
  });

  test('should boost longer words', () => {
    const text = 'implementation cat dog architectural';
    const keywords = extractKeywords(text, 10);

    // Longer words (>8 chars) get boost
    expect(keywords).toContain('implementation');
    expect(keywords).toContain('architectural');
  });

  test('should handle mixed programming and natural language', () => {
    const text = 'The useState hook manages component state in React applications';
    const keywords = extractKeywords(text, 10);

    expect(keywords).toContain('useState');
    expect(keywords).toContain('React');
    expect(keywords).toContain('hook');
    expect(keywords).toContain('manages');
    expect(keywords).toContain('component');
    expect(keywords).toContain('state');
    expect(keywords).toContain('applications');
  });

  test('should remove punctuation correctly', () => {
    const text = 'Error: "STORAGE_WRITE_FAILED" occurred! Check logs.';
    const keywords = extractKeywords(text, 10);

    // Punctuation removed but words preserved
    expect(keywords).toContain('error');  // Regular word, lowercased
    expect(keywords).toContain('STORAGE_WRITE_FAILED');  // SCREAMING_SNAKE preserved
    expect(keywords).toContain('occurred');
    expect(keywords).toContain('check');  // Regular word, lowercased
    expect(keywords).toContain('logs');
  });

  test('should recognize error codes', () => {
    const text = 'The STORAGE_WRITE_FAILED error code indicates failure';
    const keywords = extractKeywords(text, 10);

    expect(keywords).toContain('STORAGE_WRITE_FAILED');
    expect(keywords).toContain('error');
  });

  test('should boost position (early words score higher)', () => {
    const text = 'important detail buried in lots of extra filler words that go on and on and on to test position scoring important appears again';
    const keywords = extractKeywords(text, 3);

    // "important" appears first (position boost) and twice (frequency boost)
    expect(keywords[0]).toBe('important');
  });

  test('should handle Windows file paths', () => {
    const text = 'See C:\\Users\\file.ts and src\\index.ts for details';
    const keywords = extractKeywords(text, 10);

    expect(keywords.some(k => k.includes('\\'))).toBe(true);
  });

  test('should preserve casing for known tech terms', () => {
    const text = 'Bun TypeScript Node JavaScript Promise Array Object';
    const keywords = extractKeywords(text, 10);

    expect(keywords).toContain('Bun');
    expect(keywords).toContain('TypeScript');
    expect(keywords).toContain('Node');
    expect(keywords).toContain('JavaScript');
    expect(keywords).toContain('Promise');
    expect(keywords).toContain('Array');
    expect(keywords).toContain('Object');
  });

  test('should handle real-world memory segment content', () => {
    const text = `
      Implemented keyword extraction using extractKeywords() function.
      The KeywordTaggerProvider processes MemorySegment objects.
      Uses Result<T, E> pattern for error handling in TypeScript.
      File paths like src/providers/extract/keyword-tagger.ts are preserved.
    `;
    const keywords = extractKeywords(text, 10);

    // Programming identifiers preserved
    expect(keywords).toContain('extractKeywords');
    expect(keywords).toContain('KeywordTaggerProvider');
    expect(keywords).toContain('MemorySegment');
    expect(keywords).toContain('TypeScript');

    // File paths preserved
    expect(keywords.some(k => k.includes('keyword-tagger.ts'))).toBe(true);

    // Meaningful words extracted (lowercased for regular words)
    expect(keywords).toContain('implemented');
    expect(keywords).toContain('extraction');
  });

  test('should return exactly maxKeywords or fewer', () => {
    const text = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu';

    const keywords3 = extractKeywords(text, 3);
    expect(keywords3.length).toBe(3);

    const keywords5 = extractKeywords(text, 5);
    expect(keywords5.length).toBe(5);

    const keywords100 = extractKeywords(text, 100);
    expect(keywords100.length).toBeLessThanOrEqual(100);
    // Text has 12 Greek letters, but "mu" is only 2 chars (filtered), so 11 keywords
    expect(keywords100.length).toBe(11);
  });

  test('should sort alphabetically when scores are tied', () => {
    const text = 'apple banana cherry';  // All appear once, same length
    const keywords = extractKeywords(text, 3);

    // Should be alphabetically sorted when scores tie
    expect(keywords).toEqual(['apple', 'banana', 'cherry']);
  });
});
