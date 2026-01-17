import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { logRetrieval, createLogEntry } from '../retrieval-logger';
import { RankedResult } from '../../../types/ranking';

const TEST_PAI_DIR = join(homedir(), 'pai-test-retrieval-logger');
const METRICS_DIR = join(TEST_PAI_DIR, 'mem-store/metrics');
const LOG_PATH = join(METRICS_DIR, 'retrieval-log.jsonl');

describe('Retrieval Logger', () => {
  beforeAll(() => {
    process.env.PAI_DIR = TEST_PAI_DIR;
  });

  afterAll(() => {
    if (existsSync(TEST_PAI_DIR)) {
      rmSync(TEST_PAI_DIR, { recursive: true, force: true });
    }
    delete process.env.PAI_DIR;
  });

  describe('logRetrieval()', () => {
    test('should create log directory if missing', () => {
      if (existsSync(METRICS_DIR)) {
        rmSync(METRICS_DIR, { recursive: true });
      }

      const entry = {
        timestamp: Date.now(),
        query: 'test query',
        retrieved: ['seg_001'],
        scores: [85],
        latencyMs: 50,
        injectedTokens: 100
      };

      logRetrieval(entry);

      expect(existsSync(METRICS_DIR)).toBe(true);
      expect(existsSync(LOG_PATH)).toBe(true);
    });

    test('should append log entries in JSONL format', () => {
      if (existsSync(LOG_PATH)) {
        rmSync(LOG_PATH);
      }

      const entry1 = {
        timestamp: Date.now(),
        query: 'first query',
        retrieved: ['seg_001', 'seg_002'],
        scores: [90, 75],
        latencyMs: 45,
        injectedTokens: 150
      };

      const entry2 = {
        timestamp: Date.now(),
        query: 'second query',
        retrieved: ['seg_003'],
        scores: [80],
        latencyMs: 60,
        injectedTokens: 200
      };

      logRetrieval(entry1);
      logRetrieval(entry2);

      const content = readFileSync(LOG_PATH, 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines.length).toBe(2);

      const parsed1 = JSON.parse(lines[0]);
      const parsed2 = JSON.parse(lines[1]);

      expect(parsed1.query).toBe('first query');
      expect(parsed2.query).toBe('second query');
      expect(parsed1.retrieved).toEqual(['seg_001', 'seg_002']);
      expect(parsed2.retrieved).toEqual(['seg_003']);
    });

    test('should handle logging errors gracefully', () => {
      // Invalid PAI_DIR path to trigger error
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = '/invalid/path/that/cannot/be/written';

      const entry = {
        timestamp: Date.now(),
        query: 'test',
        retrieved: [],
        scores: [],
        latencyMs: 10,
        injectedTokens: 0
      };

      // Should not throw
      expect(() => logRetrieval(entry)).not.toThrow();

      process.env.PAI_DIR = originalPaiDir;
    });

    test('should rotate log when exceeding size limit', () => {
      if (existsSync(LOG_PATH)) {
        rmSync(LOG_PATH);
      }

      // Create large log file (>10MB)
      const largeContent = 'x'.repeat(11 * 1024 * 1024);
      writeFileSync(LOG_PATH, largeContent, 'utf-8');

      const entry = {
        timestamp: Date.now(),
        query: 'test after rotation',
        retrieved: ['seg_001'],
        scores: [85],
        latencyMs: 50,
        injectedTokens: 100
      };

      logRetrieval(entry);

      // Original log should be rotated to .1
      expect(existsSync(`${LOG_PATH}.1`)).toBe(true);

      // New log should contain only new entry
      const content = readFileSync(LOG_PATH, 'utf-8');
      const parsed = JSON.parse(content.trim());
      expect(parsed.query).toBe('test after rotation');
    });

    test('should preserve log structure across writes', () => {
      if (existsSync(LOG_PATH)) {
        rmSync(LOG_PATH);
      }

      for (let i = 0; i < 10; i++) {
        const entry = {
          timestamp: Date.now() + i,
          query: `query ${i}`,
          retrieved: [`seg_${i}`],
          scores: [80 + i],
          latencyMs: 50 + i,
          injectedTokens: 100 + i * 10
        };
        logRetrieval(entry);
      }

      const content = readFileSync(LOG_PATH, 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines.length).toBe(10);

      // Each line should be valid JSON
      lines.forEach((line, i) => {
        const parsed = JSON.parse(line);
        expect(parsed.query).toBe(`query ${i}`);
        expect(parsed.retrieved).toEqual([`seg_${i}`]);
      });
    });
  });

  describe('createLogEntry()', () => {
    test('should create log entry from ranked results', () => {
      const now = Date.now();
      const rankedResults: RankedResult[] = [
        {
          segmentId: 'seg_001',
          relevanceScore: 87.5,
          componentScores: { termMatch: 75, recency: 90, importance: 80, access: 50 },
          matchCount: 3,
          matchedTerms: ['test'],
          metadata: {
            id: 'seg_001',
            sessionId: 'mem_001',
            timestamp: now,
            importanceScore: 80,
            accessCount: 5,
            lastAccessed: now,
            tags: ['test'],
            memoryType: 'episodic'
          }
        },
        {
          segmentId: 'seg_002',
          relevanceScore: 75.2,
          componentScores: { termMatch: 70, recency: 75, importance: 60, access: 40 },
          matchCount: 2,
          matchedTerms: ['test'],
          metadata: {
            id: 'seg_002',
            sessionId: 'mem_001',
            timestamp: now,
            importanceScore: 60,
            accessCount: 2,
            lastAccessed: now,
            tags: ['test'],
            memoryType: 'semantic'
          }
        }
      ];

      const entry = createLogEntry('test query', rankedResults, 45, 150);

      expect(entry.query).toBe('test query');
      expect(entry.retrieved).toEqual(['seg_001', 'seg_002']);
      expect(entry.scores).toEqual([88, 75]); // Rounded
      expect(entry.latencyMs).toBe(45);
      expect(entry.injectedTokens).toBe(150);
      expect(entry.timestamp).toBeGreaterThan(now - 1000);
    });

    test('should truncate long queries', () => {
      const longQuery = 'x'.repeat(250);
      const entry = createLogEntry(longQuery, [], 10, 0);

      expect(entry.query.length).toBeLessThan(longQuery.length);
      expect(entry.query).toContain('...');
    });

    test('should handle empty results', () => {
      const entry = createLogEntry('query with no results', [], 15, 0);

      expect(entry.query).toBe('query with no results');
      expect(entry.retrieved).toEqual([]);
      expect(entry.scores).toEqual([]);
      expect(entry.latencyMs).toBe(15);
      expect(entry.injectedTokens).toBe(0);
    });

    test('should round relevance scores', () => {
      const rankedResults: RankedResult[] = [
        {
          segmentId: 'seg_001',
          relevanceScore: 87.4,  // Should round to 87
          componentScores: { termMatch: 75, recency: 90, importance: 80, access: 50 },
          matchCount: 1,
          matchedTerms: ['test'],
          metadata: {
            id: 'seg_001',
            sessionId: 'mem_001',
            timestamp: Date.now(),
            importanceScore: 80,
            accessCount: 5,
            lastAccessed: Date.now(),
            tags: [],
            memoryType: 'episodic'
          }
        },
        {
          segmentId: 'seg_002',
          relevanceScore: 87.6,  // Should round to 88
          componentScores: { termMatch: 75, recency: 90, importance: 80, access: 50 },
          matchCount: 1,
          matchedTerms: ['test'],
          metadata: {
            id: 'seg_002',
            sessionId: 'mem_001',
            timestamp: Date.now(),
            importanceScore: 80,
            accessCount: 5,
            lastAccessed: Date.now(),
            tags: [],
            memoryType: 'episodic'
          }
        }
      ];

      const entry = createLogEntry('test', rankedResults, 10, 50);

      expect(entry.scores).toEqual([87, 88]);
    });

    test('should not truncate short queries', () => {
      const shortQuery = 'short query';
      const entry = createLogEntry(shortQuery, [], 10, 0);

      expect(entry.query).toBe(shortQuery);
      expect(entry.query).not.toContain('...');
    });
  });
});
