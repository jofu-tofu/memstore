/**
 * Debug Mode Integration Tests
 *
 * Story 4.6.1 Integration Tests
 *
 * Validates that debug configuration infrastructure works correctly:
 * - Debug flag loads from config
 * - getDebugMode() helper works correctly
 * - Debug flag can be passed to retrieval options
 *
 * NOTE: Full pipeline integration (search providers, actual retrieval) is
 * tested in other stories. This test focuses on CONFIG LAYER only (Story 4.6.1).
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { join } from 'path';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { getDebugMode, clearConfigCache, getMemoryConfig } from '../src/core/config';

const TEST_MEMSTORE_DIR = join(homedir(), '.memstore-test-debug-integration');
const TEST_SETTINGS_PATH = join(TEST_MEMSTORE_DIR, '.claude', 'settings.json');

describe('Debug Mode Configuration Integration (Story 4.6.1)', () => {
  beforeAll(() => {
    // Create test directory structure
    mkdirSync(join(TEST_MEMSTORE_DIR, '.claude'), { recursive: true });
  });

  beforeEach(() => {
    // Clear cache before each test
    clearConfigCache();
  });

  afterAll(() => {
    // Clean up test artifacts
    if (existsSync(TEST_MEMSTORE_DIR)) {
      rmSync(TEST_MEMSTORE_DIR, { recursive: true, force: true });
    }
  });

  describe('AC1 & AC2: Debug configuration schema and accessor', () => {
    test('should load debug: true from config via getDebugMode()', async () => {
      // Arrange: Enable debug mode in config
      const debugConfig = {
        memory: {
          enabled: true,
          debug: true,
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(debugConfig, null, 2));

      const originalMemstoreDir = process.env.MEMSTORE_DIR;
      process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;

      // Act
      const debugMode = await getDebugMode();
      const configResult = await getMemoryConfig();

      process.env.MEMSTORE_DIR = originalMemstoreDir;

      // Assert: Debug mode should be enabled
      expect(debugMode).toBe(true);
      expect(configResult.ok).toBe(true);
      if (configResult.ok) {
        expect(configResult.value.debug).toBe(true);
      }
    });

    test('should load debug: false from config via getDebugMode()', async () => {
      // Arrange: Disable debug mode in config
      const noDebugConfig = {
        memory: {
          enabled: true,
          debug: false,
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(noDebugConfig, null, 2));

      const originalMemstoreDir = process.env.MEMSTORE_DIR;
      process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;

      // Act
      const debugMode = await getDebugMode();

      process.env.MEMSTORE_DIR = originalMemstoreDir;

      // Assert: Debug mode should be disabled
      expect(debugMode).toBe(false);
    });

    test('should default to false when debug field not in config', async () => {
      // Arrange: Config without debug field (pre-4.6.1 config)
      const oldConfig = {
        memory: {
          enabled: true,
          hooks: {
            sessionEnd: true,
            userPromptSubmit: true,
          },
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(oldConfig, null, 2));

      const originalMemstoreDir = process.env.MEMSTORE_DIR;
      process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;

      // Act
      const debugMode = await getDebugMode();
      const configResult = await getMemoryConfig();

      process.env.MEMSTORE_DIR = originalMemstoreDir;

      // Assert: Should default to false
      expect(debugMode).toBe(false);
      expect(configResult.ok).toBe(true);
      if (configResult.ok) {
        expect(configResult.value.debug).toBe(false);
      }
    });

    test('should handle config load failure gracefully', async () => {
      // Arrange: Invalid JSON
      writeFileSync(TEST_SETTINGS_PATH, '{ invalid json }');

      const originalMemstoreDir = process.env.MEMSTORE_DIR;
      process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;

      // Act
      const debugMode = await getDebugMode();

      process.env.MEMSTORE_DIR = originalMemstoreDir;

      // Assert: Should return false (graceful degradation)
      expect(debugMode).toBe(false);
    });
  });

  describe('AC3: Debug flag available for options interfaces', () => {
    test('should load debug mode for passing to RetrievalOptions', async () => {
      // Arrange
      const debugConfig = {
        memory: {
          enabled: true,
          debug: true,
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(debugConfig, null, 2));

      const originalMemstoreDir = process.env.MEMSTORE_DIR;
      process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;

      // Act: Simulate what retrieve.ts does
      const debugMode = await getDebugMode();

      // Simulate passing to retrieveMemories (interface compatibility check)
      const retrievalOptions = {
        debug: debugMode,
        maxResults: 10,
      };

      process.env.MEMSTORE_DIR = originalMemstoreDir;

      // Assert: Flag loaded correctly and can be used in options
      expect(retrievalOptions.debug).toBe(true);
      expect(typeof retrievalOptions.debug).toBe('boolean');
    });

    test('should support debug flag in options even when undefined', async () => {
      // Arrange: No config file
      if (existsSync(TEST_SETTINGS_PATH)) {
        rmSync(TEST_SETTINGS_PATH);
      }

      const originalMemstoreDir = process.env.MEMSTORE_DIR;
      process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;

      // Act
      const debugMode = await getDebugMode();

      const searchOptions = {
        debug: debugMode,
        maxResults: 5,
      };

      process.env.MEMSTORE_DIR = originalMemstoreDir;

      // Assert: Debug flag defaults to false
      expect(searchOptions.debug).toBe(false);
    });
  });

  describe('AC4: No performance impact when disabled', () => {
    test('should load debug flag quickly (no overhead)', async () => {
      // Arrange
      const config = {
        memory: {
          enabled: true,
          debug: false,
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(config, null, 2));

      const originalMemstoreDir = process.env.MEMSTORE_DIR;
      process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;

      // Act: Measure getDebugMode() performance
      const iterations = 100;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await getDebugMode();
      }

      const elapsedMs = Date.now() - startTime;
      const avgMs = elapsedMs / iterations;

      process.env.MEMSTORE_DIR = originalMemstoreDir;

      // Assert: Should be very fast (<5ms per call due to caching)
      expect(avgMs).toBeLessThan(5);
    });

    test('should use cached config for repeated calls', async () => {
      // Arrange
      const config = {
        memory: {
          enabled: true,
          debug: true,
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(config, null, 2));

      const originalMemstoreDir = process.env.MEMSTORE_DIR;
      process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;

      // Act: Call getDebugMode twice
      const start1 = Date.now();
      const result1 = await getDebugMode();
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      const result2 = await getDebugMode();
      const time2 = Date.now() - start2;

      process.env.MEMSTORE_DIR = originalMemstoreDir;

      // Assert: Both return same value
      expect(result1).toBe(true);
      expect(result2).toBe(true);

      // Second call should be faster (cached)
      expect(time2).toBeLessThanOrEqual(time1);
    });
  });

  describe('AC5: Configuration validation', () => {
    test('should accept debug: true', async () => {
      const config = {
        memory: {
          debug: true,
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(config, null, 2));

      const originalMemstoreDir = process.env.MEMSTORE_DIR;
      process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;

      const result = await getMemoryConfig();

      process.env.MEMSTORE_DIR = originalMemstoreDir;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.debug).toBe(true);
      }
    });

    test('should accept debug: false', async () => {
      const config = {
        memory: {
          debug: false,
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(config, null, 2));

      const originalMemstoreDir = process.env.MEMSTORE_DIR;
      process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;

      const result = await getMemoryConfig();

      process.env.MEMSTORE_DIR = originalMemstoreDir;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.debug).toBe(false);
      }
    });

    test('should accept debug: undefined (missing field)', async () => {
      const config = {
        memory: {
          enabled: true,
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(config, null, 2));

      const originalMemstoreDir = process.env.MEMSTORE_DIR;
      process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;

      const result = await getMemoryConfig();

      process.env.MEMSTORE_DIR = originalMemstoreDir;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.debug).toBe(false); // Defaults to false
      }
    });

    test('should reject invalid debug value (string)', async () => {
      const config = {
        memory: {
          debug: 'true', // String instead of boolean
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(config, null, 2));

      const originalMemstoreDir = process.env.MEMSTORE_DIR;
      process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;

      const result = await getMemoryConfig();

      process.env.MEMSTORE_DIR = originalMemstoreDir;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFIG_INVALID');
        expect(result.error.message).toContain('Invalid debug value');
        expect(result.error.message).toContain('expected boolean');
      }
    });

    test('should reject invalid debug value (number)', async () => {
      const config = {
        memory: {
          debug: 1, // Number instead of boolean
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(config, null, 2));

      const originalMemstoreDir = process.env.MEMSTORE_DIR;
      process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;

      const result = await getMemoryConfig();

      process.env.MEMSTORE_DIR = originalMemstoreDir;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFIG_INVALID');
        expect(result.error.message).toContain('Invalid debug value');
      }
    });
  });
});
