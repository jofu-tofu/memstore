/**
 * Tests for Debug Log Parser
 *
 * Story 4.6.3: Diagnostic Analysis Tools (AC1)
 */

import { describe, test, expect } from 'bun:test';
import { parseDebugLog } from '../log-parser';

describe('Log Parser', () => {
  describe('Query Extraction', () => {
    test('should extract query from debug log', () => {
      const logContent = `
[Memory:Retrieve:Debug] Query: "typescript hook error"
[Memory:Retrieve:Debug] Terms extracted: ["typescript", "hook", "error"]
`;

      const result = parseDebugLog(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.query).toBe('typescript hook error');
      }
    });

    test('should handle empty query', () => {
      const logContent = `
[Memory:Retrieve:Debug] Query: ""
`;

      const result = parseDebugLog(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.query).toBe('');
      }
    });

    test('should handle missing query line', () => {
      const logContent = `
[Memory:Retrieve:Debug] Terms extracted: ["typescript"]
`;

      const result = parseDebugLog(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.query).toBe('');
      }
    });
  });

  describe('Terms Extraction', () => {
    test('should extract multiple terms', () => {
      const logContent = `
[Memory:Retrieve:Debug] Terms extracted: ["typescript", "hook", "error"]
`;

      const result = parseDebugLog(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.terms).toEqual(['typescript', 'hook', 'error']);
      }
    });

    test('should handle single term', () => {
      const logContent = `
[Memory:Retrieve:Debug] Terms extracted: ["typescript"]
`;

      const result = parseDebugLog(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.terms).toEqual(['typescript']);
      }
    });

    test('should handle empty terms array', () => {
      const logContent = `
[Memory:Retrieve:Debug] Terms extracted: []
`;

      const result = parseDebugLog(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.terms).toEqual([]);
      }
    });

    test('should handle missing terms line', () => {
      const logContent = `
[Memory:Retrieve:Debug] Query: "test"
`;

      const result = parseDebugLog(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.terms).toEqual([]);
      }
    });
  });

  describe('Index Hits Extraction', () => {
    test('should extract index hits for multiple terms', () => {
      const logContent = `
[Memory:KeywordSearch:Debug] Index lookup: typescript=15 hits, hook=8 hits
`;

      const result = parseDebugLog(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.indexHits).toEqual({
          typescript: 15,
          hook: 8,
        });
      }
    });

    test('should handle zero hits', () => {
      const logContent = `
[Memory:KeywordSearch:Debug] Index lookup: quantum=0 hits, computing=0 hits
`;

      const result = parseDebugLog(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.indexHits).toEqual({
          quantum: 0,
          computing: 0,
        });
      }
    });

    test('should handle missing index hits line', () => {
      const logContent = `
[Memory:Retrieve:Debug] Query: "test"
`;

      const result = parseDebugLog(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.indexHits).toEqual({});
      }
    });
  });

  describe('Candidate Count Extraction', () => {
    test('should extract candidates before filtering', () => {
      const logContent = `
[Memory:Retrieve:Debug] Total candidates before filtering: 23 segments
`;

      const result = parseDebugLog(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.candidatesBeforeFilter).toBe(23);
      }
    });

    test('should extract candidates after recency filter', () => {
      const logContent = `
[Memory:Retrieve:Debug] After recency filter (30d): 12 segments
`;

      const result = parseDebugLog(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.candidatesAfterRecency).toBe(12);
        expect(result.value.recencyWindow).toBe(30);
      }
    });

    test('should extract candidates after importance filter', () => {
      const logContent = `
[Memory:Retrieve:Debug] After importance filter (min=40): 8 segments
`;

      const result = parseDebugLog(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.candidatesAfterImportance).toBe(8);
        expect(result.value.minImportance).toBe(40);
      }
    });

    test('should handle zero candidates', () => {
      const logContent = `
[Memory:Retrieve:Debug] Total candidates before filtering: 0 segments
`;

      const result = parseDebugLog(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.candidatesBeforeFilter).toBe(0);
      }
    });
  });

  describe('Top Results Extraction', () => {
    test('should extract top results with metadata', () => {
      const logContent = `
[Memory:Retrieve:Debug] Top 5 by relevance score:
[Memory:Retrieve:Debug]   - seg_001 (score=87, age=3d, tags=typescript,hooks)
[Memory:Retrieve:Debug]   - seg_002 (score=75, age=7d, tags=react,typescript)
`;

      const result = parseDebugLog(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.topResults).toHaveLength(2);
        expect(result.value.topResults[0]).toEqual({
          id: 'seg_001',
          score: 87,
          age: '3d',
          tags: ['typescript', 'hooks'],
        });
        expect(result.value.topResults[1]).toEqual({
          id: 'seg_002',
          score: 75,
          age: '7d',
          tags: ['react', 'typescript'],
        });
      }
    });

    test('should handle empty top results', () => {
      const logContent = `
[Memory:Retrieve:Debug] Top 5 by relevance score:
`;

      const result = parseDebugLog(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.topResults).toEqual([]);
      }
    });

    test('should handle tags with spaces (trimmed)', () => {
      const logContent = `
[Memory:Retrieve:Debug] Top 5 by relevance score:
[Memory:Retrieve:Debug]   - seg_abc123 (score=92, age=1d, tags=typescript, hooks, testing)
`;

      const result = parseDebugLog(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.topResults[0].tags).toEqual([
          'typescript',
          'hooks',
          'testing',
        ]);
      }
    });
  });

  describe('Complete Log Parsing', () => {
    test('should parse complete zero-result log (AC2)', () => {
      const logContent = `
[Memory:Retrieve:Debug] Query: "quantum computing"
[Memory:Retrieve:Debug] Terms extracted: ["quantum", "computing"]
[Memory:KeywordSearch:Debug] Index lookup: quantum=0 hits, computing=0 hits
[Memory:Retrieve:Debug] Total candidates before filtering: 0 segments
[Memory:Retrieve:Debug] Zero results - no index matches found
`;

      const result = parseDebugLog(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.query).toBe('quantum computing');
        expect(result.value.terms).toEqual(['quantum', 'computing']);
        expect(result.value.indexHits).toEqual({ quantum: 0, computing: 0 });
        expect(result.value.candidatesBeforeFilter).toBe(0);
      }
    });

    test('should parse complete filtered-out log (AC3)', () => {
      const logContent = `
[Memory:Retrieve:Debug] Query: "old typescript"
[Memory:Retrieve:Debug] Terms extracted: ["old", "typescript"]
[Memory:KeywordSearch:Debug] Index lookup: old=5 hits, typescript=15 hits
[Memory:Retrieve:Debug] Total candidates before filtering: 23 segments
[Memory:Retrieve:Debug] After recency filter (7d): 0 segments
[Memory:Retrieve:Debug] Zero results - all candidates filtered out
`;

      const result = parseDebugLog(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.query).toBe('old typescript');
        expect(result.value.candidatesBeforeFilter).toBe(23);
        expect(result.value.candidatesAfterRecency).toBe(0);
        expect(result.value.recencyWindow).toBe(7);
      }
    });

    test('should parse successful retrieval log', () => {
      const logContent = `
[Memory:Retrieve:Debug] Query: "typescript hooks"
[Memory:Retrieve:Debug] Terms extracted: ["typescript", "hooks"]
[Memory:KeywordSearch:Debug] Index lookup: typescript=15 hits, hooks=8 hits
[Memory:Retrieve:Debug] Total candidates before filtering: 23 segments
[Memory:Retrieve:Debug] After recency filter (30d): 18 segments
[Memory:Retrieve:Debug] After importance filter (min=40): 12 segments
[Memory:Retrieve:Debug] Top 5 by relevance score:
[Memory:Retrieve:Debug]   - seg_001 (score=92, age=2d, tags=typescript,hooks,react)
[Memory:Retrieve:Debug]   - seg_002 (score=85, age=5d, tags=typescript,nodejs)
`;

      const result = parseDebugLog(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.query).toBe('typescript hooks');
        expect(result.value.candidatesBeforeFilter).toBe(23);
        expect(result.value.candidatesAfterRecency).toBe(18);
        expect(result.value.candidatesAfterImportance).toBe(12);
        expect(result.value.topResults).toHaveLength(2);
      }
    });
  });

  describe('Graceful Error Handling (AC1)', () => {
    test('should handle empty log content', () => {
      const result = parseDebugLog('');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.query).toBe('');
        expect(result.value.terms).toEqual([]);
        expect(result.value.indexHits).toEqual({});
        expect(result.value.candidatesBeforeFilter).toBe(0);
      }
    });

    test('should handle log with no Memory markers', () => {
      const logContent = `
Some random log output
No memory markers here
Just plain text
`;

      const result = parseDebugLog(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.query).toBe('');
        expect(result.value.terms).toEqual([]);
      }
    });

    test('should handle partially malformed log', () => {
      const logContent = `
[Memory:Retrieve:Debug] Query: "test"
[Corrupted line with bad format
[Memory:Retrieve:Debug] Terms extracted: ["test"]
Random garbage
[Memory:KeywordSearch:Debug] Index lookup: test=5 hits
`;

      const result = parseDebugLog(logContent);

      // Should still parse valid lines
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.query).toBe('test');
        expect(result.value.terms).toEqual(['test']);
        expect(result.value.indexHits).toEqual({ test: 5 });
      }
    });
  });
});
