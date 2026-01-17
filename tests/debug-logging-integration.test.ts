/**
 * Integration Tests for Debug Logging (Story 4.6.2)
 *
 * Validates debug logging functionality in isolation.
 * Full end-to-end pipeline tests are in retrieval-integration.test.ts
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { KeywordSearch } from '../providers/search/keyword-search';
import { debugLog, isDebugEnabled, clearDebugCache, initDebugCache } from '../lib/debug-utils';
import { clearConfigCache } from '../core/config';
import { formatAge, formatTags } from '../lib/formatters';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Debug Logging Integration', () => {
  let testDir: string;
  let originalPaiDir: string | undefined;

  beforeEach(async () => {
    // Create temp directory for test
    testDir = await mkdtemp(join(tmpdir(), 'debug-integration-test-'));
    originalPaiDir = process.env.PAI_DIR;
    process.env.PAI_DIR = testDir;

    // Clear caches
    clearDebugCache();
    clearConfigCache();

    // Create directory structure
    const memStoreDir = join(testDir, 'mem-store', 'indexes', 'keyword');
    await mkdir(memStoreDir, { recursive: true });

    // Create test index with some data
    await writeFile(
      join(memStoreDir, 'index.json'),
      JSON.stringify({
        typescript: ['seg_001', 'seg_002'],
        hooks: ['seg_001', 'seg_003'],
        error: ['seg_001', 'seg_004']
      })
    );
  });

  afterEach(async () => {
    // Restore environment
    if (originalPaiDir !== undefined) {
      process.env.PAI_DIR = originalPaiDir;
    } else {
      delete process.env.PAI_DIR;
    }

    // Clean up
    await rm(testDir, { recursive: true, force: true });

    clearDebugCache();
    clearConfigCache();
  });

  async function createConfig(debug: boolean): Promise<void> {
    clearDebugCache();
    clearConfigCache();

    const configDir = join(testDir, '.claude');
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, 'settings.json'),
      JSON.stringify({ memory: { debug } })
    );
  }

  test('should log search pipeline when debug enabled', async () => {
    await createConfig(true);
    await initDebugCache(); // Initialize debug cache with new config

    // Capture console.error output
    const logs: string[] = [];
    const originalError = console.error;
    console.error = (...args: any[]) => {
      logs.push(args[0]);
      originalError(...args);
    };

    // Execute keyword search
    const searcher = new KeywordSearch({ paiDir: testDir });
    await searcher.search('typescript hooks', { debug: true });

    console.error = originalError;

    // Verify debug logs were created
    const debugLogs = logs.filter(log =>
      typeof log === 'string' && log.includes(':Debug]')
    );

    // Should have logs from KeywordSearch
    expect(debugLogs.length).toBeGreaterThan(0);

    // Should log terms extraction
    const termsLogs = debugLogs.filter(log => log.includes('Terms extracted:'));
    expect(termsLogs.length).toBeGreaterThan(0);

    // Should log index hits
    const indexLogs = debugLogs.filter(log => log.includes('Index lookup:'));
    expect(indexLogs.length).toBeGreaterThan(0);
  });

  test('should not log when debug disabled', async () => {
    await createConfig(false);
    await initDebugCache(); // Initialize debug cache with new config

    // Capture console.error output
    const logs: string[] = [];
    const originalError = console.error;
    console.error = (...args: any[]) => {
      logs.push(args[0]);
      originalError(...args);
    };

    // Execute keyword search
    const searcher = new KeywordSearch({ paiDir: testDir });
    await searcher.search('typescript hooks', { debug: false });

    console.error = originalError;

    // Verify NO debug logs were created
    const debugLogs = logs.filter(log =>
      typeof log === 'string' && log.includes(':Debug]')
    );

    expect(debugLogs.length).toBe(0);
  });

  test('should format age values correctly', () => {
    const oneDay = 24 * 60 * 60 * 1000;

    expect(formatAge(0)).toBe('today');
    expect(formatAge(oneDay * 3)).toBe('3d');
    expect(formatAge(oneDay * 30)).toBe('1mo');
  });

  test('should format tags correctly', () => {
    expect(formatTags(['typescript', 'hooks', 'error'])).toBe('typescript,hooks,error');
    expect(formatTags([])).toBe('');
  });
});
