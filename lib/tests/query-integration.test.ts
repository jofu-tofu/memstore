import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { querySessionsByDate, querySessionsByTag, clearRegistryCache } from '../registry-query';
import { findSegmentsByKeyword, findSegmentsByKeywords, clearKeywordIndexCache } from '../segment-search';
import { readSegment, readSessionSegments } from '../segment-reader';

/**
 * Integration tests for query tools
 *
 * These tests verify end-to-end workflows combining multiple query modules:
 * 1. Find sessions by tag → Read session segments
 * 2. Find segments by keyword → Read segment content
 * 3. Find sessions by date → Find segments → Read content
 */
describe('Query Integration Tests', () => {
  let testPaiDir: string;

  beforeEach(() => {
    // Create isolated test directory
    testPaiDir = join(homedir(), 'pai-test-query-integration');
    mkdirSync(testPaiDir, { recursive: true });
    process.env.PAI_DIR = testPaiDir;

    // Create comprehensive test data
    const memStoreDir = join(testPaiDir, 'mem-store');
    const structuredDir = join(memStoreDir, 'structured');
    const indexesDir = join(memStoreDir, 'indexes', 'keyword');
    const segmentsDir2026_01 = join(memStoreDir, 'segments', '2026-01');
    const segmentsDir2026_02 = join(memStoreDir, 'segments', '2026-02');

    mkdirSync(structuredDir, { recursive: true });
    mkdirSync(indexesDir, { recursive: true });
    mkdirSync(segmentsDir2026_01, { recursive: true });
    mkdirSync(segmentsDir2026_02, { recursive: true });

    // Create session registry
    const registry = {
      version: '1.0',
      sessions: [
        {
          sessionId: 'mem_1768867200000_abcdef12',
          capturedAt: Date.parse('2026-01-15'),
          segmentCount: 2,
          tags: ['typescript', 'hooks', 'memory'],
          archived: false
        },
        {
          sessionId: 'mem_1770777600000_12345678',
          capturedAt: Date.parse('2026-02-10'),
          segmentCount: 1,
          tags: ['auth', 'security'],
          archived: false
        }
      ]
    };
    writeFileSync(join(structuredDir, 'session-registry.json'), JSON.stringify(registry, null, 2));

    // Create keyword index
    const keywordIndex = {
      typescript: ['seg_1768867200000_a1b2c3d4', 'seg_1769126400000_e5f6abcd'],
      hooks: ['seg_1768867200000_a1b2c3d4'],
      memory: ['seg_1769126400000_e5f6abcd'],
      auth: ['seg_1770777600000_99999999'],
      security: ['seg_1770777600000_99999999']
    };
    writeFileSync(join(indexesDir, 'index.json'), JSON.stringify(keywordIndex, null, 2));

    // Create segment 1 (January 2026, session 1)
    const segment1 = `---
id: seg_1768867200000_a1b2c3d4
session_id: mem_1768867200000_abcdef12
timestamp: 1768867200000
importance_score: 85
access_count: 10
last_accessed: 1768953600000
tags:
  - typescript
  - hooks
memory_type: episodic
source_range:
  start: 0
  end: 1500
---
User asked about TypeScript hooks pattern for memory system.
Assistant explained the hook lifecycle and best practices.`;
    writeFileSync(join(segmentsDir2026_01, 'seg_1768867200000_a1b2c3d4.md'), segment1);

    // Create segment 2 (January 2026, session 1)
    const segment2 = `---
id: seg_1769126400000_e5f6abcd
session_id: mem_1768867200000_abcdef12
timestamp: 1769126400000
importance_score: 75
access_count: 5
last_accessed: 1769212800000
tags:
  - typescript
  - memory
memory_type: semantic
source_range:
  start: 1500
  end: 3000
---
Follow-up discussion about memory optimization strategies.
Covered caching, pagination, and performance tuning.`;
    writeFileSync(join(segmentsDir2026_01, 'seg_1769126400000_e5f6abcd.md'), segment2);

    // Create segment 3 (February 2026, session 2)
    const segment3 = `---
id: seg_1770777600000_99999999
session_id: mem_1770777600000_12345678
timestamp: 1770777600000
importance_score: 95
access_count: 15
last_accessed: 1770864000000
tags:
  - auth
  - security
memory_type: procedural
source_range:
  start: 0
  end: 2000
---
Implementation guide for authentication and security patterns.
JWT tokens, session management, and RBAC setup.`;
    writeFileSync(join(segmentsDir2026_02, 'seg_1770777600000_99999999.md'), segment3);
  });

  afterEach(() => {
    // ALWAYS clean up
    if (existsSync(testPaiDir)) {
      rmSync(testPaiDir, { recursive: true, force: true });
    }
    delete process.env.PAI_DIR;
  });

  describe('End-to-End Query Workflows', () => {
    test('should find sessions by tag and read all their segments', () => {
      // Workflow: Find sessions tagged "typescript" → Read all segments from those sessions

      // Step 1: Find sessions by tag
      const sessionsResult = querySessionsByTag('typescript');
      expect(sessionsResult.ok).toBe(true);
      if (!sessionsResult.ok) return;

      expect(sessionsResult.value.length).toBe(1);
      const session = sessionsResult.value[0];
      expect(session.sessionId).toBe('mem_1768867200000_abcdef12');
      expect(session.tags).toContain('typescript');

      // Step 2: Read all segments from the session
      const segmentsResult = readSessionSegments(session.sessionId);
      expect(segmentsResult.ok).toBe(true);
      if (!segmentsResult.ok) return;

      expect(segmentsResult.value.length).toBe(2);
      const segmentIds = segmentsResult.value.map(s => s.id);
      expect(segmentIds).toContain('seg_1768867200000_a1b2c3d4');
      expect(segmentIds).toContain('seg_1769126400000_e5f6abcd');

      // Step 3: Verify segment content
      const firstSegment = segmentsResult.value.find(s => s.id === 'seg_1768867200000_a1b2c3d4');
      expect(firstSegment).toBeDefined();
      expect(firstSegment?.content).toContain('TypeScript hooks pattern');
    });

    test('should find segments by keyword and read their content', async () => {
      // Workflow: Search by keyword "typescript" → Read matching segments

      // Step 1: Find segments by keyword
      const searchResult = await findSegmentsByKeyword('typescript');
      expect(searchResult.ok).toBe(true);
      if (!searchResult.ok) return;

      expect(searchResult.value.length).toBe(2);
      expect(searchResult.value).toContain('seg_1768867200000_a1b2c3d4');
      expect(searchResult.value).toContain('seg_1769126400000_e5f6abcd');

      // Step 2: Read the first segment
      const segmentResult = readSegment(searchResult.value[0]);
      expect(segmentResult.ok).toBe(true);
      if (!segmentResult.ok) return;

      expect(segmentResult.value.id).toBe('seg_1768867200000_a1b2c3d4');
      expect(segmentResult.value.tags).toContain('typescript');
      expect(segmentResult.value.content).toContain('TypeScript hooks pattern');
      expect(segmentResult.value.accessCount).toBe(10);
    });

    test('should find sessions by date, then find segments by keyword within date range', async () => {
      // Workflow: Find Jan 2026 sessions → Find typescript segments → Verify overlap

      // Step 1: Find sessions in January 2026
      const startMs = Date.parse('2026-01-01');
      const endMs = Date.parse('2026-01-31T23:59:59.999Z');
      const sessionsResult = querySessionsByDate(startMs, endMs);
      expect(sessionsResult.ok).toBe(true);
      if (!sessionsResult.ok) return;

      expect(sessionsResult.value.length).toBe(1);
      expect(sessionsResult.value[0].sessionId).toBe('mem_1768867200000_abcdef12');

      // Step 2: Find segments by keyword
      const searchResult = await findSegmentsByKeyword('typescript');
      expect(searchResult.ok).toBe(true);
      if (!searchResult.ok) return;

      // Step 3: Read segments and verify they're from Jan 2026 sessions
      for (const segmentId of searchResult.value) {
        const segmentResult = readSegment(segmentId);
        expect(segmentResult.ok).toBe(true);
        if (!segmentResult.ok) continue;

        const segment = segmentResult.value;
        expect(segment.timestamp).toBeGreaterThanOrEqual(startMs);
        expect(segment.timestamp).toBeLessThanOrEqual(endMs);
        expect(segment.sessionId).toBe('mem_1768867200000_abcdef12');
      }
    });

    test('should find segments by multiple keywords with scoring and read highest scored', async () => {
      // Workflow: Multi-keyword search → Sort by score → Read top result

      // Step 1: Find segments matching multiple keywords
      const searchResult = await findSegmentsByKeywords(['typescript', 'hooks']);
      expect(searchResult.ok).toBe(true);
      if (!searchResult.ok) return;

      expect(searchResult.value.length).toBeGreaterThan(0);

      // Step 2: Verify scoring (segments matching more keywords scored higher)
      const matches = searchResult.value;
      expect(matches[0].matchScore).toBeGreaterThanOrEqual(matches[matches.length - 1].matchScore);

      // Step 3: Read the highest scored segment
      const topMatch = matches[0];
      const segmentResult = readSegment(topMatch.segmentId);
      expect(segmentResult.ok).toBe(true);
      if (!segmentResult.ok) return;

      const segment = segmentResult.value;
      expect(segment.id).toBe(topMatch.segmentId);
      expect(topMatch.matchedKeywords.every(kw =>
        segment.tags.includes(kw) || segment.content.toLowerCase().includes(kw)
      )).toBe(true);
    });

    test('should handle cross-session queries with multiple tags', () => {
      // Workflow: Find sessions with typescript OR auth → Count total segments

      // Step 1: Find sessions with either tag
      const sessionsResult = querySessionsByTag(['typescript', 'auth'], 'any');
      expect(sessionsResult.ok).toBe(true);
      if (!sessionsResult.ok) return;

      expect(sessionsResult.value.length).toBe(2);

      // Step 2: Read segments from all matching sessions
      let totalSegments = 0;
      for (const session of sessionsResult.value) {
        const segmentsResult = readSessionSegments(session.sessionId);
        expect(segmentsResult.ok).toBe(true);
        if (!segmentsResult.ok) continue;

        totalSegments += segmentsResult.value.length;

        // Verify each segment belongs to the session
        for (const segment of segmentsResult.value) {
          expect(segment.sessionId).toBe(session.sessionId);
        }
      }

      expect(totalSegments).toBe(3); // 2 from typescript session, 1 from auth session
    });

    test('should correlate keyword search results with session metadata', async () => {
      // Workflow: Find segments by keyword → Look up parent sessions → Verify tags

      // Step 1: Find segments by keyword "auth"
      const searchResult = await findSegmentsByKeyword('auth');
      expect(searchResult.ok).toBe(true);
      if (!searchResult.ok) return;

      expect(searchResult.value.length).toBe(1);

      // Step 2: Read the segment
      const segmentResult = readSegment(searchResult.value[0]);
      expect(segmentResult.ok).toBe(true);
      if (!segmentResult.ok) return;

      const segment = segmentResult.value;

      // Step 3: Find the parent session
      const sessionId = segment.sessionId;
      const sessionsResult = querySessionsByDate(Date.parse('2026-01-01'), Date.parse('2026-12-31'));
      expect(sessionsResult.ok).toBe(true);
      if (!sessionsResult.ok) return;

      const parentSession = sessionsResult.value.find(s => s.sessionId === sessionId);
      expect(parentSession).toBeDefined();

      // Step 4: Verify keyword appears in session tags
      expect(parentSession?.tags).toContain('auth');
      expect(segment.tags).toContain('auth');
    });

    test('should handle empty result sets gracefully in workflows', async () => {
      // Workflow: Search for non-existent keyword → Verify empty but successful results

      // Step 1: Search for keyword that doesn't exist
      const searchResult = await findSegmentsByKeyword('nonexistent');
      expect(searchResult.ok).toBe(true);
      if (!searchResult.ok) return;

      expect(searchResult.value.length).toBe(0);

      // Step 2: Try to find sessions with non-existent tag
      const sessionsResult = querySessionsByTag('nonexistent');
      expect(sessionsResult.ok).toBe(true);
      if (!sessionsResult.ok) return;

      expect(sessionsResult.value.length).toBe(0);

      // Workflow succeeds even with no results
    });

    test('should support paginated queries across multiple sessions', () => {
      // Workflow: Paginate session queries → Read segments from each page

      // Step 1: Get first page
      const startMs = Date.parse('2026-01-01');
      const endMs = Date.parse('2026-12-31');
      const page1Result = querySessionsByDate(startMs, endMs, { limit: 1, offset: 0 });
      expect(page1Result.ok).toBe(true);
      if (!page1Result.ok) return;

      expect(page1Result.value.length).toBe(1);

      // Step 2: Get second page
      const page2Result = querySessionsByDate(startMs, endMs, { limit: 1, offset: 1 });
      expect(page2Result.ok).toBe(true);
      if (!page2Result.ok) return;

      expect(page2Result.value.length).toBe(1);

      // Step 3: Verify pages don't overlap
      expect(page1Result.value[0].sessionId).not.toBe(page2Result.value[0].sessionId);

      // Step 4: Read segments from both pages
      const segments1Result = readSessionSegments(page1Result.value[0].sessionId);
      const segments2Result = readSessionSegments(page2Result.value[0].sessionId);

      expect(segments1Result.ok).toBe(true);
      expect(segments2Result.ok).toBe(true);
    });
  });

  describe('Error Handling in Workflows', () => {
    test('should gracefully handle segment not found during workflow', async () => {
      // Workflow: Search finds segment ID → Segment file deleted → Read fails gracefully

      // Step 1: Find segments by keyword
      const searchResult = await findSegmentsByKeyword('typescript');
      expect(searchResult.ok).toBe(true);
      if (!searchResult.ok) return;

      const segmentId = searchResult.value[0];

      // Step 2: Try to read a segment that was in index but doesn't exist
      const invalidSegmentId = 'seg_1768867200000_00000000'; // Valid format but doesn't exist
      const segmentResult = readSegment(invalidSegmentId);

      // Should fail gracefully with proper error
      expect(segmentResult.ok).toBe(false);
      if (segmentResult.ok) return;

      expect(segmentResult.error.code).toBe('QUERY_SEGMENT_NOT_FOUND');
    });

    test('should handle missing registry during workflow', () => {
      // Workflow: Delete registry → Query fails gracefully

      // Step 1: Delete registry file
      const registryPath = join(testPaiDir, 'mem-store', 'structured', 'session-registry.json');
      rmSync(registryPath, { force: true });

      // Step 2: Clear cache so it tries to reload
      clearRegistryCache();

      // Step 3: Try to query sessions
      const sessionsResult = querySessionsByDate(0, Date.now());

      // Should fail gracefully
      expect(sessionsResult.ok).toBe(false);
      if (sessionsResult.ok) return;

      expect(sessionsResult.error.code).toBe('QUERY_REGISTRY_NOT_FOUND');
    });

    test('should handle missing keyword index during workflow', async () => {
      // Workflow: Delete index → Search fails gracefully

      // Step 1: Delete keyword index
      const indexPath = join(testPaiDir, 'mem-store', 'indexes', 'keyword', 'index.json');
      rmSync(indexPath, { force: true });

      // Step 2: Clear cache so it tries to reload
      clearKeywordIndexCache();

      // Step 3: Try to search
      const searchResult = await findSegmentsByKeyword('typescript');

      // Should fail gracefully
      expect(searchResult.ok).toBe(false);
      if (searchResult.ok) return;

      expect(searchResult.error.code).toBe('SEGMENT_SEARCH_INDEX_NOT_FOUND');
    });
  });
});
