/**
 * Tests for Segment Investigator
 *
 * Story 4.6.3: Diagnostic Analysis Tools (AC4)
 */

import { describe, test, expect } from 'bun:test';
import { investigateSegment } from '../segment-investigator';

describe('Segment Investigator', () => {
  // Note: Full integration tests require proper storage provider setup and initialization
  // These unit tests validate error handling and validation logic

  describe('Basic Structure', () => {
    test('investigateSegment function exists and is callable', () => {
      expect(typeof investigateSegment).toBe('function');
    });
  });

  describe('Segment ID Validation (HIGH-4)', () => {
    test('should reject invalid segment ID format', async () => {
      const invalidIds = [
        'invalid',
        'seg_only_one_part',
        'not_a_segment_id',
        'seg-wrong-delimiter',
        '',
        'SEG_123_ABC', // uppercase should fail strict validation
      ];

      for (const invalidId of invalidIds) {
        const result = await investigateSegment(invalidId, 'test query');

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe('INVALID_SEGMENT_ID');
          expect(result.error.message).toContain('Invalid segment ID format');
        }
      }
    });

    test('should accept valid segment ID format', async () => {
      const validId = 'seg_abc123_def456';
      const result = await investigateSegment(validId, 'test query');

      // Will fail on provider not found, but NOT on invalid ID
      if (!result.ok) {
        expect(result.error.code).not.toBe('INVALID_SEGMENT_ID');
      }
    });
  });

  // TODO: Add integration tests that properly initialize storage provider
  // describe('Segment Existence Check (AC4.1)', () => {
  //   test('should diagnose non-existent segment', async () => {
  //     const result = await investigateSegment(
  //       'seg_nonexistent_abc123',
  //       'test query'
  //     );
  //
  //     expect(result.ok).toBe(true);
  //     if (result.ok) {
  //       expect(result.value.exists).toBe(false);
  //       expect(result.value.diagnosis).toContain('does not exist');
  //       expect(result.value.recommendation).toBeTruthy();
  //     }
  //   });
  // });
});
