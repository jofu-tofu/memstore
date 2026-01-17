/**
 * Experiment variant selection tests (Story 5.4 Task 2)
 *
 * Tests for deterministic hash-based variant assignment.
 */

import { describe, test, expect } from 'bun:test';
import {
  selectVariant,
  hashCode,
  getActiveExperiment,
  validateSplitPercentages,
  type ExperimentConfig,
  type MemoryConfig,
} from './experiment';

describe('experiment - variant selection', () => {
  describe('hashCode', () => {
    test('should return consistent hash for same input', () => {
      // Arrange
      const input = 'test-experiment:request-123';

      // Act
      const hash1 = hashCode(input);
      const hash2 = hashCode(input);

      // Assert
      expect(hash1).toBe(hash2);
    });

    test('should return different hashes for different inputs', () => {
      // Arrange
      const input1 = 'experiment-a:request-1';
      const input2 = 'experiment-b:request-2';

      // Act
      const hash1 = hashCode(input1);
      const hash2 = hashCode(input2);

      // Assert
      expect(hash1).not.toBe(hash2);
    });

    test('should return deterministic hash across runs', () => {
      // This test verifies hash algorithm is deterministic, not random
      const input = 'search-comparison:session-abc123';

      const hash = hashCode(input);

      // Hash should be a number
      expect(typeof hash).toBe('number');

      // Hash should be consistent (same as before)
      expect(hashCode(input)).toBe(hash);
    });
  });

  describe('selectVariant - simple 50/50 split', () => {
    test('should select variant deterministically based on hash', () => {
      // Arrange
      const experimentId = 'search-test';
      const requestId = 'request-123';
      const config: ExperimentConfig = {
        enabled: true,
        variants: {
          control: 'keyword-search',
          treatment: 'semantic-search',
        },
        splitPercent: 50,
      };

      // Act
      const variant1 = selectVariant(experimentId, requestId, config);
      const variant2 = selectVariant(experimentId, requestId, config);

      // Assert - same requestId should always get same variant
      expect(variant1).toBe(variant2);
      expect(['control', 'treatment']).toContain(variant1);
    });

    test('should distribute requests approximately 50/50 over many trials', () => {
      // Arrange
      const experimentId = 'search-test';
      const config: ExperimentConfig = {
        enabled: true,
        variants: {
          control: 'keyword-search',
          treatment: 'semantic-search',
        },
        splitPercent: 50,
      };

      // Act - simulate 1000 requests
      const variants = Array.from({ length: 1000 }, (_, i) => {
        const requestId = `request-${i}`;
        return selectVariant(experimentId, requestId, config);
      });

      // Assert - should be approximately 50/50 (allow 10% tolerance)
      const controlCount = variants.filter((v) => v === 'control').length;
      const treatmentCount = variants.filter((v) => v === 'treatment').length;

      expect(controlCount).toBeGreaterThan(400);
      expect(controlCount).toBeLessThan(600);
      expect(treatmentCount).toBeGreaterThan(400);
      expect(treatmentCount).toBeLessThan(600);
    });

    test('should respect different split percentages', () => {
      // Arrange - 70/30 split
      const experimentId = 'ranking-test';
      const config: ExperimentConfig = {
        enabled: true,
        variants: {
          control: 'default-ranking',
          treatment: 'new-ranking',
        },
        splitPercent: 70, // 70% control, 30% treatment
      };

      // Act - simulate 1000 requests
      const variants = Array.from({ length: 1000 }, (_, i) =>
        selectVariant(experimentId, `request-${i}`, config)
      );

      // Assert - should be approximately 70/30
      const controlCount = variants.filter((v) => v === 'control').length;

      expect(controlCount).toBeGreaterThan(650);
      expect(controlCount).toBeLessThan(750);
    });
  });

  describe('selectVariant - multi-variant split', () => {
    test('should distribute across multiple variants according to percentages', () => {
      // Arrange - 4-way split: 40/20/20/20
      const experimentId = 'ranking-comparison';
      const config: ExperimentConfig = {
        enabled: true,
        variants: {
          control: 'default',
          'treatment-a': 'boost-importance',
          'treatment-b': 'boost-recency',
          'treatment-c': 'boost-access',
        },
        splitPercent: {
          control: 40,
          'treatment-a': 20,
          'treatment-b': 20,
          'treatment-c': 20,
        },
      };

      // Act - simulate 1000 requests
      const variants = Array.from({ length: 1000 }, (_, i) =>
        selectVariant(experimentId, `request-${i}`, config)
      );

      // Assert - verify distribution (allow 10% tolerance)
      const counts = {
        control: variants.filter((v) => v === 'control').length,
        'treatment-a': variants.filter((v) => v === 'treatment-a').length,
        'treatment-b': variants.filter((v) => v === 'treatment-b').length,
        'treatment-c': variants.filter((v) => v === 'treatment-c').length,
      };

      // Control: 40% of 1000 = 400 ± 100
      expect(counts.control).toBeGreaterThan(300);
      expect(counts.control).toBeLessThan(500);

      // Each treatment: 20% of 1000 = 200 ± 60
      expect(counts['treatment-a']).toBeGreaterThan(140);
      expect(counts['treatment-a']).toBeLessThan(260);

      expect(counts['treatment-b']).toBeGreaterThan(140);
      expect(counts['treatment-b']).toBeLessThan(260);

      expect(counts['treatment-c']).toBeGreaterThan(140);
      expect(counts['treatment-c']).toBeLessThan(260);
    });

    test('should maintain determinism for multi-variant experiments', () => {
      // Arrange
      const experimentId = 'multi-test';
      const requestId = 'request-xyz';
      const config: ExperimentConfig = {
        enabled: true,
        variants: {
          a: 'provider-a',
          b: 'provider-b',
          c: 'provider-c',
        },
        splitPercent: {
          a: 33,
          b: 33,
          c: 34,
        },
      };

      // Act
      const variant1 = selectVariant(experimentId, requestId, config);
      const variant2 = selectVariant(experimentId, requestId, config);
      const variant3 = selectVariant(experimentId, requestId, config);

      // Assert - all calls return same variant
      expect(variant1).toBe(variant2);
      expect(variant2).toBe(variant3);
      expect(['a', 'b', 'c']).toContain(variant1);
    });
  });

  describe('getActiveExperiment', () => {
    test('should return null when no experiments configured', () => {
      // Arrange
      const config: MemoryConfig = {
        enabled: true,
        hooks: { sessionEnd: true, userPromptSubmit: true, sessionStart: false },
        providers: {
          segment: 'per-message',
          extract: [],
          summarize: 'simple',
          storage: 'file',
          search: 'keyword',
          organize: 'flat',
        },
        retention: { shortTermMaxSessions: 50, shortTermMaxAgeDays: 30, autoConsolidate: true },
        performance: { maxRetrievalMs: 1000, maxInjectionTokens: 2000, maxResultCount: 10 },
        experiments: {},
      };

      // Act
      const result = getActiveExperiment(config, 'search');

      // Assert
      expect(result).toBeNull();
    });

    test('should return null when experiment is disabled', () => {
      // Arrange
      const config: MemoryConfig = {
        enabled: true,
        hooks: { sessionEnd: true, userPromptSubmit: true, sessionStart: false },
        providers: {
          segment: 'per-message',
          extract: [],
          summarize: 'simple',
          storage: 'file',
          search: 'keyword',
          organize: 'flat',
        },
        retention: { shortTermMaxSessions: 50, shortTermMaxAgeDays: 30, autoConsolidate: true },
        performance: { maxRetrievalMs: 1000, maxInjectionTokens: 2000, maxResultCount: 10 },
        experiments: {
          'search-test': {
            enabled: false, // Disabled
            variants: { control: 'keyword', treatment: 'semantic' },
            splitPercent: 50,
          },
        },
      };

      // Act
      const result = getActiveExperiment(config, 'search');

      // Assert
      expect(result).toBeNull();
    });

    test('should return active experiment when enabled', () => {
      // Arrange
      const config: MemoryConfig = {
        enabled: true,
        hooks: { sessionEnd: true, userPromptSubmit: true, sessionStart: false },
        providers: {
          segment: 'per-message',
          extract: [],
          summarize: 'simple',
          storage: 'file',
          search: 'keyword',
          organize: 'flat',
        },
        retention: { shortTermMaxSessions: 50, shortTermMaxAgeDays: 30, autoConsolidate: true },
        performance: { maxRetrievalMs: 1000, maxInjectionTokens: 2000, maxResultCount: 10 },
        experiments: {
          'search-comparison': {
            enabled: true,
            variants: { control: 'keyword-search', treatment: 'semantic-search' },
            splitPercent: 50,
          },
        },
      };

      // Act
      const result = getActiveExperiment(config, 'search');

      // Assert
      expect(result).not.toBeNull();
      expect(result!.id).toBe('search-comparison');
      expect(result!.config.enabled).toBe(true);
      expect(result!.config.variants.control).toBe('keyword-search');
    });

    test('should return first enabled experiment if multiple match provider type', () => {
      // Arrange - multiple search experiments
      const config: MemoryConfig = {
        enabled: true,
        hooks: { sessionEnd: true, userPromptSubmit: true, sessionStart: false },
        providers: {
          segment: 'per-message',
          extract: [],
          summarize: 'simple',
          storage: 'file',
          search: 'keyword',
          organize: 'flat',
        },
        retention: { shortTermMaxSessions: 50, shortTermMaxAgeDays: 30, autoConsolidate: true },
        performance: { maxRetrievalMs: 1000, maxInjectionTokens: 2000, maxResultCount: 10 },
        experiments: {
          'search-exp-1': {
            enabled: true,
            variants: { control: 'keyword', treatment: 'semantic' },
            splitPercent: 50,
          },
          'search-exp-2': {
            enabled: true,
            variants: { control: 'bm25', treatment: 'tfidf' },
            splitPercent: 50,
          },
        },
      };

      // Act
      const result = getActiveExperiment(config, 'search');

      // Assert - should return first one
      expect(result).not.toBeNull();
      expect(result!.id).toBe('search-exp-1');
    });
  });

  describe('validateSplitPercentages', () => {
    test('should accept valid simple split (0-100)', () => {
      // Arrange
      const config: ExperimentConfig = {
        enabled: true,
        variants: { control: 'a', treatment: 'b' },
        splitPercent: 50,
      };

      // Act
      const result = validateSplitPercentages(config);

      // Assert
      expect(result.ok).toBe(true);
    });

    test('should accept valid multi-variant split summing to 100', () => {
      // Arrange
      const config: ExperimentConfig = {
        enabled: true,
        variants: { control: 'a', 'treatment-a': 'b', 'treatment-b': 'c' },
        splitPercent: { control: 50, 'treatment-a': 30, 'treatment-b': 20 },
      };

      // Act
      const result = validateSplitPercentages(config);

      // Assert
      expect(result.ok).toBe(true);
    });

    test('should reject simple split < 0', () => {
      // Arrange
      const config: ExperimentConfig = {
        enabled: true,
        variants: { control: 'a', treatment: 'b' },
        splitPercent: -10,
      };

      // Act
      const result = validateSplitPercentages(config);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('EXPERIMENT_INVALID_CONFIG');
        expect(result.error.message).toContain('0 and 100');
      }
    });

    test('should reject simple split > 100', () => {
      // Arrange
      const config: ExperimentConfig = {
        enabled: true,
        variants: { control: 'a', treatment: 'b' },
        splitPercent: 150,
      };

      // Act
      const result = validateSplitPercentages(config);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('EXPERIMENT_INVALID_CONFIG');
        expect(result.error.message).toContain('0 and 100');
      }
    });

    test('should reject multi-variant split not summing to 100', () => {
      // Arrange
      const config: ExperimentConfig = {
        enabled: true,
        variants: { control: 'a', 'treatment-a': 'b', 'treatment-b': 'c' },
        splitPercent: { control: 50, 'treatment-a': 30, 'treatment-b': 10 }, // Sum = 90
      };

      // Act
      const result = validateSplitPercentages(config);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('EXPERIMENT_INVALID_CONFIG');
        expect(result.error.message).toContain('sum to 100');
      }
    });

    test('should allow tiny floating point error in sum', () => {
      // Arrange
      const config: ExperimentConfig = {
        enabled: true,
        variants: { control: 'a', 'treatment-a': 'b', 'treatment-b': 'c' },
        splitPercent: {
          control: 33.33,
          'treatment-a': 33.33,
          'treatment-b': 33.34,
        }, // Sum = 100.00 (within tolerance)
      };

      // Act
      const result = validateSplitPercentages(config);

      // Assert
      expect(result.ok).toBe(true);
    });
  });
});
