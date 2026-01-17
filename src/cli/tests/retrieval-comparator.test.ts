/**
 * Tests for Retrieval Comparator
 *
 * Story 4.6.3: Diagnostic Analysis Tools (AC5)
 */

import { describe, test, expect } from 'bun:test';
import { compareRetrievals, RetrievalRun } from '../retrieval-comparator';

describe('Retrieval Comparator', () => {
  describe('Comparison with Identical Runs (AC5)', () => {
    test('should show no differences for identical runs', async () => {
      const run1: RetrievalRun = {
        label: 'recency=7d',
        results: [
          { segmentId: 'seg_001', score: 85 },
          { segmentId: 'seg_002', score: 78 },
        ],
      };

      const run2: RetrievalRun = {
        label: 'recency=7d (repeat)',
        results: [
          { segmentId: 'seg_001', score: 85 },
          { segmentId: 'seg_002', score: 78 },
        ],
      };

      const result = await compareRetrievals(run1, run2);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.uniqueToRun1).toHaveLength(0);
        expect(result.value.uniqueToRun2).toHaveLength(0);
        expect(result.value.inBothRuns).toHaveLength(2);
        expect(result.value.explanation).toContain('identical');
      }
    });
  });

  describe('Comparison with Different Results (AC5)', () => {
    test('should identify segments unique to each run', async () => {
      const run1: RetrievalRun = {
        label: 'recency=7d',
        results: [{ segmentId: 'seg_001', score: 85 }],
      };

      const run2: RetrievalRun = {
        label: 'recency=30d',
        results: [
          { segmentId: 'seg_001', score: 85 },
          { segmentId: 'seg_002', score: 78 },
          { segmentId: 'seg_003', score: 72 },
        ],
      };

      const result = await compareRetrievals(run1, run2);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.uniqueToRun1).toHaveLength(0);
        expect(result.value.uniqueToRun2).toHaveLength(2);
        expect(result.value.uniqueToRun2).toContain('seg_002');
        expect(result.value.uniqueToRun2).toContain('seg_003');
        expect(result.value.inBothRuns).toEqual(['seg_001']);
      }
    });

    test('should calculate score differences', async () => {
      const run1: RetrievalRun = {
        label: 'config1',
        results: [
          { segmentId: 'seg_001', score: 85 },
          { segmentId: 'seg_002', score: 70 },
        ],
      };

      const run2: RetrievalRun = {
        label: 'config2',
        results: [
          { segmentId: 'seg_001', score: 90 },
          { segmentId: 'seg_002', score: 65 },
        ],
      };

      const result = await compareRetrievals(run1, run2);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.scoreDifferences).toHaveLength(2);

        const seg001Diff = result.value.scoreDifferences.find(
          (d) => d.segmentId === 'seg_001'
        );
        expect(seg001Diff).toBeDefined();
        expect(seg001Diff?.difference).toBe(5); // 90 - 85

        const seg002Diff = result.value.scoreDifferences.find(
          (d) => d.segmentId === 'seg_002'
        );
        expect(seg002Diff).toBeDefined();
        expect(seg002Diff?.difference).toBe(-5); // 65 - 70
      }
    });
  });

  describe('Explanation Generation (AC5)', () => {
    test('should generate explanation for run with more results', async () => {
      const run1: RetrievalRun = {
        label: 'recency=7d',
        results: [],
      };

      const run2: RetrievalRun = {
        label: 'recency=30d',
        results: [
          { segmentId: 'seg_001', score: 85 },
          { segmentId: 'seg_002', score: 78 },
        ],
      };

      const result = await compareRetrievals(run1, run2);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.explanation).toContain('additional');
        expect(result.value.explanation).toContain('recency=30d');
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle empty runs', async () => {
      const run1: RetrievalRun = {
        label: 'empty1',
        results: [],
      };

      const run2: RetrievalRun = {
        label: 'empty2',
        results: [],
      };

      const result = await compareRetrievals(run1, run2);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.uniqueToRun1).toHaveLength(0);
        expect(result.value.uniqueToRun2).toHaveLength(0);
        expect(result.value.inBothRuns).toHaveLength(0);
      }
    });
  });
});
