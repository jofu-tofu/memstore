import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { ensureMemStoreDirectories } from '../directory-utils';
import { join } from 'path';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';

const TEST_MEMSTORE_DIR = join(homedir(), '.memstore-test-directory-utils');

describe('ensureMemStoreDirectories', () => {
  beforeAll(() => {
    // Clean any existing test directory
    if (existsSync(TEST_MEMSTORE_DIR)) {
      rmSync(TEST_MEMSTORE_DIR, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    // Clean up after tests
    if (existsSync(TEST_MEMSTORE_DIR)) {
      rmSync(TEST_MEMSTORE_DIR, { recursive: true, force: true });
    }
  });

  test('should create all required directories when missing', () => {
    const result = ensureMemStoreDirectories(TEST_MEMSTORE_DIR);

    expect(result.ok).toBe(true);

    // Verify all directories exist
    const memStore = join(TEST_MEMSTORE_DIR, 'mem-store');
    expect(existsSync(memStore)).toBe(true);
    expect(existsSync(join(memStore, 'segments'))).toBe(true);
    expect(existsSync(join(memStore, 'structured'))).toBe(true);
    expect(existsSync(join(memStore, 'indexes', 'keyword'))).toBe(true);
    expect(existsSync(join(memStore, 'queue'))).toBe(true);
    expect(existsSync(join(memStore, 'metrics'))).toBe(true);
    expect(existsSync(join(memStore, 'cache'))).toBe(true);
  });

  test('should succeed when directories already exist', () => {
    // Create directories first
    const memStore = join(TEST_MEMSTORE_DIR, 'mem-store');
    mkdirSync(join(memStore, 'segments'), { recursive: true });

    const result = ensureMemStoreDirectories(TEST_MEMSTORE_DIR);

    expect(result.ok).toBe(true);
  });

  test('should return error when directory creation fails', () => {
    // Create a file where directory should be (causes mkdir to fail)
    const badPath = join(TEST_MEMSTORE_DIR, 'mem-store-blocked');
    mkdirSync(TEST_MEMSTORE_DIR, { recursive: true });
    writeFileSync(badPath, 'this is a file, not a directory');

    const result = ensureMemStoreDirectories(badPath);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('STORAGE_INIT_FAILED');
      expect(result.error.message).toContain('Failed to create memory directories');
    }
  });

  test('should use MEMSTORE_DIR env variable when set', () => {
    process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;

    const result = ensureMemStoreDirectories();

    expect(result.ok).toBe(true);
    expect(existsSync(join(TEST_MEMSTORE_DIR, 'mem-store'))).toBe(true);

    delete process.env.MEMSTORE_DIR;
  });

  test('should use homedir fallback when MEMSTORE_DIR not set', () => {
    delete process.env.MEMSTORE_DIR;

    const result = ensureMemStoreDirectories();

    expect(result.ok).toBe(true);
    // Should use ~/.memstore by default
  });
});
