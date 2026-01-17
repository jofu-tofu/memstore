/**
 * Keyword extraction utility for memory segments
 * Extracts meaningful keywords, filters stop words, and preserves programming identifiers
 */

export interface KeywordScore {
  keyword: string;
  score: number;
}

/**
 * Comprehensive stop words list - common English words to filter
 */
const STOP_WORDS = new Set([
  // Articles
  'a', 'an', 'the',

  // Conjunctions
  'and', 'or', 'but', 'nor', 'for', 'yet', 'so',

  // Prepositions
  'in', 'on', 'at', 'to', 'from', 'by', 'with', 'about', 'against', 'between',
  'into', 'through', 'during', 'before', 'after', 'above', 'below', 'under',
  'over', 'of', 'off', 'out', 'up', 'down',

  // Pronouns
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'her', 'its', 'our', 'their', 'mine', 'yours', 'hers',
  'ours', 'theirs', 'this', 'that', 'these', 'those', 'who', 'whom', 'whose',
  'which', 'what',

  // Verbs (common)
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing',
  'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can',
  'get', 'got', 'getting',

  // Adverbs
  'not', 'no', 'yes', 'very', 'too', 'just', 'now', 'then', 'there', 'here',
  'where', 'when', 'why', 'how', 'all', 'any', 'some', 'few', 'more', 'most',
  'other', 'such', 'only', 'own', 'same', 'than', 'each', 'every', 'both',
  'either', 'neither', 'also', 'well'
]);

/**
 * Detects if a word is a programming identifier that should preserve casing
 */
function isProgrammingIdentifier(word: string): boolean {
  // camelCase: starts lowercase, contains uppercase
  if (/^[a-z]+[A-Z]/.test(word)) return true;

  // PascalCase: starts uppercase, contains lowercase then uppercase
  if (/^[A-Z][a-z]+[A-Z]/.test(word)) return true;

  // snake_case or kebab-case
  if (/^[a-z]+[_-][a-z]+/.test(word)) return true;

  // SCREAMING_SNAKE_CASE
  if (/^[A-Z]+_[A-Z]+/.test(word)) return true;

  // File paths (contains / or \ or ends with common extensions)
  if (word.includes('/') || word.includes('\\') || /\.(ts|js|tsx|jsx|json|md|yaml|yml|txt)$/i.test(word)) return true;

  // Common programming keywords (preserve as-is)
  const programmingKeywords = [
    'const', 'let', 'var', 'function', 'class', 'interface', 'type',
    'async', 'await', 'Promise', 'Array', 'Object', 'String', 'Number',
    'TypeScript', 'JavaScript', 'React', 'Node', 'Bun'
  ];
  if (programmingKeywords.includes(word)) return true;

  return false;
}

/**
 * Extracts meaningful keywords from text with scoring and ranking
 *
 * @param text - The input text to extract keywords from
 * @param maxKeywords - Maximum number of keywords to return (default: 10)
 * @returns Array of top-ranked keywords
 */
export function extractKeywords(text: string, maxKeywords: number = 10): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const keywords: KeywordScore[] = [];

  // Extract file paths first (preserve them as single tokens)
  const filePaths: string[] = [];
  const filePathPattern = /[\w-]+[/\\][\w-]+\.[\w]+/g;
  let cleanedText = text.replace(filePathPattern, (match) => {
    filePaths.push(match);
    return ''; // Remove from text to avoid double-counting
  });

  // Split into words and filter punctuation
  const words = cleanedText.split(/\s+/)
    .map(w => w.replace(/[.,;:!?()[\]{}'"]/g, ''))  // Remove punctuation
    .filter(w => w.length > 0);

  const wordFreq = new Map<string, number>();
  const wordPositions = new Map<string, number>();

  // Process file paths first
  for (const filePath of filePaths) {
    wordFreq.set(filePath, (wordFreq.get(filePath) || 0) + 1);
    wordPositions.set(filePath, 0);  // Give file paths high priority (position 0)
  }

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    // Skip very short words (< 3 chars)
    if (word.length < 3) continue;

    // Programming identifiers - preserve casing
    if (isProgrammingIdentifier(word)) {
      const key = word;  // Keep original casing
      wordFreq.set(key, (wordFreq.get(key) || 0) + 1);
      if (!wordPositions.has(key)) {
        wordPositions.set(key, i);  // Track first occurrence position
      }
      continue;
    }

    // Regular words - normalize to lowercase
    const normalized = word.toLowerCase();

    // Skip stop words
    if (STOP_WORDS.has(normalized)) continue;

    // Skip pure numbers
    if (/^\d+$/.test(normalized)) continue;

    wordFreq.set(normalized, (wordFreq.get(normalized) || 0) + 1);
    if (!wordPositions.has(normalized)) {
      wordPositions.set(normalized, i);
    }
  }

  // Score keywords based on multiple factors
  for (const [keyword, freq] of wordFreq) {
    let score = freq;

    // Position boost (earlier in text = higher relevance)
    const position = wordPositions.get(keyword) || 0;
    if (position < 100) {
      score *= 1.3;  // In first 100 words
    }

    // Programming identifier boost
    if (isProgrammingIdentifier(keyword)) {
      score *= 2.0;
    }

    // Capitalized words boost (proper nouns, tech terms)
    if (/^[A-Z]/.test(keyword) && keyword.length > 1) {
      score *= 1.5;
    }

    // Longer words boost (often more meaningful)
    if (keyword.length > 8) {
      score *= 1.2;
    }

    keywords.push({ keyword, score });
  }

  // Sort by score descending, then alphabetically for ties
  keywords.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.keyword.localeCompare(b.keyword);
  });

  // Return top N keywords
  return keywords.slice(0, maxKeywords).map(k => k.keyword);
}
