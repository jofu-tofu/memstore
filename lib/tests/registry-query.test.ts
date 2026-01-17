import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import {
  querySessionsByDate,
  querySessionsByTag,
  loadRegistry,
  clearRegistryCache,
  type SessionMetadata,
  type Registry,
  type QueryOptions
} from '../registry-query';

describe('RegistryQuery', () => {
  let testPaiDir: string;
  let registryPath: string;

  beforeEach(() => {
    // Clear registry cache
    clearRegistryCache();

    // Create isolated test directory
    testPaiDir = join(homedir(), 'pai-test-registry-query');
    mkdirSync(testPaiDir, { recursive: true });
    process.env.PAI_DIR = testPaiDir;

    // Create test registry
    const memStorePath = join(testPaiDir, 'mem-store', 'structured');
    mkdirSync(memStorePath, { recursive: true });
    registryPath = join(memStorePath, 'session-registry.json');

    const registry: Registry = {
      version: '1.0',
      sessions: [
        {
          sessionId: 'mem_1704912345000_a1b2c3d4',
          capturedAt: Date.parse('2026-01-15'),
          segmentCount: 5,
          tags: ['typescript', 'hooks'],
          archived: false
        },
        {
          sessionId: 'mem_1705012345000_e5f6g7h8',
          capturedAt: Date.parse('2026-02-10'),
          segmentCount: 8,
          tags: ['auth', 'security'],
          archived: false
        },
        {
          sessionId: 'mem_1705112345000_i9j0k1l2',
          capturedAt: Date.parse('2026-01-22'),
          segmentCount: 12,
          tags: ['typescript', 'memory'],
          archived: false
        },
        {
          sessionId: 'mem_1705212345000_m3n4o5p6',
          capturedAt: Date.parse('2026-03-05'),
          segmentCount: 3,
          tags: ['testing'],
          archived: true // Archived session
        }
      ]
    };

    writeFileSync(registryPath, JSON.stringify(registry, null, 2));
  });

  afterEach(() => {
    // ALWAYS clean up
    if (existsSync(testPaiDir)) {
      rmSync(testPaiDir, { recursive: true, force: true });
    }
    delete process.env.PAI_DIR;
  });

  describe('loadRegistry', () => {
    test('should return registry when file exists and is valid', () => {
      // Act
      const result = loadRegistry();

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.version).toBe('1.0');
        expect(result.value.sessions).toHaveLength(4);
      }
    });

    test('should return error when registry file does not exist', () => {
      // Arrange
      rmSync(registryPath, { force: true });

      // Act
      const result = loadRegistry();

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('QUERY_REGISTRY_NOT_FOUND');
      }
    });

    test('should return error when registry file is corrupted', () => {
      // Arrange
      writeFileSync(registryPath, 'invalid json {{{');

      // Act
      const result = loadRegistry();

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('QUERY_REGISTRY_CORRUPT');
      }
    });
  });

  describe('querySessionsByDate', () => {
    test('should return sessions in date range when querying by date', () => {
      // Arrange
      const startMs = Date.parse('2026-01-01');
      const endMs = Date.parse('2026-01-31');

      // Act
      const result = querySessionsByDate(startMs, endMs);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].sessionId).toBe('mem_1704912345000_a1b2c3d4');
        expect(result.value[1].sessionId).toBe('mem_1705112345000_i9j0k1l2');
      }
    });

    test('should return empty array when no sessions in date range', () => {
      // Arrange
      const startMs = Date.parse('2025-01-01');
      const endMs = Date.parse('2025-12-31');

      // Act
      const result = querySessionsByDate(startMs, endMs);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });

    test('should exclude archived sessions by default', () => {
      // Arrange
      const startMs = Date.parse('2026-03-01');
      const endMs = Date.parse('2026-03-31');

      // Act
      const result = querySessionsByDate(startMs, endMs);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0); // Archived session excluded
      }
    });

    test('should include archived sessions when option is set', () => {
      // Arrange
      const startMs = Date.parse('2026-03-01');
      const endMs = Date.parse('2026-03-31');
      const options: QueryOptions = { includeArchived: true };

      // Act
      const result = querySessionsByDate(startMs, endMs, options);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].archived).toBe(true);
      }
    });

    test('should apply limit when specified', () => {
      // Arrange
      const startMs = Date.parse('2026-01-01');
      const endMs = Date.parse('2026-12-31');
      const options: QueryOptions = { limit: 1 };

      // Act
      const result = querySessionsByDate(startMs, endMs, options);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
      }
    });

    test('should apply offset when specified', () => {
      // Arrange
      const startMs = Date.parse('2026-01-01');
      const endMs = Date.parse('2026-12-31');
      const options: QueryOptions = { offset: 1 };

      // Act
      const result = querySessionsByDate(startMs, endMs, options);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2); // 3 total - 1 offset = 2
      }
    });

    test('should handle missing registry gracefully when querying', () => {
      // Arrange
      rmSync(registryPath, { force: true });
      const startMs = Date.parse('2026-01-01');
      const endMs = Date.parse('2026-01-31');

      // Act
      const result = querySessionsByDate(startMs, endMs);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('QUERY_REGISTRY_NOT_FOUND');
      }
    });
  });

  describe('querySessionsByTag', () => {
    test('should return sessions with tag when querying by single tag', () => {
      // Arrange
      const tag = 'typescript';

      // Act
      const result = querySessionsByTag(tag);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value.every(s => s.tags.includes('typescript'))).toBe(true);
      }
    });

    test('should return sessions matching any tag when using OR logic', () => {
      // Arrange
      const tags = ['typescript', 'auth'];

      // Act
      const result = querySessionsByTag(tags, 'any');

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(3); // 2 typescript + 1 auth
      }
    });

    test('should return sessions matching all tags when using AND logic', () => {
      // Arrange
      const tags = ['typescript', 'hooks'];

      // Act
      const result = querySessionsByTag(tags, 'all');

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].sessionId).toBe('mem_1704912345000_a1b2c3d4');
      }
    });

    test('should return empty array when no sessions match tag', () => {
      // Arrange
      const tag = 'nonexistent';

      // Act
      const result = querySessionsByTag(tag);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });

    test('should exclude archived sessions by default when querying by tag', () => {
      // Arrange
      const tag = 'testing';

      // Act
      const result = querySessionsByTag(tag);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0); // Archived session excluded
      }
    });

    test('should include archived sessions when option is set for tag queries', () => {
      // Arrange
      const tag = 'testing';
      const options: QueryOptions = { includeArchived: true };

      // Act
      const result = querySessionsByTag(tag, 'any', options);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].archived).toBe(true);
      }
    });

    test('should apply limit and offset for tag queries', () => {
      // Arrange
      const tag = 'typescript';
      const options: QueryOptions = { limit: 1, offset: 0 };

      // Act
      const result = querySessionsByTag(tag, 'any', options);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
      }
    });
  });
});
