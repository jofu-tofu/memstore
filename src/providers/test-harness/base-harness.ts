/**
 * Shared utilities for provider contract testing
 *
 * @module providers/test-harness/base-harness
 */

import { expect } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'fs';
import type { Result } from '../../types/common';
import type { MemorySegment } from '../../types/segment';

/**
 * Assert that Result is ok and narrows type to success value.
 *
 * @example
 * ```typescript
 * const result = await provider.store(segment);
 * expectOk(result);
 * // TypeScript knows result.value exists here
 * expect(result.value.id).toBeDefined();
 * ```
 */
export function expectOk<T, E>(result: Result<T, E>): asserts result is { ok: true; value: T } {
  expect(result.ok).toBe(true);
}

/**
 * Assert that Result is error and narrows type to error value.
 *
 * @example
 * ```typescript
 * const result = await provider.invalidOperation();
 * expectError(result);
 * // TypeScript knows result.error exists here
 * expect(result.error.code).toBeDefined();
 * ```
 */
export function expectError<T, E>(result: Result<T, E>): asserts result is { ok: false; error: E } {
  expect(result.ok).toBe(false);
}

/**
 * Create a test memory segment with unique ID.
 *
 * @param overrides - Partial segment to override defaults
 * @returns Complete MemorySegment ready for testing
 *
 * @example
 * ```typescript
 * const segment = createTestSegment({ tags: ['custom'] });
 * const result = await storage.store(segment);
 * ```
 */
export function createTestSegment(overrides?: Partial<MemorySegment>): MemorySegment {
  const now = Date.now();
  const randomId = Math.random().toString(36).slice(2, 10);

  return {
    id: `seg_test_${now}_${randomId}`,
    sessionId: `mem_test_${now}`,
    timestamp: now,
    importanceScore: 50,
    accessCount: 0,
    lastAccessed: null,
    tags: ['test', 'typescript'],
    memoryType: 'episodic' as const,
    sourceRange: { start: 0, end: 100 },
    content: 'Test content for provider validation',
    ...overrides,
  };
}

/**
 * Create a test session ID with unique identifier.
 *
 * @returns Session ID in format: mem_test_{timestamp}_{random}
 *
 * @example
 * ```typescript
 * const sessionId = createTestSession();
 * const segments = await segmentProvider.segment('test transcript', sessionId);
 * ```
 */
export function createTestSession(): string {
  const now = Date.now();
  const randomId = Math.random().toString(36).slice(2, 10);
  return `mem_test_${now}_${randomId}`;
}

/**
 * Clean test directory by removing and recreating it.
 *
 * Safe to call even if directory doesn't exist.
 *
 * @param dir - Absolute path to test directory
 *
 * @example
 * ```typescript
 * beforeEach(() => {
 *   cleanTestDirectory(testDir);
 * });
 * ```
 */
export function cleanTestDirectory(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });
}

/**
 * Remove test directory completely.
 *
 * Safe to call even if directory doesn't exist.
 *
 * @param dir - Absolute path to test directory
 *
 * @example
 * ```typescript
 * afterAll(() => {
 *   removeTestDirectory(testDir);
 * });
 * ```
 */
export function removeTestDirectory(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
