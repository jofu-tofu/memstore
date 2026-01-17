/**
 * StorageProvider contract test harness
 *
 * Validates any StorageProvider implementation against the interface contract.
 *
 * @module providers/test-harness/storage-harness
 */

import { describe, test, expect, beforeAll, beforeEach, afterEach, afterAll } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import type { StorageProvider } from '../storage/interface';
import type { HarnessOptions } from './harness-types';
import {
  expectOk,
  expectError,
  createTestSegment,
  cleanTestDirectory,
  removeTestDirectory,
} from './base-harness';

/**
 * Run StorageProvider contract tests against a provider implementation.
 *
 * Tests all interface methods and validates contract compliance:
 * - Lifecycle methods (initialize, healthCheck, shutdown)
 * - CRUD operations (store, retrieve, update, delete)
 * - Query operations with filters
 * - Error handling (Result types, no exceptions)
 * - Special behaviors (null-not-error, idempotent delete, accessCount increment)
 *
 * @param ProviderClass - StorageProvider implementation class
 * @param options - Optional harness configuration
 *
 * @example
 * ```typescript
 * import { runStorageProviderTests } from '../test-harness/storage-harness';
 * import { FileBackend } from './file-backend';
 *
 * describe('FileBackend', () => {
 *   runStorageProviderTests(FileBackend, { cleanupBeforeEach: true });
 * });
 * ```
 */
export function runStorageProviderTests(
  ProviderClass: new (...args: any[]) => StorageProvider,
  options?: HarnessOptions
): void {
  describe(`${ProviderClass.name} (StorageProvider Contract)`, () => {
    let provider: StorageProvider;
    let testDir: string;

    beforeAll(() => {
      testDir = options?.testDataPath || join(homedir(), `pai-test-${ProviderClass.name.toLowerCase()}`);
      cleanTestDirectory(testDir);
    });

    beforeEach(async () => {
      provider = new ProviderClass({ storePath: testDir });
      const initResult = await provider.initialize();
      expectOk(initResult);
    });

    afterEach(async () => {
      await provider.shutdown();
      if (options?.cleanupBeforeEach) {
        cleanTestDirectory(testDir);
      }
    });

    afterAll(() => {
      removeTestDirectory(testDir);
    });

    // AC2: StorageProvider Method Validation

    test('should implement initialize() correctly', async () => {
      // Re-initialize should be idempotent
      const result = await provider.initialize();
      expectOk(result);
    });

    test('should implement store() - persists segment and returns StoreResult', async () => {
      const segment = createTestSegment();
      const result = await provider.store(segment);

      expectOk(result);
      expect(result.value).toHaveProperty('id');
      expect(result.value).toHaveProperty('path');
      expect(result.value).toHaveProperty('timestamp');
      expect(result.value.id).toBe(segment.id);
      expect(result.value.path).toBeString();
      expect(result.value.timestamp).toBeGreaterThan(0);
    });

    test('should implement retrieve() - returns existing segment', async () => {
      const segment = createTestSegment();
      const storeResult = await provider.store(segment);
      expectOk(storeResult);

      const retrieveResult = await provider.retrieve(segment.id);
      expectOk(retrieveResult);
      expect(retrieveResult.value).not.toBeNull();
      expect(retrieveResult.value?.id).toBe(segment.id);
      expect(retrieveResult.value?.content).toBe(segment.content);
    });

    test('should implement retrieve() - returns null for non-existent ID (null-not-error pattern)', async () => {
      const result = await provider.retrieve('seg_nonexistent_12345678');

      expectOk(result);
      expect(result.value).toBeNull();
    });

    test('should implement query() - filter by tags (OR logic)', async () => {
      const seg1 = createTestSegment({ tags: ['typescript', 'memory'] });
      const seg2 = createTestSegment({ tags: ['python', 'testing'] });
      const seg3 = createTestSegment({ tags: ['typescript', 'hooks'] });

      await provider.store(seg1);
      await provider.store(seg2);
      await provider.store(seg3);

      const result = await provider.query({ tags: ['typescript'] });
      expectOk(result);

      expect(result.value.segments).toBeArray();
      expect(result.value.segments.length).toBeGreaterThanOrEqual(2);
      expect(result.value.total).toBeGreaterThanOrEqual(2);

      // Verify all results have 'typescript' tag
      result.value.segments.forEach(seg => {
        expect(seg.tags).toContain('typescript');
      });
    });

    test('should implement query() - filter by recency', async () => {
      const oldSegment = createTestSegment({
        timestamp: Date.now() - 86400000 * 30,  // 30 days ago
        tags: ['old', 'recency-test'],
      });
      const recentSegment = createTestSegment({
        tags: ['recent', 'recency-test'],
      });

      await provider.store(oldSegment);
      await provider.store(recentSegment);

      // Query with recency filter AND tag filter to scope results
      const result = await provider.query({
        recency: '7d',
        tags: ['recency-test'],
      });
      expectOk(result);

      // Recent segment should be included
      const recentIds = result.value.segments.map(s => s.id);
      expect(recentIds).toContain(recentSegment.id);
      // Old segment should not be included
      expect(recentIds).not.toContain(oldSegment.id);
    });

    test('should implement query() - filter by minImportance', async () => {
      const lowImportance = createTestSegment({
        importanceScore: 20,
        tags: ['low', 'importance-test'],
      });
      const highImportance = createTestSegment({
        importanceScore: 80,
        tags: ['high', 'importance-test'],
      });

      await provider.store(lowImportance);
      await provider.store(highImportance);

      // Query with importance filter AND tag filter to scope results
      const result = await provider.query({
        minImportance: 50,
        tags: ['importance-test'],
      });
      expectOk(result);

      // Only high importance should be returned
      const resultIds = result.value.segments.map(s => s.id);
      expect(resultIds).toContain(highImportance.id);
      expect(resultIds).not.toContain(lowImportance.id);
    });

    test('should implement query() - filter by minAccessCount', async () => {
      const unaccessed = createTestSegment({ accessCount: 0 });
      const accessed = createTestSegment({ accessCount: 5 });

      await provider.store(unaccessed);
      await provider.store(accessed);

      const result = await provider.query({ minAccessCount: 3 });
      expectOk(result);

      const resultIds = result.value.segments.map(s => s.id);
      expect(resultIds).toContain(accessed.id);
      expect(resultIds).not.toContain(unaccessed.id);
    });

    test('should implement update() - merges partial updates', async () => {
      const segment = createTestSegment({ importanceScore: 50, tags: ['original'] });
      await provider.store(segment);

      const updateResult = await provider.update(segment.id, {
        importanceScore: 75,
        tags: ['updated', 'modified'],
      });
      expectOk(updateResult);

      expect(updateResult.value.importanceScore).toBe(75);
      expect(updateResult.value.tags).toContain('updated');
      expect(updateResult.value.tags).toContain('modified');
      // Other fields should be preserved
      expect(updateResult.value.content).toBe(segment.content);
      expect(updateResult.value.sessionId).toBe(segment.sessionId);
    });

    test('should implement update() - increments accessCount (not replace)', async () => {
      const segment = createTestSegment({ accessCount: 0 });
      await provider.store(segment);

      // First increment
      const update1 = await provider.update(segment.id, { accessCount: 1 });
      expectOk(update1);
      expect(update1.value.accessCount).toBe(1);

      // Second increment
      const update2 = await provider.update(segment.id, { accessCount: 1 });
      expectOk(update2);
      expect(update2.value.accessCount).toBe(2);
    });

    test('should implement delete() - removes segment', async () => {
      const segment = createTestSegment();
      await provider.store(segment);

      const deleteResult = await provider.delete(segment.id);
      expectOk(deleteResult);
      expect(deleteResult.value).toBe(true);

      // Verify segment is gone
      const retrieveResult = await provider.retrieve(segment.id);
      expectOk(retrieveResult);
      expect(retrieveResult.value).toBeNull();
    });

    test('should implement delete() - idempotent (delete twice does not fail)', async () => {
      const segment = createTestSegment();
      await provider.store(segment);

      // First delete - should succeed
      const delete1 = await provider.delete(segment.id);
      expectOk(delete1);
      expect(delete1.value).toBe(true);

      // Second delete - should not throw/error (idempotent behavior)
      const delete2 = await provider.delete(segment.id);
      // Some implementations return false, others return true - both are acceptable
      // The key is that it doesn't fail
      expect(delete2.ok).toBe(true);
    });

    test('should implement healthCheck() - returns valid HealthStatus', async () => {
      const health = await provider.healthCheck();

      // Support both HealthStatus and Result<boolean> patterns
      if ('ok' in health) {
        // Result<boolean> pattern (backward compatibility)
        expect(health.ok).toBeBoolean();
      } else {
        // HealthStatus pattern (interface spec)
        expect(health).toHaveProperty('healthy');
        expect(health).toHaveProperty('message');
        expect(health.healthy).toBeBoolean();
        expect(health.message).toBeString();
      }
    });

    test('should implement shutdown() - completes without error', async () => {
      const result = await provider.shutdown();
      // Support both Promise<void> and Promise<Result<void>> patterns
      if (result && typeof result === 'object' && 'ok' in result) {
        // Result<void> pattern (backward compatibility)
        expectOk(result);
      }
      // Promise<void> pattern returns undefined - test passes
    });

    test('should return Result errors, not throw exceptions', async () => {
      // Attempting to update non-existent segment should return error, not throw
      const updateResult = await provider.update('seg_nonexistent_12345678', { importanceScore: 50 });

      expectError(updateResult);
      expect(updateResult.error).toHaveProperty('code');
      expect(updateResult.error).toHaveProperty('message');
    });

    test('should use correct error codes matching interface', async () => {
      // Update non-existent should return STORAGE_NOT_FOUND or STORAGE_UPDATE_FAILED
      const updateResult = await provider.update('seg_nonexistent_12345678', { importanceScore: 50 });
      expectError(updateResult);

      expect(updateResult.error.code).toMatch(/^STORAGE_/);
      expect(['STORAGE_NOT_FOUND', 'STORAGE_UPDATE_FAILED']).toContain(updateResult.error.code);
    });
  });
}
