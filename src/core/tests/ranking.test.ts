import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { rankResults } from '../ranking';
import { FilterResult } from '../../types/filters';
import { RankingOptions } from '../../types/ranking';

const TEST_MEMSTORE_DIR = join(homedir(), '.memstore-test-ranking');

describe('Ranking Pipeline', () => {
  beforeAll(() => {
    mkdirSync(TEST_MEMSTORE_DIR, { recursive: true });
    process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;
  });

  afterAll(() => {
    if (existsSync(TEST_MEMSTORE_DIR)) {
      rmSync(TEST_MEMSTORE_DIR, { recursive: true, force: true });
    }
    delete process.env.MEMSTORE_DIR;
  });

  describe('term match scoring', () => {
    test('should score based on match count percentage', async () => {
      const now = Date.now();
      const filterResults: FilterResult[] = [
        {
          segmentId: 'seg_001',
          matchCount: 3,
          matchedTerms: ['typescript', 'hook', 'error'], // 3 matched terms
          totalQueryTerms: 4, // Query had 4 terms total
          metadata: {
            id: 'seg_001',
            sessionId: 'mem_001',
            timestamp: now - (2 * 24 * 60 * 60 * 1000),
            importanceScore: 50,
            accessCount: 5,
            lastAccessed: now,
            tags: ['typescript'],
            memoryType: 'episodic'
          }
        },
        {
          segmentId: 'seg_002',
          matchCount: 2,
          matchedTerms: ['typescript', 'hook'], // 2 matched terms
          totalQueryTerms: 4, // Query had 4 terms total
          metadata: {
            id: 'seg_002',
            sessionId: 'mem_001',
            timestamp: now - (2 * 24 * 60 * 60 * 1000),
            importanceScore: 50,
            accessCount: 5,
            lastAccessed: now,
            tags: ['typescript'],
            memoryType: 'episodic'
          }
        }
      ];

      const result = await rankResults(filterResults, {
        weights: { termMatch: 1.0, recency: 0, importance: 0, access: 0 }
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // seg_001: 3 of 4 terms = 75%, seg_002: 2 of 4 terms = 50% (per AC)
        expect(result.value[0].segmentId).toBe('seg_001'); // Higher match count ranks first
        expect(result.value[0].componentScores.termMatch).toBe(75);
        expect(result.value[1].componentScores.termMatch).toBe(50);
      }
    });
  });

  describe('recency scoring with exponential decay', () => {
    test('should score recent segments higher than old ones', async () => {
      const now = Date.now();
      const filterResults: FilterResult[] = [
        {
          segmentId: 'seg_recent',
          matchCount: 1,
          matchedTerms: ['test'],
          totalQueryTerms: 4,
          metadata: {
            id: 'seg_recent',
            sessionId: 'mem_001',
            timestamp: now - (2 * 24 * 60 * 60 * 1000),
            importanceScore: 0,
            accessCount: 1,
            lastAccessed: now - (1 * 24 * 60 * 60 * 1000), // Accessed 1 day ago
            tags: [],
            memoryType: 'episodic'
          }
        },
        {
          segmentId: 'seg_old',
          matchCount: 1,
          matchedTerms: ['test'],
          totalQueryTerms: 4,
          metadata: {
            id: 'seg_old',
            sessionId: 'mem_001',
            timestamp: now - (60 * 24 * 60 * 60 * 1000),
            importanceScore: 0,
            accessCount: 1,
            lastAccessed: now - (30 * 24 * 60 * 60 * 1000), // Accessed 30 days ago
            tags: [],
            memoryType: 'episodic'
          }
        }
      ];

      const result = await rankResults(filterResults, {
        weights: { termMatch: 0, recency: 1.0, importance: 0, access: 0 },
        decayHalfLifeDays: 14
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].segmentId).toBe('seg_recent');
        expect(result.value[1].segmentId).toBe('seg_old');
        expect(result.value[0].componentScores.recency).toBeGreaterThan(90);
        // Story 6.3: Old segment (60d creation, 30d access) scores ~15.6% with dual-recency
        expect(result.value[1].componentScores.recency).toBeLessThan(20);
      }
    });

    test('should use 14-day half-life by default', async () => {
      const now = Date.now();
      const filterResults: FilterResult[] = [{
        segmentId: 'seg_halflife',
        matchCount: 1,
        matchedTerms: ['test'],
          totalQueryTerms: 4,
        metadata: {
          id: 'seg_halflife',
          sessionId: 'mem_001',
          timestamp: now - (14 * 24 * 60 * 60 * 1000),
          importanceScore: 0,
          accessCount: 1,
          lastAccessed: now - (14 * 24 * 60 * 60 * 1000), // Accessed same time as creation (14 days ago)
          tags: [],
          memoryType: 'episodic'
        }
      }];

      const result = await rankResults(filterResults, {
        weights: { termMatch: 0, recency: 1.0, importance: 0, access: 0 }
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // With dual-recency at same timestamp: creation=0.5, access=0.5, combined = 0.4*0.5 + 0.6*0.5 = 0.5 = 50
        expect(result.value[0].componentScores.recency).toBeCloseTo(50, 0);
      }
    });
  });

  describe('importance scoring', () => {
    test('should score higher importance segments higher', async () => {
      const now = Date.now();
      const filterResults: FilterResult[] = [
        {
          segmentId: 'seg_high',
          matchCount: 1,
          matchedTerms: ['test'],
          totalQueryTerms: 4,
          metadata: {
            id: 'seg_high',
            sessionId: 'mem_001',
            timestamp: now,
            importanceScore: 80,
            accessCount: 0,
            lastAccessed: null,
            tags: [],
            memoryType: 'episodic'
          }
        },
        {
          segmentId: 'seg_low',
          matchCount: 1,
          matchedTerms: ['test'],
          totalQueryTerms: 4,
          metadata: {
            id: 'seg_low',
            sessionId: 'mem_001',
            timestamp: now,
            importanceScore: 20,
            accessCount: 0,
            lastAccessed: null,
            tags: [],
            memoryType: 'episodic'
          }
        }
      ];

      const result = await rankResults(filterResults, {
        weights: { termMatch: 0, recency: 0, importance: 1.0, access: 0 }
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].segmentId).toBe('seg_high');
        expect(result.value[1].segmentId).toBe('seg_low');
        expect(result.value[0].componentScores.importance).toBe(80);
        expect(result.value[1].componentScores.importance).toBe(20);
      }
    });
  });

  describe('access count scoring with saturation', () => {
    test('should score frequently accessed segments higher', async () => {
      const now = Date.now();
      const filterResults: FilterResult[] = [
        {
          segmentId: 'seg_popular',
          matchCount: 1,
          matchedTerms: ['test'],
          totalQueryTerms: 4,
          metadata: {
            id: 'seg_popular',
            sessionId: 'mem_001',
            timestamp: now,
            importanceScore: 0,
            accessCount: 15,
            lastAccessed: now,
            tags: [],
            memoryType: 'episodic'
          }
        },
        {
          segmentId: 'seg_rare',
          matchCount: 1,
          matchedTerms: ['test'],
          totalQueryTerms: 4,
          metadata: {
            id: 'seg_rare',
            sessionId: 'mem_001',
            timestamp: now,
            importanceScore: 0,
            accessCount: 3,
            lastAccessed: now,
            tags: [],
            memoryType: 'episodic'
          }
        }
      ];

      const result = await rankResults(filterResults, {
        weights: { termMatch: 0, recency: 0, importance: 0, access: 1.0 }
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].segmentId).toBe('seg_popular');
        expect(result.value[1].segmentId).toBe('seg_rare');
        expect(result.value[0].componentScores.access).toBe(75);
        expect(result.value[1].componentScores.access).toBe(15);
      }
    });

    test('should saturate at 20+ accesses', async () => {
      const now = Date.now();
      const filterResults: FilterResult[] = [{
        segmentId: 'seg_saturated',
        matchCount: 1,
        matchedTerms: ['test'],
          totalQueryTerms: 4,
        metadata: {
          id: 'seg_saturated',
          sessionId: 'mem_001',
          timestamp: now,
          importanceScore: 0,
          accessCount: 50,
          lastAccessed: now,
          tags: [],
          memoryType: 'episodic'
        }
      }];

      const result = await rankResults(filterResults, {
        weights: { termMatch: 0, recency: 0, importance: 0, access: 1.0 }
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].componentScores.access).toBe(100);
      }
    });
  });

  describe('combined scoring with default weights', () => {
    test('should combine all factors with 40/30/20/10 weights', async () => {
      const now = Date.now();
      const filterResult: FilterResult = {
        segmentId: 'seg_combined',
        matchCount: 3,
        matchedTerms: ['typescript', 'hook', 'error'],
          totalQueryTerms: 4,
        totalQueryTerms: 4, // Query had 4 terms
        metadata: {
          id: 'seg_combined',
          sessionId: 'mem_001',
          timestamp: now - (7 * 24 * 60 * 60 * 1000),
          importanceScore: 60,
          accessCount: 10,
          lastAccessed: now,
          tags: ['typescript'],
          memoryType: 'episodic'
        }
      };

      const result = await rankResults([filterResult]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const ranked = result.value[0];

        // Term match: 3 of 4 terms = 0.75 → 75% (per AC)
        expect(ranked.componentScores.termMatch).toBe(75);

        // Recency (Story 6.3 dual-recency):
        // Created 7 days ago: 0.707
        // Accessed just now: 1.0
        // Combined: 0.4 * 0.707 + 0.6 * 1.0 = 0.8828 ≈ 88.3%
        expect(ranked.componentScores.recency).toBeCloseTo(88.3, 0);

        // Importance: 60/100 = 60%
        expect(ranked.componentScores.importance).toBe(60);

        // Access: 10/20 = 50%
        expect(ranked.componentScores.access).toBe(50);

        // Final: 0.40*75 + 0.30*88.3 + 0.20*60 + 0.10*50
        //      = 30 + 26.49 + 12 + 5 = 73.49
        expect(ranked.relevanceScore).toBeCloseTo(73.49, 0);
      }
    });
  });

  describe('sorting and tie-breaking', () => {
    test('should sort by score descending', async () => {
      const now = Date.now();
      const filterResults: FilterResult[] = [
        {
          segmentId: 'seg_low',
          matchCount: 1,
          matchedTerms: ['test'],
          totalQueryTerms: 4,
          metadata: {
            id: 'seg_low',
            sessionId: 'mem_001',
            timestamp: now,
            importanceScore: 20,
            accessCount: 0,
            lastAccessed: null,
            tags: [],
            memoryType: 'episodic'
          }
        },
        {
          segmentId: 'seg_high',
          matchCount: 1,
          matchedTerms: ['test'],
          totalQueryTerms: 4,
          metadata: {
            id: 'seg_high',
            sessionId: 'mem_001',
            timestamp: now,
            importanceScore: 80,
            accessCount: 0,
            lastAccessed: null,
            tags: [],
            memoryType: 'episodic'
          }
        },
        {
          segmentId: 'seg_medium',
          matchCount: 1,
          matchedTerms: ['test'],
          totalQueryTerms: 4,
          metadata: {
            id: 'seg_medium',
            sessionId: 'mem_001',
            timestamp: now,
            importanceScore: 50,
            accessCount: 0,
            lastAccessed: null,
            tags: [],
            memoryType: 'episodic'
          }
        }
      ];

      const result = await rankResults(filterResults, {
        weights: { termMatch: 0, recency: 0, importance: 1.0, access: 0 }
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].segmentId).toBe('seg_high');
        expect(result.value[1].segmentId).toBe('seg_medium');
        expect(result.value[2].segmentId).toBe('seg_low');
      }
    });

    test('should break ties by timestamp (newer first)', async () => {
      const now = Date.now();
      const filterResults: FilterResult[] = [
        {
          segmentId: 'seg_old',
          matchCount: 1,
          matchedTerms: ['test'],
          totalQueryTerms: 4,
          metadata: {
            id: 'seg_old',
            sessionId: 'mem_001',
            timestamp: now - (10 * 24 * 60 * 60 * 1000),
            importanceScore: 50,
            accessCount: 0,
            lastAccessed: null,
            tags: [],
            memoryType: 'episodic'
          }
        },
        {
          segmentId: 'seg_new',
          matchCount: 1,
          matchedTerms: ['test'],
          totalQueryTerms: 4,
          metadata: {
            id: 'seg_new',
            sessionId: 'mem_001',
            timestamp: now - (1 * 24 * 60 * 60 * 1000),
            importanceScore: 50,
            accessCount: 0,
            lastAccessed: null,
            tags: [],
            memoryType: 'episodic'
          }
        }
      ];

      const result = await rankResults(filterResults, {
        weights: { termMatch: 0, recency: 0, importance: 1.0, access: 0 }
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Both have same importance (50), newer should come first
        expect(result.value[0].segmentId).toBe('seg_new');
        expect(result.value[1].segmentId).toBe('seg_old');
      }
    });
  });

  describe('limit and minScore filtering', () => {
    test('should apply limit to results', async () => {
      const now = Date.now();
      const filterResults: FilterResult[] = Array.from({ length: 20 }, (_, i) => ({
        segmentId: `seg_${i}`,
        matchCount: 1,
        matchedTerms: ['test'],
          totalQueryTerms: 4,
        metadata: {
          id: `seg_${i}`,
          sessionId: 'mem_001',
          timestamp: now,
          importanceScore: 50,
          accessCount: 0,
          lastAccessed: null,
          tags: [],
          memoryType: 'episodic' as const
        }
      }));

      const result = await rankResults(filterResults, { limit: 5 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(5);
      }
    });

    test('should filter by minimum score', async () => {
      const now = Date.now();
      const filterResults: FilterResult[] = [
        {
          segmentId: 'seg_high',
          matchCount: 1,
          matchedTerms: ['test'],
          totalQueryTerms: 4,
          metadata: {
            id: 'seg_high',
            sessionId: 'mem_001',
            timestamp: now,
            importanceScore: 80,
            accessCount: 0,
            lastAccessed: null,
            tags: [],
            memoryType: 'episodic'
          }
        },
        {
          segmentId: 'seg_low',
          matchCount: 1,
          matchedTerms: ['test'],
          totalQueryTerms: 4,
          metadata: {
            id: 'seg_low',
            sessionId: 'mem_001',
            timestamp: now,
            importanceScore: 10,
            accessCount: 0,
            lastAccessed: null,
            tags: [],
            memoryType: 'episodic'
          }
        }
      ];

      const result = await rankResults(filterResults, {
        weights: { termMatch: 0, recency: 0, importance: 1.0, access: 0 },
        minScore: 50
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0].segmentId).toBe('seg_high');
      }
    });

    test('should use default limit of 10', async () => {
      const now = Date.now();
      const filterResults: FilterResult[] = Array.from({ length: 20 }, (_, i) => ({
        segmentId: `seg_${i}`,
        matchCount: 1,
        matchedTerms: ['test'],
          totalQueryTerms: 4,
        metadata: {
          id: `seg_${i}`,
          sessionId: 'mem_001',
          timestamp: now,
          importanceScore: 50,
          accessCount: 0,
          lastAccessed: null,
          tags: [],
          memoryType: 'episodic' as const
        }
      }));

      const result = await rankResults(filterResults);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(10);
      }
    });
  });

  describe('edge cases', () => {
    test('should handle empty results', async () => {
      const result = await rankResults([]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(0);
      }
    });

    test('should handle single result', async () => {
      const now = Date.now();
      const filterResults: FilterResult[] = [{
        segmentId: 'seg_only',
        matchCount: 1,
        matchedTerms: ['test'],
          totalQueryTerms: 4,
        metadata: {
          id: 'seg_only',
          sessionId: 'mem_001',
          timestamp: now,
          importanceScore: 50,
          accessCount: 5,
          lastAccessed: now,
          tags: [],
          memoryType: 'episodic'
        }
      }];

      const result = await rankResults(filterResults);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0].segmentId).toBe('seg_only');
        expect(result.value[0].relevanceScore).toBeGreaterThan(0);
      }
    });

    test('should handle missing metadata gracefully', async () => {
      const now = Date.now();
      const filterResults: FilterResult[] = [{
        segmentId: 'seg_missing',
        matchCount: 1,
        matchedTerms: ['test'],
          totalQueryTerms: 4,
        metadata: {
          id: 'seg_missing',
          sessionId: 'mem_001',
          timestamp: now,
          importanceScore: 0,
          accessCount: 0,
          lastAccessed: null,
          tags: [],
          memoryType: 'episodic'
        }
      }];

      const result = await rankResults(filterResults);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0].relevanceScore).toBeGreaterThan(0);
      }
    });
  });

  describe('performance', () => {
    test('should complete ranking in < 20ms for 100 candidates', async () => {
      const now = Date.now();
      const filterResults: FilterResult[] = Array.from({ length: 100 }, (_, i) => ({
        segmentId: `seg_${i}`,
        matchCount: Math.floor(Math.random() * 5) + 1,
        matchedTerms: ['test'],
          totalQueryTerms: 4,
        metadata: {
          id: `seg_${i}`,
          sessionId: 'mem_001',
          timestamp: now - (Math.random() * 90 * 24 * 60 * 60 * 1000),
          importanceScore: Math.floor(Math.random() * 100),
          accessCount: Math.floor(Math.random() * 30),
          lastAccessed: Math.random() > 0.5 ? now : null,
          tags: [],
          memoryType: 'episodic' as const
        }
      }));

      const startTime = Date.now();
      const result = await rankResults(filterResults);
      const elapsed = Date.now() - startTime;

      expect(result.ok).toBe(true);
      expect(elapsed).toBeLessThan(20);
    });
  });

  describe('custom weights', () => {
    test('should use custom weights when provided', async () => {
      const now = Date.now();
      const filterResult: FilterResult = {
        segmentId: 'seg_custom',
        matchCount: 1,
        matchedTerms: ['test'],
          totalQueryTerms: 4,
        metadata: {
          id: 'seg_custom',
          sessionId: 'mem_001',
          timestamp: now,
          importanceScore: 100,
          accessCount: 0,
          lastAccessed: null,
          tags: [],
          memoryType: 'episodic'
        }
      };

      const result = await rankResults([filterResult], {
        weights: {
          termMatch: 0,
          recency: 0,
          importance: 1.0,
          access: 0
        }
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].relevanceScore).toBeCloseTo(100, 0);
      }
    });
  });
});
