/**
 * Tests for base harness utilities
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import {
  expectOk,
  expectError,
  createTestSegment,
  createTestSession,
  cleanTestDirectory,
  removeTestDirectory,
} from '../base-harness';
import type { Result } from '../../../types/common';

const TEST_DIR = join(homedir(), 'pai-test-base-harness');

describe('base-harness utilities', () => {
  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    removeTestDirectory(TEST_DIR);
  });

  describe('expectOk', () => {
    test('should pass for ok result', () => {
      const result: Result<string, Error> = { ok: true, value: 'success' };
      expectOk(result);
      // TypeScript narrows type - value is accessible
      expect(result.value).toBe('success');
    });

    test('should fail for error result', () => {
      const result: Result<string, Error> = {
        ok: false,
        error: new Error('failed'),
      };
      expect(() => expectOk(result)).toThrow();
    });
  });

  describe('expectError', () => {
    test('should pass for error result', () => {
      const result: Result<string, Error> = {
        ok: false,
        error: new Error('failed'),
      };
      expectError(result);
      // TypeScript narrows type - error is accessible
      expect(result.error.message).toBe('failed');
    });

    test('should fail for ok result', () => {
      const result: Result<string, Error> = { ok: true, value: 'success' };
      expect(() => expectError(result)).toThrow();
    });
  });

  describe('createTestSegment', () => {
    test('should create valid segment with defaults', () => {
      const segment = createTestSegment();

      expect(segment.id).toMatch(/^seg_test_\d+_[a-z0-9]{8}$/);
      expect(segment.sessionId).toMatch(/^mem_test_\d+$/);
      expect(segment.timestamp).toBeGreaterThan(0);
      expect(segment.importanceScore).toBe(50);
      expect(segment.accessCount).toBe(0);
      expect(segment.lastAccessed).toBeNull();
      expect(segment.tags).toEqual(['test', 'typescript']);
      expect(segment.memoryType).toBe('episodic');
      expect(segment.sourceRange).toEqual({ start: 0, end: 100 });
      expect(segment.content).toBe('Test content for provider validation');
    });

    test('should create segment with overrides', () => {
      const segment = createTestSegment({
        tags: ['custom', 'override'],
        importanceScore: 75,
        content: 'Custom test content',
      });

      expect(segment.tags).toEqual(['custom', 'override']);
      expect(segment.importanceScore).toBe(75);
      expect(segment.content).toBe('Custom test content');
      // Defaults still apply for non-overridden fields
      expect(segment.accessCount).toBe(0);
    });

    test('should create unique IDs for each segment', () => {
      const seg1 = createTestSegment();
      const seg2 = createTestSegment();

      expect(seg1.id).not.toBe(seg2.id);
    });
  });

  describe('createTestSession', () => {
    test('should create valid session ID', () => {
      const sessionId = createTestSession();
      expect(sessionId).toMatch(/^mem_test_\d+_[a-z0-9]{8}$/);
    });

    test('should create unique session IDs', () => {
      const id1 = createTestSession();
      const id2 = createTestSession();

      expect(id1).not.toBe(id2);
    });
  });

  describe('cleanTestDirectory', () => {
    test('should create directory if it does not exist', () => {
      const testDir = join(TEST_DIR, 'new-dir');
      cleanTestDirectory(testDir);

      expect(existsSync(testDir)).toBe(true);
    });

    test('should remove existing files and recreate directory', () => {
      const testDir = join(TEST_DIR, 'clean-test');
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'test.txt'), 'content');

      cleanTestDirectory(testDir);

      expect(existsSync(testDir)).toBe(true);
      expect(existsSync(join(testDir, 'test.txt'))).toBe(false);
    });
  });

  describe('removeTestDirectory', () => {
    test('should remove existing directory', () => {
      const testDir = join(TEST_DIR, 'remove-test');
      mkdirSync(testDir, { recursive: true });

      removeTestDirectory(testDir);

      expect(existsSync(testDir)).toBe(false);
    });

    test('should not fail if directory does not exist', () => {
      const testDir = join(TEST_DIR, 'nonexistent');
      expect(() => removeTestDirectory(testDir)).not.toThrow();
    });
  });
});
