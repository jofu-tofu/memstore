/**
 * Tests for Memory System Configuration
 *
 * Validates configuration schema, loading, merging, and caching behavior.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { join } from 'path';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import {
  clearConfigCache,
  getDebugMode,
  getMemoryConfig,
  type MemoryConfig,
  type ExperimentConfig,
} from './config';

const TEST_PAI_DIR = join(homedir(), 'pai-test-config');
const TEST_SETTINGS_PATH = join(TEST_PAI_DIR, '.claude', 'settings.json');

describe('config', () => {
  beforeAll(() => {
    // Create test PAI directory structure
    mkdirSync(join(TEST_PAI_DIR, '.claude'), { recursive: true });
  });

  beforeEach(() => {
    // Clear cache before each test for isolation
    clearConfigCache();
  });

  afterAll(() => {
    // Clean up test artifacts (force: true handles non-existence)
    rmSync(TEST_PAI_DIR, { recursive: true, force: true });
  });

  describe('MemoryConfig interface', () => {
    test('should export MemoryConfig interface', async () => {
      // This test will fail until we create config.ts with the interface
      const config = await import('./config');

      // Verify the module exports what we expect
      expect(config.getMemoryConfig).toBeDefined();
      expect(typeof config.getMemoryConfig).toBe('function');
    });
  });

  describe('getMemoryConfig', () => {
    test('should return default config when settings.json missing', async () => {
      // Arrange: Ensure no settings.json exists
      if (existsSync(TEST_SETTINGS_PATH)) {
        rmSync(TEST_SETTINGS_PATH);
      }

      // Act: Import with test PAI_DIR
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      // Force reload module
      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: Should return defaults
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.enabled).toBe(true);
        expect(result.value.hooks.sessionEnd).toBe(true);
        expect(result.value.hooks.userPromptSubmit).toBe(true);
        expect(result.value.hooks.sessionStart).toBe(false);
        expect(result.value.providers.segment).toBe('per-message');
        expect(result.value.providers.storage).toBe('file-backend');
        expect(result.value.retention.shortTermMaxSessions).toBe(50);
        expect(result.value.retention.shortTermMaxAgeDays).toBe(30);
        expect(result.value.performance.maxRetrievalMs).toBe(1000);
      }
    });

    test('should load valid configuration from settings.json', async () => {
      // Arrange: Create test settings.json with memory config
      const testConfig = {
        memory: {
          enabled: false,
          hooks: {
            sessionEnd: false,
            userPromptSubmit: true,
            sessionStart: true,
          },
          providers: {
            segment: 'custom-segmenter',
            extract: ['custom-extractor'],
            summarize: 'custom-summarizer',
            storage: 'custom-storage',
            search: 'custom-search',
            organize: 'custom-organizer',
          },
          retention: {
            shortTermMaxSessions: 100,
            shortTermMaxAgeDays: 60,
            autoConsolidate: true,
          },
          performance: {
            maxRetrievalMs: 500,
            maxInjectionTokens: 3000,
            maxResultCount: 20,
          },
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(testConfig, null, 2));

      // Act: Load config with test PAI_DIR
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: Should load custom config
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.enabled).toBe(false);
        expect(result.value.hooks.sessionStart).toBe(true);
        expect(result.value.providers.segment).toBe('custom-segmenter');
        expect(result.value.retention.shortTermMaxSessions).toBe(100);
        expect(result.value.performance.maxRetrievalMs).toBe(500);
      }
    });

    test('should merge defaults when fields are missing', async () => {
      // Arrange: Partial config with only enabled field
      const partialConfig = {
        memory: {
          enabled: false,
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(partialConfig, null, 2));

      // Act: Load config
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: enabled should be false (from config), others should be defaults
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.enabled).toBe(false); // From config
        expect(result.value.hooks.sessionEnd).toBe(true); // Default
        expect(result.value.providers.storage).toBe('file-backend'); // Default
        expect(result.value.retention.shortTermMaxSessions).toBe(50); // Default
      }
    });

    test('should return error when settings.json is corrupted', async () => {
      // Arrange: Write invalid JSON
      writeFileSync(TEST_SETTINGS_PATH, '{ invalid json content }');

      // Act: Load config
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: Should return error with CONFIG_PARSE_FAILED
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFIG_PARSE_FAILED');
        expect(result.error.message).toContain('Failed to parse');
      }
    });

    test('should return cached config on subsequent calls', async () => {
      // Arrange: Create valid config
      const testConfig = {
        memory: {
          enabled: true,
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(testConfig, null, 2));

      // Act: Load config twice
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getMemoryConfig } = await import('./config');

      const result1 = await getMemoryConfig();
      const result2 = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: Same instance returned (object reference equality)
      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);

      if (result1.ok && result2.ok) {
        expect(result1.value).toBe(result2.value); // Same reference
      }
    });

    test('should use PAI_DIR environment variable if set', async () => {
      // Arrange: Set custom PAI_DIR and create config there
      const customPaiDir = join(homedir(), 'pai-test-custom');
      const customSettingsPath = join(customPaiDir, '.claude', 'settings.json');

      mkdirSync(join(customPaiDir, '.claude'), { recursive: true });

      const customConfig = {
        memory: {
          enabled: false,
          providers: {
            segment: 'custom-from-env',
          },
        },
      };

      writeFileSync(customSettingsPath, JSON.stringify(customConfig, null, 2));

      // Act: Load config with custom PAI_DIR
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = customPaiDir;

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Cleanup
      rmSync(customPaiDir, { recursive: true, force: true });

      // Assert: Should read from custom location
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.providers.segment).toBe('custom-from-env');
      }
    });
  });

  describe('DEFAULT_CONFIG values', () => {
    test('should have sessionStart disabled by default', async () => {
      // Arrange: No settings.json
      if (existsSync(TEST_SETTINGS_PATH)) {
        rmSync(TEST_SETTINGS_PATH);
      }

      // Act: Load defaults
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: sessionStart should be false
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.hooks.sessionStart).toBe(false);
      }
    });

    test('should enable all other hooks by default', async () => {
      // Arrange: No settings.json
      if (existsSync(TEST_SETTINGS_PATH)) {
        rmSync(TEST_SETTINGS_PATH);
      }

      // Act: Load defaults
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: Other hooks should be true
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.hooks.sessionEnd).toBe(true);
        expect(result.value.hooks.userPromptSubmit).toBe(true);
      }
    });
  });

  describe('Edge cases and validation', () => {
    test('should handle partial nested config correctly', async () => {
      // Arrange: Only set hooks.sessionEnd, not full hooks object
      const partialConfig = {
        memory: {
          hooks: {
            sessionEnd: false,
          },
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(partialConfig, null, 2));

      // Act
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: sessionEnd should be false, others should use defaults
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.hooks.sessionEnd).toBe(false);
        expect(result.value.hooks.userPromptSubmit).toBe(true); // Default
        expect(result.value.hooks.sessionStart).toBe(false); // Default
      }
    });

    test('should reject negative retention values', async () => {
      // Arrange: Invalid negative values
      const invalidConfig = {
        memory: {
          retention: {
            shortTermMaxSessions: -10,
          },
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(invalidConfig, null, 2));

      // Act
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: Should return validation error
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFIG_INVALID');
        expect(result.error.message).toContain('Retention values');
      }
    });

    test('should reject negative performance values', async () => {
      // Arrange: Invalid negative performance value
      const invalidConfig = {
        memory: {
          performance: {
            maxRetrievalMs: -500,
          },
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(invalidConfig, null, 2));

      // Act
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: Should return validation error
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFIG_INVALID');
        expect(result.error.message).toContain('Performance values');
      }
    });

    test('should reject non-array extract provider', async () => {
      // Arrange: extract is string instead of array
      const invalidConfig = {
        memory: {
          providers: {
            extract: 'single-extractor', // Should be array
          },
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(invalidConfig, null, 2));

      // Act
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: Should return validation error
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFIG_INVALID');
        expect(result.error.message).toContain('providers.extract must be an array');
      }
    });

    test('should handle empty settings.json file', async () => {
      // Arrange: Empty object
      writeFileSync(TEST_SETTINGS_PATH, '{}');

      // Act
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: Should use all defaults
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.enabled).toBe(true);
        expect(result.value.providers.storage).toBe('file-backend');
      }
    });

    test('should handle null memory field', async () => {
      // Arrange: memory is explicitly null
      const nullConfig = {
        memory: null,
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(nullConfig, null, 2));

      // Act
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: Should use all defaults (null || {} = {})
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.enabled).toBe(true);
      }
    });

    test('should handle empty extract array', async () => {
      // Arrange: Empty extract array
      const emptyArrayConfig = {
        memory: {
          providers: {
            extract: [],
          },
        },
      };

      writeFileSync(
        TEST_SETTINGS_PATH,
        JSON.stringify(emptyArrayConfig, null, 2)
      );

      // Act
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: Should accept empty array (valid, just no extractors)
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.providers.extract).toEqual([]);
      }
    });
  });

  describe('Debug mode configuration', () => {
    test('should default debug to false when not specified', async () => {
      // Arrange: No settings.json
      if (existsSync(TEST_SETTINGS_PATH)) {
        rmSync(TEST_SETTINGS_PATH);
      }

      // Act: Load defaults
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: debug should be false by default
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.debug).toBe(false);
      }
    });

    test('should reject invalid debug value types', async () => {
      // Arrange: Config with debug as string instead of boolean
      const invalidConfig = {
        memory: {
          debug: 'true', // Should be boolean, not string
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(invalidConfig, null, 2));

      // Act: Load config
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: Should return validation error
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFIG_INVALID');
        expect(result.error.message).toContain('Invalid debug value');
        expect(result.error.message).toContain('expected boolean');
      }
    });

    test('should reject debug value when type is number', async () => {
      // Arrange: Config with debug as number
      const invalidConfig = {
        memory: {
          debug: 1, // Should be boolean, not number
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(invalidConfig, null, 2));

      // Act: Load config
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: Should return validation error
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFIG_INVALID');
        expect(result.error.message).toContain('Invalid debug value');
        expect(result.error.message).toContain('expected boolean');
      }
    });

    test('should enable debug mode when debug: true in config', async () => {
      // Arrange: Config with debug enabled
      const debugConfig = {
        memory: {
          debug: true,
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(debugConfig, null, 2));

      // Act: Load config
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: debug should be true
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.debug).toBe(true);
      }
    });

    test('should disable debug mode when debug: false in config', async () => {
      // Arrange: Config with debug explicitly disabled
      const debugConfig = {
        memory: {
          debug: false,
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(debugConfig, null, 2));

      // Act: Load config
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: debug should be false
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.debug).toBe(false);
      }
    });

    test('should merge debug field correctly with partial config', async () => {
      // Arrange: Partial config without debug field
      const partialConfig = {
        memory: {
          enabled: true,
          hooks: {
            sessionEnd: false,
          },
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(partialConfig, null, 2));

      // Act: Load config
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: debug should default to false when not in config
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.debug).toBe(false);
        expect(result.value.enabled).toBe(true);
        expect(result.value.hooks.sessionEnd).toBe(false);
      }
    });

    test('should load pre-4.6.1 config without debug field', async () => {
      // Arrange: Simulate actual pre-4.6.1 config (no debug field existed)
      const pre461Config = {
        memory: {
          enabled: true,
          hooks: {
            sessionEnd: true,
            userPromptSubmit: true,
            sessionStart: false,
          },
          providers: {
            segment: 'per-message',
            extract: ['frontmatter-gen', 'keyword-tagger'],
            summarize: 'simple-extract',
            storage: 'file-backend',
            search: 'keyword-search',
            organize: 'flat-by-date',
          },
          retention: {
            shortTermMaxSessions: 50,
            shortTermMaxAgeDays: 30,
            autoConsolidate: true,
          },
          performance: {
            maxRetrievalMs: 1000,
            maxInjectionTokens: 2000,
            maxResultCount: 10,
          },
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(pre461Config, null, 2));

      // Act: Load old config
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getMemoryConfig, getDebugMode } = await import('./config');
      const configResult = await getMemoryConfig();
      const debugMode = await getDebugMode();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: Should load successfully with debug defaulting to false
      expect(configResult.ok).toBe(true);
      if (configResult.ok) {
        expect(configResult.value.debug).toBe(false); // Defaults to false
        expect(configResult.value.enabled).toBe(true);
        expect(configResult.value.providers.storage).toBe('file-backend');
        expect(configResult.value.retention.shortTermMaxSessions).toBe(50);
      }
      expect(debugMode).toBe(false); // getDebugMode also works
    });
  });

  describe('getDebugMode helper', () => {
    test('should return false when debug not configured', async () => {
      // Arrange: No settings.json
      if (existsSync(TEST_SETTINGS_PATH)) {
        rmSync(TEST_SETTINGS_PATH);
      }

      // Act
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getDebugMode } = await import('./config');
      const debugMode = await getDebugMode();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: Should return false
      expect(debugMode).toBe(false);
    });

    test('should return true when debug enabled in config', async () => {
      // Arrange: Config with debug enabled
      const debugConfig = {
        memory: {
          debug: true,
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(debugConfig, null, 2));

      // Act
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getDebugMode } = await import('./config');
      const debugMode = await getDebugMode();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: Should return true
      expect(debugMode).toBe(true);
    });

    test('should return false when config loading fails', async () => {
      // Arrange: Corrupted settings.json
      writeFileSync(TEST_SETTINGS_PATH, '{ invalid json }');

      // Act
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getDebugMode } = await import('./config');
      const debugMode = await getDebugMode();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: Should return false (graceful degradation)
      expect(debugMode).toBe(false);
    });

    test('should return false when debug explicitly disabled', async () => {
      // Arrange: Config with debug: false
      const debugConfig = {
        memory: {
          debug: false,
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(debugConfig, null, 2));

      // Act
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getDebugMode } = await import('./config');
      const debugMode = await getDebugMode();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: Should return false
      expect(debugMode).toBe(false);
    });
  });

  describe('Cache management', () => {
    test('should reload config when forceReload is true', async () => {
      // Arrange: Create initial config
      const config1 = { memory: { enabled: true } };
      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(config1, null, 2));

      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getMemoryConfig } = await import('./config');

      // Load first time
      const result1 = await getMemoryConfig();
      expect(result1.ok).toBe(true);
      if (result1.ok) {
        expect(result1.value.enabled).toBe(true);
      }

      // Change config on disk
      const config2 = { memory: { enabled: false } };
      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(config2, null, 2));

      // Load without forceReload - should get cached
      const result2 = await getMemoryConfig();
      expect(result2.ok).toBe(true);
      if (result2.ok) {
        expect(result2.value.enabled).toBe(true); // Still cached
      }

      // Load with forceReload - should get new value
      const result3 = await getMemoryConfig(true);
      expect(result3.ok).toBe(true);
      if (result3.ok) {
        expect(result3.value.enabled).toBe(false); // Reloaded
      }

      process.env.PAI_DIR = originalPaiDir;
    });

    test('should return cached debug mode on repeated calls', async () => {
      // Arrange: Create config with debug enabled
      const debugConfig = { memory: { debug: true } };
      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(debugConfig, null, 2));

      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;

      const { getDebugMode, clearConfigCache } = await import('./config');

      // Act: Call getDebugMode twice
      const result1 = await getDebugMode();
      const result2 = await getDebugMode();

      // Change config file to debug: false
      const newConfig = { memory: { debug: false } };
      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(newConfig, null, 2));

      // Call getDebugMode again WITHOUT cache clear
      const result3 = await getDebugMode();

      // Clear cache and call again
      clearConfigCache();
      const result4 = await getDebugMode();

      process.env.PAI_DIR = originalPaiDir;

      // Assert: First 3 calls return true (cached), 4th returns false (reloaded)
      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result3).toBe(true); // Still cached
      expect(result4).toBe(false); // Reloaded after cache clear
    });
  });

  describe('Experiment configuration schema (Story 5.4 Task 1)', () => {
    test('should load experiment configuration with simple 50/50 split', async () => {
      // Arrange
      const testSettings = {
        memory: {
          experiments: {
            'search-comparison': {
              enabled: true,
              variants: {
                control: 'keyword-search',
                treatment: 'semantic-search',
              },
              splitPercent: 50,
            },
          },
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(testSettings, null, 2));

      // Act
      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;
      clearConfigCache();

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const config = result.value;
      expect(config.experiments).toBeDefined();
      expect(config.experiments!['search-comparison']).toBeDefined();

      const exp = config.experiments!['search-comparison'];
      expect(exp.enabled).toBe(true);
      expect(exp.variants.control).toBe('keyword-search');
      expect(exp.variants.treatment).toBe('semantic-search');
      expect(exp.splitPercent).toBe(50);
    });

    test('should load experiment configuration with multi-variant splits', async () => {
      // Arrange
      const testSettings = {
        memory: {
          experiments: {
            'ranking-comparison': {
              enabled: true,
              variants: {
                control: 'default-ranking',
                'treatment-a': 'importance-boost',
                'treatment-b': 'recency-boost',
                'treatment-c': 'access-count-boost',
              },
              splitPercent: {
                control: 40,
                'treatment-a': 20,
                'treatment-b': 20,
                'treatment-c': 20,
              },
            },
          },
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(testSettings, null, 2));

      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;
      clearConfigCache();

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const exp = result.value.experiments!['ranking-comparison'];
      expect(exp.enabled).toBe(true);
      expect(Object.keys(exp.variants).length).toBe(4);
      expect(typeof exp.splitPercent).toBe('object');

      if (typeof exp.splitPercent === 'object') {
        expect(exp.splitPercent.control).toBe(40);
        expect(exp.splitPercent['treatment-a']).toBe(20);
        expect(exp.splitPercent['treatment-b']).toBe(20);
        expect(exp.splitPercent['treatment-c']).toBe(20);
      }
    });

    test('should include optional timestamps in experiment config', async () => {
      // Arrange
      const testSettings = {
        memory: {
          experiments: {
            'test-experiment': {
              enabled: false,
              variants: { control: 'a', treatment: 'b' },
              splitPercent: 50,
              startedAt: 1704912345000,
              stoppedAt: 1704998745000,
            },
          },
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(testSettings, null, 2));

      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;
      clearConfigCache();

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const exp = result.value.experiments!['test-experiment'];
      expect(exp.enabled).toBe(false);
      expect(exp.startedAt).toBe(1704912345000);
      expect(exp.stoppedAt).toBe(1704998745000);
    });

    test('should default to empty experiments object if not configured', async () => {
      // Arrange - config without experiments section
      const testSettings = {
        memory: {
          enabled: true,
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(testSettings, null, 2));

      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;
      clearConfigCache();

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.experiments).toBeDefined();
      expect(Object.keys(result.value.experiments!).length).toBe(0);
    });

    test('should validate split percentages sum to 100 for multi-variant', async () => {
      // Arrange - invalid split percentages (sum != 100)
      const testSettings = {
        memory: {
          experiments: {
            'invalid-split': {
              enabled: true,
              variants: { control: 'a', treatment: 'b', 'treatment-c': 'c' },
              splitPercent: {
                control: 40,
                treatment: 40,
                'treatment-c': 10, // Sum = 90, not 100
              },
            },
          },
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(testSettings, null, 2));

      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;
      clearConfigCache();

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert - should fail validation
      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.code).toBe('CONFIG_INVALID');
      expect(result.error.message).toContain('split percentages');
      expect(result.error.message).toContain('100');
    });

    test('should validate split percent is between 0 and 100 for simple split', async () => {
      // Arrange - invalid split percentage (> 100)
      const testSettings = {
        memory: {
          experiments: {
            'invalid-simple-split': {
              enabled: true,
              variants: { control: 'a', treatment: 'b' },
              splitPercent: 150,
            },
          },
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(testSettings, null, 2));

      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;
      clearConfigCache();

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert
      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.code).toBe('CONFIG_INVALID');
      expect(result.error.message).toContain('0 and 100');
    });

    test('should validate experiment has at least 2 variants', async () => {
      // Arrange - experiment with only 1 variant
      const testSettings = {
        memory: {
          experiments: {
            'single-variant': {
              enabled: true,
              variants: { control: 'keyword-search' },
              splitPercent: 100,
            },
          },
        },
      };

      writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(testSettings, null, 2));

      const originalPaiDir = process.env.PAI_DIR;
      process.env.PAI_DIR = TEST_PAI_DIR;
      clearConfigCache();

      const { getMemoryConfig } = await import('./config');
      const result = await getMemoryConfig();

      process.env.PAI_DIR = originalPaiDir;

      // Assert
      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.code).toBe('CONFIG_INVALID');
      expect(result.error.message).toContain('at least 2 variants');
    });
  });
});
