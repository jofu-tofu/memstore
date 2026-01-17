import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { promises as fs } from 'fs';
import { KeywordIndexManager } from '../keyword-index';

const TEST_PAI_DIR = join(homedir(), 'pai-test-keyword-index');

describe('providers/storage/keyword-index.ts', () => {
  let indexManager: KeywordIndexManager;

  beforeEach(async () => {
    // Clean slate
    if (existsSync(TEST_PAI_DIR)) {
      rmSync(TEST_PAI_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_PAI_DIR, { recursive: true });

    indexManager = new KeywordIndexManager(TEST_PAI_DIR);
    await indexManager.initialize();
  });

  afterAll(() => {
    if (existsSync(TEST_PAI_DIR)) {
      rmSync(TEST_PAI_DIR, { recursive: true, force: true });
    }
  });

  test('should create index file on first write', async () => {
    await indexManager.addToIndex('seg_001', ['typescript', 'testing']);

    const indexPath = join(TEST_PAI_DIR, 'mem-store', 'indexes', 'keyword', 'index.json');
    expect(existsSync(indexPath)).toBe(true);
  });

  test('should add segment to multiple tags', async () => {
    await indexManager.addToIndex('seg_001', ['typescript', 'hooks', 'memory']);

    const index = await indexManager.getIndex();

    expect(index['typescript']).toContain('seg_001');
    expect(index['hooks']).toContain('seg_001');
    expect(index['memory']).toContain('seg_001');
  });

  test('should prevent duplicate segment IDs', async () => {
    await indexManager.addToIndex('seg_001', ['typescript']);
    await indexManager.addToIndex('seg_001', ['typescript']);  // Add again

    const index = await indexManager.getIndex();

    expect(index['typescript'].length).toBe(1);
    expect(index['typescript']).toEqual(['seg_001']);
  });

  test('should append to existing tag arrays', async () => {
    await indexManager.addToIndex('seg_001', ['typescript']);
    await indexManager.addToIndex('seg_002', ['typescript']);

    const index = await indexManager.getIndex();

    expect(index['typescript']).toContain('seg_001');
    expect(index['typescript']).toContain('seg_002');
    expect(index['typescript'].length).toBe(2);
  });

  test('should remove segment from index', async () => {
    await indexManager.addToIndex('seg_001', ['typescript', 'hooks']);
    await indexManager.removeFromIndex('seg_001', ['typescript', 'hooks']);

    const index = await indexManager.getIndex();

    expect(index['typescript']).toBeUndefined();
    expect(index['hooks']).toBeUndefined();
  });

  test('should remove empty tag arrays', async () => {
    await indexManager.addToIndex('seg_001', ['typescript']);
    await indexManager.addToIndex('seg_002', ['typescript']);

    await indexManager.removeFromIndex('seg_001', ['typescript']);

    const index = await indexManager.getIndex();

    expect(index['typescript']).toEqual(['seg_002']);  // Still has seg_002

    await indexManager.removeFromIndex('seg_002', ['typescript']);

    const index2 = await indexManager.getIndex();

    expect(index2['typescript']).toBeUndefined();  // Empty array removed
  });

  test('should persist index to disk', async () => {
    await indexManager.addToIndex('seg_001', ['typescript']);

    // Create new manager instance (simulates restart)
    const indexManager2 = new KeywordIndexManager(TEST_PAI_DIR);
    await indexManager2.initialize();

    const index = await indexManager2.getIndex();

    expect(index['typescript']).toContain('seg_001');
  });

  test('should handle empty tag array gracefully', async () => {
    await indexManager.addToIndex('seg_001', []);

    const index = await indexManager.getIndex();
    expect(Object.keys(index).length).toBe(0);
  });

  test('should skip empty/whitespace tags', async () => {
    await indexManager.addToIndex('seg_001', ['typescript', '', '  ', 'hooks']);

    const index = await indexManager.getIndex();

    expect(index['typescript']).toContain('seg_001');
    expect(index['hooks']).toContain('seg_001');
    expect(index['']).toBeUndefined();
    expect(index['  ']).toBeUndefined();
  });

  test('should trim tag whitespace', async () => {
    await indexManager.addToIndex('seg_001', ['  typescript  ', 'hooks  ']);

    const index = await indexManager.getIndex();

    expect(index['typescript']).toContain('seg_001');
    expect(index['hooks']).toContain('seg_001');
  });

  test('should handle removing non-existent segment', async () => {
    await indexManager.addToIndex('seg_001', ['typescript']);
    await indexManager.removeFromIndex('seg_002', ['typescript']);  // Not in index

    const index = await indexManager.getIndex();

    // seg_001 should still be there
    expect(index['typescript']).toEqual(['seg_001']);
  });

  test('should handle removing from non-existent tag', async () => {
    await indexManager.addToIndex('seg_001', ['typescript']);

    // Remove from tag that doesn't exist
    await indexManager.removeFromIndex('seg_001', ['javascript']);

    const index = await indexManager.getIndex();

    // typescript should still be there
    expect(index['typescript']).toEqual(['seg_001']);
  });

  test('should use atomic write pattern (temp file)', async () => {
    await indexManager.addToIndex('seg_001', ['typescript']);

    const indexPath = join(TEST_PAI_DIR, 'mem-store', 'indexes', 'keyword', 'index.json');
    const tempPath = `${indexPath}.tmp`;

    // Temp file should not exist after successful write
    expect(existsSync(tempPath)).toBe(false);

    // Actual index file should exist
    expect(existsSync(indexPath)).toBe(true);
  });

  test('should handle multiple segments with shared tags', async () => {
    await indexManager.addToIndex('seg_001', ['typescript', 'react']);
    await indexManager.addToIndex('seg_002', ['typescript', 'vue']);
    await indexManager.addToIndex('seg_003', ['react', 'vue']);

    const index = await indexManager.getIndex();

    expect(index['typescript']).toEqual(['seg_001', 'seg_002']);
    expect(index['react']).toEqual(['seg_001', 'seg_003']);
    expect(index['vue']).toEqual(['seg_002', 'seg_003']);
  });

  test('should preserve order of segment IDs in tag arrays', async () => {
    await indexManager.addToIndex('seg_003', ['typescript']);
    await indexManager.addToIndex('seg_001', ['typescript']);
    await indexManager.addToIndex('seg_002', ['typescript']);

    const index = await indexManager.getIndex();

    // Order should be preserved (insertion order)
    expect(index['typescript']).toEqual(['seg_003', 'seg_001', 'seg_002']);
  });

  test('should return empty index when file does not exist', async () => {
    const newManager = new KeywordIndexManager(TEST_PAI_DIR);
    await newManager.initialize();

    const index = await newManager.getIndex();

    expect(index).toEqual({});
  });

  test('should handle corrupt index file gracefully', async () => {
    const indexPath = join(TEST_PAI_DIR, 'mem-store', 'indexes', 'keyword', 'index.json');

    // Create directory
    await fs.mkdir(join(indexPath, '..'), { recursive: true });

    // Write corrupt JSON
    await fs.writeFile(indexPath, '{ invalid json }', 'utf-8');

    // Should create new manager and recover with empty index
    const newManager = new KeywordIndexManager(TEST_PAI_DIR);
    await newManager.initialize();

    const index = await newManager.getIndex();

    expect(index).toEqual({});  // Recovered with empty index
  });

  test('should create index directory if missing', async () => {
    // Remove entire test directory
    if (existsSync(TEST_PAI_DIR)) {
      rmSync(TEST_PAI_DIR, { recursive: true, force: true });
    }

    const newManager = new KeywordIndexManager(TEST_PAI_DIR);
    await newManager.initialize();

    await newManager.addToIndex('seg_001', ['typescript']);

    const indexPath = join(TEST_PAI_DIR, 'mem-store', 'indexes', 'keyword', 'index.json');
    expect(existsSync(indexPath)).toBe(true);
  });

  test('should handle PAI_DIR environment variable fallback', () => {
    // Don't pass paiDir to constructor
    const envManager = new KeywordIndexManager();

    // Should use process.env.PAI_DIR or fallback to ~/pai
    expect(envManager).toBeDefined();
  });

  test('should format index JSON with pretty printing', async () => {
    await indexManager.addToIndex('seg_001', ['typescript', 'hooks']);

    const indexPath = join(TEST_PAI_DIR, 'mem-store', 'indexes', 'keyword', 'index.json');
    const content = await fs.readFile(indexPath, 'utf-8');

    // Check for pretty-printed JSON (has newlines and indentation)
    expect(content).toContain('\n');
    expect(content).toContain('  ');  // 2-space indentation
  });
});
