/**
 * Tests for Debug Utilities (Story 4.6.2)
 *
 * Validates debug logging functionality and configuration handling.
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { debugLog, isDebugEnabled, clearDebugCache, initDebugCache } from '../debug-utils';
import { clearConfigCache } from '../../core/config';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Debug Utils', () => {
  let testDir: string;
  let originalMemstoreDir: string | undefined;

  beforeEach(async () => {
    // Create temp directory for test configuration
    testDir = await mkdtemp(join(tmpdir(), 'debug-utils-test-'));
    originalMemstoreDir = process.env.MEMSTORE_DIR;
    process.env.MEMSTORE_DIR = testDir;

    // Clear caches to ensure fresh state
    clearDebugCache();
    clearConfigCache();
  });

  afterEach(async () => {
    // Restore environment
    if (originalMemstoreDir !== undefined) {
      process.env.MEMSTORE_DIR = originalMemstoreDir;
    } else {
      delete process.env.MEMSTORE_DIR;
    }

    // Clean up temp directory
    await rm(testDir, { recursive: true, force: true });

    // Clear caches after test
    clearDebugCache();
    clearConfigCache();
  });

  async function createTestConfig(debug: boolean, clearCaches = true): Promise<void> {
    if (clearCaches) {
      // Clear caches FIRST before writing new config
      clearDebugCache();
      clearConfigCache();
    }

    const configDir = join(testDir, '.claude');
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, 'settings.json'),
      JSON.stringify({ memory: { debug } })
    );
  }

  describe('isDebugEnabled', () => {
    test('should return false when debug mode is disabled', async () => {
      await createTestConfig(false);
      await initDebugCache(); // Initialize cache
      const enabled = isDebugEnabled();
      expect(enabled).toBe(false);
    });

    test('should return true when debug mode is enabled', async () => {
      await createTestConfig(true);
      await initDebugCache(); // Initialize cache
      const enabled = isDebugEnabled();
      expect(enabled).toBe(true);
    });

    test('should default to false when config missing', async () => {
      // No config file exists - cache not initialized
      const enabled = isDebugEnabled();
      expect(enabled).toBe(false);
    });

    test('should cache result for subsequent calls', async () => {
      await createTestConfig(true);
      await initDebugCache(); // Initialize cache

      // First call
      const enabled1 = isDebugEnabled();
      expect(enabled1).toBe(true);

      // Second call should use cache
      const enabled2 = isDebugEnabled();
      expect(enabled2).toBe(true);
    });
  });

  describe('debugLog', () => {
    test('should log when debug enabled', async () => {
      await createTestConfig(true);
      await initDebugCache(); // Initialize cache

      const spy = spyOn(console, 'error');

      debugLog('TestComponent', 'Test message');

      expect(spy).toHaveBeenCalledWith('[Memory:TestComponent:Debug] Test message');
    });

    test('should not log when debug disabled', async () => {
      // Create config and initialize cache
      await createTestConfig(false);
      await initDebugCache(); // Initialize cache

      // Set up spy
      let debugLogCalled = false;
      const originalConsoleError = console.error;
      console.error = (...args: any[]) => {
        const msg = args[0];
        if (typeof msg === 'string' && msg.includes('[Memory:TestComponent:Debug]')) {
          debugLogCalled = true;
        }
        // Still call original to allow config logs
        originalConsoleError(...args);
      };

      // Call debugLog - it should NOT log
      debugLog('TestComponent', 'Test message');

      // Restore console.error
      console.error = originalConsoleError;

      // Check that debug log was not called
      expect(debugLogCalled).toBe(false);
    });

    test('should format component name correctly', async () => {
      await createTestConfig(true);
      await initDebugCache(); // Initialize cache

      const spy = spyOn(console, 'error');

      debugLog('Retrieve', 'Query: "test"');

      expect(spy).toHaveBeenCalledWith('[Memory:Retrieve:Debug] Query: "test"');
    });

    test('should never throw on logging error', async () => {
      await createTestConfig(true);
      await initDebugCache(); // Initialize cache

      // Mock console.error to throw
      const originalError = console.error;
      let errorThrown = false;
      console.error = () => {
        errorThrown = true;
        throw new Error('Logging failed');
      };

      // Should not throw (it will catch internally)
      try {
        debugLog('Test', 'message');
      } catch (e) {
        // If it throws, the test should fail
        expect(false).toBe(true);
      }

      console.error = originalError;

      // We should have attempted to log (error was thrown internally but caught)
      expect(errorThrown).toBe(true);
    });
  });

  describe('clearDebugCache', () => {
    test('should force config reload on next call', async () => {
      // Create initial config with caches cleared
      await createTestConfig(true, true);
      await initDebugCache(); // Initialize cache

      // First call
      const enabled1 = isDebugEnabled();
      expect(enabled1).toBe(true);

      // Update config WITHOUT clearing caches first
      const configDir = join(testDir, '.claude');
      await writeFile(
        join(configDir, 'settings.json'),
        JSON.stringify({ memory: { debug: false } })
      );

      // Clear caches to pick up new config
      clearDebugCache();
      clearConfigCache();
      await initDebugCache(); // Reinitialize with new config

      // Second call should reflect new config
      const enabled2 = isDebugEnabled();
      expect(enabled2).toBe(false);
    });
  });
});
