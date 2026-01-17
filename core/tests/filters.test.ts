import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { applyFilters } from '../filters';
import { SearchResult } from '../../providers/search/interface';
import { FilterOptions } from '../../types/filters';

const TEST_PAI_DIR = join(homedir(), 'pai-test-filters');
const TEST_REGISTRY_DIR = join(TEST_PAI_DIR, 'mem-store', 'structured');
const TEST_REGISTRY_FILE = join(TEST_REGISTRY_DIR, 'session-registry.json');

describe('Filter Pipeline', () => {
  beforeAll(() => {
    // Create test directory structure
    mkdirSync(TEST_REGISTRY_DIR, { recursive: true });

    // Create test registry with known data
    const testRegistry = {
      sessions: [],
      segments: {
        seg_001: {
          id: 'seg_001',
          sessionId: 'mem_001',
          timestamp: Date.now() - (2 * 24 * 60 * 60 * 1000), // 2 days ago
          importanceScore: 75,
          accessCount: 5,
          lastAccessed: Date.now() - (1 * 24 * 60 * 60 * 1000),
          tags: ['typescript', 'hook', 'error'],
          memoryType: 'episodic' as const,
          title: 'Fixed TypeScript hook error'
        },
        seg_042: {
          id: 'seg_042',
          sessionId: 'mem_001',
          timestamp: Date.now() - (10 * 24 * 60 * 60 * 1000), // 10 days ago
          importanceScore: 60,
          accessCount: 3,
          lastAccessed: Date.now() - (5 * 24 * 60 * 60 * 1000),
          tags: ['typescript', 'types'],
          memoryType: 'episodic' as const
        },
        seg_089: {
          id: 'seg_089',
          sessionId: 'mem_002',
          timestamp: Date.now() - (40 * 24 * 60 * 60 * 1000), // 40 days ago
          importanceScore: 30,
          accessCount: 1,
          lastAccessed: Date.now() - (35 * 24 * 60 * 60 * 1000),
          tags: ['typescript', 'refactor'],
          memoryType: 'episodic' as const
        }
      }
    };

    writeFileSync(TEST_REGISTRY_FILE, JSON.stringify(testRegistry, null, 2));

    // Set PAI_DIR for tests
    process.env.PAI_DIR = TEST_PAI_DIR;
  });

  afterAll(() => {
    // ALWAYS clean up test directory
    if (existsSync(TEST_PAI_DIR)) {
      rmSync(TEST_PAI_DIR, { recursive: true, force: true });
    }
    delete process.env.PAI_DIR;
  });

  describe('tag filtering', () => {
    test('should filter by single tag', async () => {
      const searchResults: SearchResult[] = [
        { segmentId: 'seg_001', matchCount: 2, matchedTerms: ['typescript', 'hook'] },
        { segmentId: 'seg_042', matchCount: 1, matchedTerms: ['typescript'] },
        { segmentId: 'seg_089', matchCount: 1, matchedTerms: ['typescript'] }
      ];

      const result = await applyFilters(searchResults, {
        tags: ['hook']  // Only seg_001 has 'hook' tag
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0].segmentId).toBe('seg_001');
      }
    });

    test('should filter by multiple tags (OR logic)', async () => {
      const searchResults: SearchResult[] = [
        { segmentId: 'seg_001', matchCount: 1, matchedTerms: ['error'] },
        { segmentId: 'seg_042', matchCount: 1, matchedTerms: ['types'] },
        { segmentId: 'seg_089', matchCount: 1, matchedTerms: ['refactor'] }
      ];

      const result = await applyFilters(searchResults, {
        tags: ['error', 'refactor']  // seg_001 and seg_089
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(2);
        const ids = result.value.map(r => r.segmentId);
        expect(ids).toContain('seg_001');
        expect(ids).toContain('seg_089');
      }
    });
  });

  describe('recency filtering', () => {
    test('should filter by 7 days recency', async () => {
      const searchResults: SearchResult[] = [
        { segmentId: 'seg_001', matchCount: 1, matchedTerms: ['test'] },
        { segmentId: 'seg_042', matchCount: 1, matchedTerms: ['test'] },
        { segmentId: 'seg_089', matchCount: 1, matchedTerms: ['test'] }
      ];

      const result = await applyFilters(searchResults, {
        recency: '7d'  // Only seg_001 (2 days ago)
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0].segmentId).toBe('seg_001');
      }
    });

    test('should filter by 30 days recency', async () => {
      const searchResults: SearchResult[] = [
        { segmentId: 'seg_001', matchCount: 1, matchedTerms: ['test'] },
        { segmentId: 'seg_042', matchCount: 1, matchedTerms: ['test'] },
        { segmentId: 'seg_089', matchCount: 1, matchedTerms: ['test'] }
      ];

      const result = await applyFilters(searchResults, {
        recency: '30d'  // seg_001 and seg_042
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(2);
        const ids = result.value.map(r => r.segmentId);
        expect(ids).toContain('seg_001');
        expect(ids).toContain('seg_042');
      }
    });
  });

  describe('importance filtering', () => {
    test('should filter by minimum importance score', async () => {
      const searchResults: SearchResult[] = [
        { segmentId: 'seg_001', matchCount: 1, matchedTerms: ['test'] },
        { segmentId: 'seg_042', matchCount: 1, matchedTerms: ['test'] },
        { segmentId: 'seg_089', matchCount: 1, matchedTerms: ['test'] }
      ];

      const result = await applyFilters(searchResults, {
        minImportance: 50  // seg_001 (75) and seg_042 (60)
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(2);
        result.value.forEach(r => {
          expect(r.metadata.importanceScore).toBeGreaterThanOrEqual(50);
        });
      }
    });
  });

  describe('access count filtering', () => {
    test('should filter by minimum access count', async () => {
      const searchResults: SearchResult[] = [
        { segmentId: 'seg_001', matchCount: 1, matchedTerms: ['test'] },
        { segmentId: 'seg_042', matchCount: 1, matchedTerms: ['test'] },
        { segmentId: 'seg_089', matchCount: 1, matchedTerms: ['test'] }
      ];

      const result = await applyFilters(searchResults, {
        minAccessCount: 3  // seg_001 (5) and seg_042 (3)
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(2);
        result.value.forEach(r => {
          expect(r.metadata.accessCount).toBeGreaterThanOrEqual(3);
        });
      }
    });
  });

  describe('combined filters (AND logic)', () => {
    test('should apply multiple filters with AND logic', async () => {
      const searchResults: SearchResult[] = [
        { segmentId: 'seg_001', matchCount: 1, matchedTerms: ['test'] },
        { segmentId: 'seg_042', matchCount: 1, matchedTerms: ['test'] },
        { segmentId: 'seg_089', matchCount: 1, matchedTerms: ['test'] }
      ];

      const result = await applyFilters(searchResults, {
        recency: '30d',         // seg_001, seg_042
        minImportance: 60,      // seg_001, seg_042
        minAccessCount: 4       // Only seg_001 (5)
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0].segmentId).toBe('seg_001');
      }
    });
  });

  describe('no filters (pass-through)', () => {
    test('should return all candidates when no filters specified', async () => {
      const searchResults: SearchResult[] = [
        { segmentId: 'seg_001', matchCount: 3, matchedTerms: ['a', 'b', 'c'] },
        { segmentId: 'seg_042', matchCount: 2, matchedTerms: ['a', 'b'] },
        { segmentId: 'seg_089', matchCount: 1, matchedTerms: ['a'] }
      ];

      const result = await applyFilters(searchResults);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(3);
      }
    });
  });

  describe('metadata preservation', () => {
    test('should return metadata with filter results', async () => {
      const searchResults: SearchResult[] = [
        { segmentId: 'seg_001', matchCount: 1, matchedTerms: ['test'] }
      ];

      const result = await applyFilters(searchResults);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0]).toHaveProperty('metadata');
        expect(result.value[0].metadata.id).toBe('seg_001');
        expect(result.value[0].metadata.tags).toEqual(['typescript', 'hook', 'error']);
        expect(result.value[0].metadata.importanceScore).toBe(75);
      }
    });

    test('should preserve match count from search results', async () => {
      const searchResults: SearchResult[] = [
        { segmentId: 'seg_001', matchCount: 3, matchedTerms: ['a', 'b', 'c'] }
      ];

      const result = await applyFilters(searchResults);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].matchCount).toBe(3);
        expect(result.value[0].matchedTerms).toEqual(['a', 'b', 'c']);
      }
    });
  });

  describe('error handling', () => {
    test('should handle missing registry file gracefully', async () => {
      // Delete registry temporarily
      rmSync(TEST_REGISTRY_FILE);

      const searchResults: SearchResult[] = [
        { segmentId: 'seg_001', matchCount: 1, matchedTerms: ['test'] }
      ];

      const result = await applyFilters(searchResults);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(0);
      }

      // Restore registry for other tests - recreate test data
      const testRegistry = {
        sessions: [],
        segments: {
          seg_001: {
            id: 'seg_001',
            sessionId: 'mem_001',
            timestamp: Date.now() - (2 * 24 * 60 * 60 * 1000),
            importanceScore: 75,
            accessCount: 5,
            lastAccessed: Date.now() - (1 * 24 * 60 * 60 * 1000),
            tags: ['typescript', 'hook', 'error'],
            memoryType: 'episodic' as const,
            title: 'Fixed TypeScript hook error'
          },
          seg_042: {
            id: 'seg_042',
            sessionId: 'mem_001',
            timestamp: Date.now() - (10 * 24 * 60 * 60 * 1000),
            importanceScore: 60,
            accessCount: 3,
            lastAccessed: Date.now() - (5 * 24 * 60 * 60 * 1000),
            tags: ['typescript', 'types'],
            memoryType: 'episodic' as const
          },
          seg_089: {
            id: 'seg_089',
            sessionId: 'mem_002',
            timestamp: Date.now() - (40 * 24 * 60 * 60 * 1000),
            importanceScore: 30,
            accessCount: 1,
            lastAccessed: Date.now() - (35 * 24 * 60 * 60 * 1000),
            tags: ['typescript', 'refactor'],
            memoryType: 'episodic' as const
          }
        }
      };
      writeFileSync(TEST_REGISTRY_FILE, JSON.stringify(testRegistry, null, 2));
    });

    test('should handle corrupted registry file', async () => {
      // Write corrupted JSON
      writeFileSync(TEST_REGISTRY_FILE, '{ invalid json }');

      const searchResults: SearchResult[] = [
        { segmentId: 'seg_001', matchCount: 1, matchedTerms: ['test'] }
      ];

      const result = await applyFilters(searchResults);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('FILTER_REGISTRY_CORRUPT');
      }

      // Restore registry for other tests
      const testRegistry = {
        sessions: [],
        segments: {
          seg_001: {
            id: 'seg_001',
            sessionId: 'mem_001',
            timestamp: Date.now() - (2 * 24 * 60 * 60 * 1000),
            importanceScore: 75,
            accessCount: 5,
            lastAccessed: Date.now() - (1 * 24 * 60 * 60 * 1000),
            tags: ['typescript', 'hook', 'error'],
            memoryType: 'episodic' as const,
            title: 'Fixed TypeScript hook error'
          },
          seg_042: {
            id: 'seg_042',
            sessionId: 'mem_001',
            timestamp: Date.now() - (10 * 24 * 60 * 60 * 1000),
            importanceScore: 60,
            accessCount: 3,
            lastAccessed: Date.now() - (5 * 24 * 60 * 60 * 1000),
            tags: ['typescript', 'types'],
            memoryType: 'episodic' as const
          },
          seg_089: {
            id: 'seg_089',
            sessionId: 'mem_002',
            timestamp: Date.now() - (40 * 24 * 60 * 60 * 1000),
            importanceScore: 30,
            accessCount: 1,
            lastAccessed: Date.now() - (35 * 24 * 60 * 60 * 1000),
            tags: ['typescript', 'refactor'],
            memoryType: 'episodic' as const
          }
        }
      };
      writeFileSync(TEST_REGISTRY_FILE, JSON.stringify(testRegistry, null, 2));
    });
  });

  describe('performance', () => {
    test('should complete filtering in < 50ms for 1000 candidates', async () => {
      // Create large search result set
      const searchResults: SearchResult[] = Array.from({ length: 1000 }, (_, i) => ({
        segmentId: `seg_${i.toString().padStart(3, '0')}`,
        matchCount: Math.floor(Math.random() * 10) + 1,
        matchedTerms: ['test']
      }));

      // Note: Only 3 segments exist in registry, so most will be filtered out

      const startTime = Date.now();

      await applyFilters(searchResults, {
        recency: '30d',
        minImportance: 50
      });

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(50);
    });
  });
});
