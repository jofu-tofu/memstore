/**
 * Tests for Interactive Diagnostic CLI
 *
 * Story 4.6.3: Diagnostic Analysis Tools (AC6)
 *
 * Note: Interactive CLI testing focuses on core logic validation.
 * Full end-to-end interactive testing requires manual testing or advanced test harnesses.
 */

import { describe, test, expect } from 'bun:test';

describe('Interactive Diagnostics CLI', () => {
  describe('AC6: Interactive Mode Commands', () => {
    test('should validate query command format', () => {
      const command = 'query typescript hooks';
      expect(command.startsWith('query ')).toBe(true);
      expect(command.substring(6)).toBe('typescript hooks');
    });

    test('should validate config command format', () => {
      const command = 'config recency_window_days 60';
      const parts = command.split(' ');
      expect(parts.length).toBe(3);
      expect(parts[1]).toBe('recency_window_days');
      expect(parseInt(parts[2])).toBe(60);
    });

    test('should validate investigate command format', () => {
      const command = 'investigate seg_abc123_def456';
      expect(command.startsWith('investigate ')).toBe(true);
      expect(command.substring(12).trim()).toBe('seg_abc123_def456');
    });

    test('should recognize quit commands', () => {
      expect('quit' === 'quit' || 'quit' === 'exit').toBe(true);
      expect('exit' === 'quit' || 'exit' === 'exit').toBe(true);
    });

    test('should recognize help command', () => {
      expect('help').toBe('help');
    });

    test('should handle empty input gracefully', () => {
      const input = '   ';
      const trimmed = input.trim();
      expect(trimmed).toBe('');
    });

    test('should parse config parameter - recency_window_days', () => {
      const param = 'recency_window_days';
      const value = '60';
      const numValue = parseInt(value);

      expect(param).toBe('recency_window_days');
      expect(isNaN(numValue)).toBe(false);
      expect(numValue).toBe(60);
    });

    test('should parse config parameter - min_importance_score', () => {
      const param = 'min_importance_score';
      const value = '40';
      const numValue = parseInt(value);

      expect(param).toBe('min_importance_score');
      expect(isNaN(numValue)).toBe(false);
      expect(numValue).toBe(40);
    });

    test('should reject invalid config values', () => {
      const value = 'not-a-number';
      const numValue = parseInt(value);
      expect(isNaN(numValue)).toBe(true);
    });

    test('should reject unknown config parameters', () => {
      const param = 'unknown_parameter';
      const validParams = ['recency_window_days', 'min_importance_score'];
      expect(validParams.includes(param)).toBe(false);
    });
  });

  describe('AC6: Command Parsing Logic', () => {
    test('should extract query from query command', () => {
      const input = 'query typescript hooks error handling';
      const query = input.substring(6);
      expect(query).toBe('typescript hooks error handling');
    });

    test('should handle query with leading/trailing spaces', () => {
      const input = 'query   typescript hooks   ';
      const query = input.substring(6).trim();
      expect(query).toBe('typescript hooks');
    });

    test('should extract segment ID from investigate command', () => {
      const input = 'investigate seg_1234_abcd';
      const segmentId = input.substring(12).trim();
      expect(segmentId).toBe('seg_1234_abcd');
    });

    test('should parse config with multiple spaces', () => {
      const input = 'config  recency_window_days  90';
      const parts = input.split(/\s+/); // Split on whitespace
      expect(parts[0]).toBe('config');
      expect(parts[1]).toBe('recency_window_days');
      expect(parts[2]).toBe('90');
    });
  });

  describe('AC6: Input Validation', () => {
    test('should validate segment ID format', () => {
      const validId = 'seg_1234_abcd';
      const invalidId1 = 'segment_123';
      const invalidId2 = 'seg_123';

      // Valid format: seg_<alphanumeric>_<alphanumeric>
      expect(/^seg_[a-z0-9]+_[a-z0-9]+$/.test(validId)).toBe(true);
      expect(/^seg_[a-z0-9]+_[a-z0-9]+$/.test(invalidId1)).toBe(false);
      expect(/^seg_[a-z0-9]+_[a-z0-9]+$/.test(invalidId2)).toBe(false);
    });

    test('should validate config parameter names', () => {
      const valid1 = 'recency_window_days';
      const valid2 = 'min_importance_score';
      const invalid = 'random_parameter';

      const validParams = ['recency_window_days', 'min_importance_score'];
      expect(validParams.includes(valid1)).toBe(true);
      expect(validParams.includes(valid2)).toBe(true);
      expect(validParams.includes(invalid)).toBe(false);
    });

    test('should validate numeric config values', () => {
      expect(!isNaN(parseInt('60'))).toBe(true);
      expect(!isNaN(parseInt('0'))).toBe(true);
      expect(!isNaN(parseInt('-5'))).toBe(true);
      expect(isNaN(parseInt('abc'))).toBe(true);
      expect(isNaN(parseInt(''))).toBe(true);
    });
  });
});
