/**
 * Tests for Diagnostic Analyzer
 *
 * Story 4.6.3: Diagnostic Analysis Tools (AC1, AC2, AC3)
 */

import { describe, test, expect } from 'bun:test';
import { analyzeDiagnostics } from '../diagnostic-analyzer';

describe('Diagnostic Analyzer', () => {
  describe('Zero Result Diagnostics (AC2)', () => {
    test('should diagnose zero results from no index matches', () => {
      const logContent = `
[Memory:Retrieve:Debug] Query: "quantum computing"
[Memory:Retrieve:Debug] Terms extracted: ["quantum", "computing"]
[Memory:KeywordSearch:Debug] Index lookup: quantum=0 hits, computing=0 hits
[Memory:Retrieve:Debug] Total candidates before filtering: 0 segments
[Memory:Retrieve:Debug] Zero results - no index matches found
`;

      const result = analyzeDiagnostics(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.diagnosis).toBe('zero_results');
        expect(result.value.failurePoint).toBe('No index matches');
        expect(result.value.rootCause).toContain(
          'None of the query terms exist'
        );
        expect(result.value.recommendation).toBeTruthy();
      }
    });

    test('should identify which terms have no hits', () => {
      const logContent = `
[Memory:Retrieve:Debug] Query: "react quantum"
[Memory:Retrieve:Debug] Terms extracted: ["react", "quantum"]
[Memory:KeywordSearch:Debug] Index lookup: react=5 hits, quantum=0 hits
[Memory:Retrieve:Debug] Total candidates before filtering: 0 segments
`;

      const result = analyzeDiagnostics(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.diagnosis).toBe('zero_results');
        expect(result.value.rootCause).toContain('quantum');
      }
    });

    test('should explain partial match failures (MEDIUM-1)', () => {
      const logContent = `
[Memory:Retrieve:Debug] Query: "react quantum typescript"
[Memory:Retrieve:Debug] Terms extracted: ["react", "quantum", "typescript"]
[Memory:KeywordSearch:Debug] Index lookup: react=15 hits, quantum=0 hits, typescript=25 hits
[Memory:Retrieve:Debug] Total candidates before filtering: 0 segments
`;

      const result = analyzeDiagnostics(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.diagnosis).toBe('zero_results');
        expect(result.value.failurePoint).toBe('Partial match insufficient');
        expect(result.value.rootCause).toContain('Some terms matched');
        expect(result.value.rootCause).toContain('react');
        expect(result.value.rootCause).toContain('typescript');
        expect(result.value.rootCause).toContain('quantum');
        expect(result.value.rootCause).toContain('ALL terms to match');
      }
    });
  });

  describe('Filter Removal Diagnostics (AC3)', () => {
    test('should diagnose filtered out by recency', () => {
      const logContent = `
[Memory:Retrieve:Debug] Query: "old typescript"
[Memory:Retrieve:Debug] Terms extracted: ["old", "typescript"]
[Memory:KeywordSearch:Debug] Index lookup: old=5 hits, typescript=15 hits
[Memory:Retrieve:Debug] Total candidates before filtering: 23 segments
[Memory:Retrieve:Debug] After recency filter (7d): 0 segments
[Memory:Retrieve:Debug] Zero results - all candidates filtered out
`;

      const result = analyzeDiagnostics(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.diagnosis).toBe('filtered_out');
        expect(result.value.failurePoint).toBe('Recency filter (7d)');
        expect(result.value.rootCause).toContain('older than 7 days');
        expect(result.value.recommendation).toContain(
          'Increase recency_window_days'
        );
      }
    });

    test('should diagnose filtered out by importance', () => {
      const logContent = `
[Memory:Retrieve:Debug] Query: "typescript"
[Memory:Retrieve:Debug] Terms extracted: ["typescript"]
[Memory:KeywordSearch:Debug] Index lookup: typescript=15 hits
[Memory:Retrieve:Debug] Total candidates before filtering: 23 segments
[Memory:Retrieve:Debug] After recency filter (30d): 18 segments
[Memory:Retrieve:Debug] After importance filter (min=80): 0 segments
`;

      const result = analyzeDiagnostics(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.diagnosis).toBe('filtered_out');
        expect(result.value.failurePoint).toBe('Importance filter (min=80)');
        expect(result.value.rootCause).toContain('scored below 80');
        expect(result.value.recommendation).toContain(
          'min_importance_score'
        );
      }
    });

    test('should identify correct filter when multiple filters exist', () => {
      const logContent = `
[Memory:Retrieve:Debug] Query: "test"
[Memory:Retrieve:Debug] Terms extracted: ["test"]
[Memory:KeywordSearch:Debug] Index lookup: test=10 hits
[Memory:Retrieve:Debug] Total candidates before filtering: 10 segments
[Memory:Retrieve:Debug] After recency filter (30d): 5 segments
[Memory:Retrieve:Debug] After importance filter (min=40): 0 segments
`;

      const result = analyzeDiagnostics(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.diagnosis).toBe('filtered_out');
        // Should identify importance filter as the one that removed all
        expect(result.value.failurePoint).toContain('Importance');
      }
    });
  });

  describe('Success Diagnostics', () => {
    test('should diagnose successful retrieval', () => {
      const logContent = `
[Memory:Retrieve:Debug] Query: "typescript hooks"
[Memory:Retrieve:Debug] Terms extracted: ["typescript", "hooks"]
[Memory:KeywordSearch:Debug] Index lookup: typescript=15 hits, hooks=8 hits
[Memory:Retrieve:Debug] Total candidates before filtering: 23 segments
[Memory:Retrieve:Debug] After recency filter (30d): 18 segments
[Memory:Retrieve:Debug] Top 5 by relevance score:
[Memory:Retrieve:Debug]   - seg_001 (score=92, age=2d, tags=typescript,hooks)
[Memory:Retrieve:Debug]   - seg_002 (score=85, age=5d, tags=typescript)
`;

      const result = analyzeDiagnostics(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.diagnosis).toBe('success');
        expect(result.value.failurePoint).toBeUndefined();
        expect(result.value.rootCause).toBeUndefined();
        expect(result.value.details.topResults).toHaveLength(2);
      }
    });
  });

  describe('Low Relevance Diagnostics', () => {
    test('should diagnose low relevance when candidates exist but no top results', () => {
      const logContent = `
[Memory:Retrieve:Debug] Query: "test"
[Memory:Retrieve:Debug] Terms extracted: ["test"]
[Memory:KeywordSearch:Debug] Index lookup: test=5 hits
[Memory:Retrieve:Debug] Total candidates before filtering: 5 segments
[Memory:Retrieve:Debug] After recency filter (30d): 5 segments
[Memory:Retrieve:Debug] After importance filter (min=40): 3 segments
[Memory:Retrieve:Debug] Top 5 by relevance score:
`;

      const result = analyzeDiagnostics(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.diagnosis).toBe('low_relevance');
        expect(result.value.failurePoint).toBe('Ranking');
        expect(result.value.rootCause).toContain('scored too low');
        expect(result.value.recommendation).toBeTruthy();
      }
    });
  });

  describe('Graceful Error Handling (AC1)', () => {
    test('should handle empty log content', () => {
      const result = analyzeDiagnostics('');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should return valid diagnostic data with defaults
        expect(result.value.details.query).toBe('');
        expect(result.value.details.terms).toEqual([]);
      }
    });

    test('should handle malformed log content', () => {
      const logContent = `
Random garbage text
No valid log entries
`;

      const result = analyzeDiagnostics(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should parse successfully with defaults
        expect(result.value.details).toBeDefined();
      }
    });

    test('should handle partially valid log', () => {
      const logContent = `
[Memory:Retrieve:Debug] Query: "test"
Garbage line
[Memory:Retrieve:Debug] Terms extracted: ["test"]
More garbage
`;

      const result = analyzeDiagnostics(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.details.query).toBe('test');
        expect(result.value.details.terms).toEqual(['test']);
      }
    });
  });

  describe('Diagnostic Data Preservation', () => {
    test('should preserve all diagnostic data in report', () => {
      const logContent = `
[Memory:Retrieve:Debug] Query: "typescript"
[Memory:Retrieve:Debug] Terms extracted: ["typescript"]
[Memory:KeywordSearch:Debug] Index lookup: typescript=15 hits
[Memory:Retrieve:Debug] Total candidates before filtering: 15 segments
[Memory:Retrieve:Debug] After recency filter (30d): 12 segments
[Memory:Retrieve:Debug] After importance filter (min=40): 8 segments
[Memory:Retrieve:Debug] Top 5 by relevance score:
[Memory:Retrieve:Debug]   - seg_001 (score=92, age=2d, tags=typescript,hooks)
`;

      const result = analyzeDiagnostics(logContent);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.details.query).toBe('typescript');
        expect(result.value.details.terms).toEqual(['typescript']);
        expect(result.value.details.indexHits).toEqual({ typescript: 15 });
        expect(result.value.details.candidatesBeforeFilter).toBe(15);
        expect(result.value.details.candidatesAfterRecency).toBe(12);
        expect(result.value.details.candidatesAfterImportance).toBe(8);
        expect(result.value.details.recencyWindow).toBe(30);
        expect(result.value.details.minImportance).toBe(40);
        expect(result.value.details.topResults.length).toBe(1);
      }
    });
  });
});
