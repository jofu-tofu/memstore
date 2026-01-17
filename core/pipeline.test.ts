/**
 * Pipeline Provider Selection Tests
 *
 * Tests provider loading logic in pipeline.ts including:
 * - Single provider loading with fallback
 * - Multiple extract providers
 * - Config changes
 */

import { describe, test, expect, beforeEach, afterEach, afterAll } from 'bun:test';
import { loadPipelineProviders } from './pipeline';
import { globalProviderRegistry } from './provider-registry';
import { resetProvidersRegistered, registerMVPProviders } from './register-providers';
import type { MemoryConfig } from './config';
import type { Result } from '../types/result';

// Mock provider interfaces
const createMockProvider = (name: string, type: string) => ({
  name,
  version: '1.0.0',
  async initialize(): Promise<Result<void, any>> {
    return { ok: true, value: undefined };
  },
  async healthCheck() {
    return { status: 'healthy' as const };
  },
  async shutdown() {},
});

describe('Pipeline - Provider Selection', () => {
  beforeEach(() => {
    // Clear provider cache
    globalProviderRegistry.clearCache();
  });

  afterEach(() => {
    // Clear provider cache to avoid test interference
    // Note: This doesn't restore original providers, but clears mock state
    globalProviderRegistry.clearCache();
  });

  afterAll(() => {
    // Completely clear all mock registrations and restore MVP providers
    // This prevents mock providers from polluting other test files
    globalProviderRegistry.clearAll();
    resetProvidersRegistered();
    registerMVPProviders();
  });

  test('should load all providers when configured', async () => {
    // Register all MVP providers
    globalProviderRegistry.registerProvider('segment', 'per-message', async () => ({
      ok: true as const,
      value: {
        ...createMockProvider('per-message', 'segment'),
        async segment(transcript: string, sessionId: string) {
          return { ok: true as const, value: [] };
        },
      },
    }));

    globalProviderRegistry.registerProvider(
      'extract',
      'frontmatter-gen',
      async () => ({
        ok: true as const,
        value: {
          ...createMockProvider('frontmatter-gen', 'extract'),
          async extract(segment: any) {
            return { ok: true as const, value: segment };
          },
        },
      })
    );

    globalProviderRegistry.registerProvider(
      'extract',
      'keyword-tagger',
      async () => ({
        ok: true as const,
        value: {
          ...createMockProvider('keyword-tagger', 'extract'),
          async extract(segment: any) {
            return { ok: true as const, value: segment };
          },
        },
      })
    );

    globalProviderRegistry.registerProvider(
      'summarize',
      'simple-extract',
      async () => ({
        ok: true as const,
        value: {
          ...createMockProvider('simple-extract', 'summarize'),
          async summarize(segment: any) {
            return { ok: true as const, value: segment };
          },
        },
      })
    );

    globalProviderRegistry.registerProvider('storage', 'file-backend', async () => ({
      ok: true as const,
      value: {
        ...createMockProvider('file-backend', 'storage'),
        async store(segment: any) {
          return { ok: true as const, value: { id: 'seg_1704567890123_abcd1234' } };
        },
        async retrieve(id: string) {
          return { ok: true as const, value: null };
        },
        async query(filters: any) {
          return { ok: true as const, value: { results: [] } };
        },
        async delete(id: string) {
          return { ok: true as const, value: true };
        },
        async update(id: string, updates: any) {
          return { ok: true as const, value: { id, ...updates } };
        },
      },
    }));

    globalProviderRegistry.registerProvider('organize', 'flat-by-date', async () => ({
      ok: true as const,
      value: {
        ...createMockProvider('flat-by-date', 'organize'),
        async organize(segment: any) {
          return { ok: true as const, value: 'path/to/segment' };
        },
      },
    }));

    const config: MemoryConfig = {
      enabled: true,
      hooks: { sessionEnd: true, userPromptSubmit: true, sessionStart: false },
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
        autoConsolidate: false,
      },
      performance: {
        maxRetrievalMs: 1000,
        maxInjectionTokens: 2000,
        maxResultCount: 10,
      },
    };

    const result = await loadPipelineProviders(config);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.segmentProvider.name).toBe('per-message');
      expect(result.value.extractProviders.length).toBe(2);
      expect(result.value.extractProviders[0].name).toBe('frontmatter-gen');
      expect(result.value.extractProviders[1].name).toBe('keyword-tagger');
      expect(result.value.summarizeProvider.name).toBe('simple-extract');
      expect(result.value.storageProvider.name).toBe('file-backend');
      expect(result.value.organizeProvider.name).toBe('flat-by-date');
    }
  });

  test('should fallback to defaults when provider not found', async () => {
    // Register only MVP default providers
    globalProviderRegistry.registerProvider('segment', 'per-message', async () => ({
      ok: true as const,
      value: {
        ...createMockProvider('per-message', 'segment'),
        async segment(transcript: string, sessionId: string) {
          return { ok: true as const, value: [] };
        },
      },
    }));

    globalProviderRegistry.registerProvider('storage', 'file-backend', async () => ({
      ok: true as const,
      value: {
        ...createMockProvider('file-backend', 'storage'),
        async store(segment: any) {
          return { ok: true as const, value: { id: 'seg_1704567890123_abcd1234' } };
        },
        async retrieve(id: string) {
          return { ok: true as const, value: null };
        },
        async query(filters: any) {
          return { ok: true as const, value: { results: [] } };
        },
        async delete(id: string) {
          return { ok: true as const, value: true };
        },
        async update(id: string, updates: any) {
          return { ok: true as const, value: { id, ...updates } };
        },
      },
    }));

    globalProviderRegistry.registerProvider(
      'summarize',
      'simple-extract',
      async () => ({
        ok: true as const,
        value: {
          ...createMockProvider('simple-extract', 'summarize'),
          async summarize(segment: any) {
            return { ok: true as const, value: segment };
          },
        },
      })
    );

    globalProviderRegistry.registerProvider('organize', 'flat-by-date', async () => ({
      ok: true as const,
      value: {
        ...createMockProvider('flat-by-date', 'organize'),
        async organize(segment: any) {
          return { ok: true as const, value: 'path/to/segment' };
        },
      },
    }));

    globalProviderRegistry.registerProvider(
      'extract',
      'frontmatter-gen',
      async () => ({
        ok: true as const,
        value: {
          ...createMockProvider('frontmatter-gen', 'extract'),
          async extract(segment: any) {
            return { ok: true as const, value: segment };
          },
        },
      })
    );

    globalProviderRegistry.registerProvider(
      'extract',
      'keyword-tagger',
      async () => ({
        ok: true as const,
        value: {
          ...createMockProvider('keyword-tagger', 'extract'),
          async extract(segment: any) {
            return { ok: true as const, value: segment };
          },
        },
      })
    );

    // Config requests nonexistent providers
    const config: MemoryConfig = {
      enabled: true,
      hooks: { sessionEnd: true, userPromptSubmit: true, sessionStart: false },
      providers: {
        segment: 'advanced-segmenter', // Not registered
        extract: ['frontmatter-gen', 'keyword-tagger'],
        summarize: 'llm-summarizer', // Not registered
        storage: 'graph-backend', // Not registered
        search: 'keyword-search',
        organize: 'tiered-temporal', // Not registered
      },
      retention: {
        shortTermMaxSessions: 50,
        shortTermMaxAgeDays: 30,
        autoConsolidate: false,
      },
      performance: {
        maxRetrievalMs: 1000,
        maxInjectionTokens: 2000,
        maxResultCount: 10,
      },
    };

    const result = await loadPipelineProviders(config);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should fallback to MVP defaults
      expect(result.value.segmentProvider.name).toBe('per-message');
      expect(result.value.summarizeProvider.name).toBe('simple-extract');
      expect(result.value.storageProvider.name).toBe('file-backend');
      expect(result.value.organizeProvider.name).toBe('flat-by-date');
    }
  });

  test('should run extract providers in sequence', async () => {
    const extractionOrder: string[] = [];

    globalProviderRegistry.registerProvider(
      'extract',
      'extractor-1',
      async () => ({
        ok: true as const,
        value: {
          ...createMockProvider('extractor-1', 'extract'),
          async extract(segment: any) {
            extractionOrder.push('extractor-1');
            return { ok: true as const, value: { ...segment, field1: 'value1' } };
          },
        },
      })
    );

    globalProviderRegistry.registerProvider(
      'extract',
      'extractor-2',
      async () => ({
        ok: true as const,
        value: {
          ...createMockProvider('extractor-2', 'extract'),
          async extract(segment: any) {
            extractionOrder.push('extractor-2');
            return { ok: true as const, value: { ...segment, field2: 'value2' } };
          },
        },
      })
    );

    // Register other required providers with minimal implementation
    globalProviderRegistry.registerProvider('segment', 'per-message', async () => ({
      ok: true as const,
      value: {
        ...createMockProvider('per-message', 'segment'),
        async segment() {
          return { ok: true as const, value: [] };
        },
      },
    }));

    globalProviderRegistry.registerProvider(
      'summarize',
      'simple-extract',
      async () => ({
        ok: true as const,
        value: {
          ...createMockProvider('simple-extract', 'summarize'),
          async summarize(segment: any) {
            return { ok: true as const, value: segment };
          },
        },
      })
    );

    globalProviderRegistry.registerProvider('storage', 'file-backend', async () => ({
      ok: true as const,
      value: {
        ...createMockProvider('file-backend', 'storage'),
        async store() {
          return { ok: true as const, value: { id: 'seg_1704567890123_abcd1234' } };
        },
        async retrieve() {
          return { ok: true as const, value: null };
        },
        async query() {
          return { ok: true as const, value: { results: [] } };
        },
        async delete() {
          return { ok: true as const, value: true };
        },
        async update(id: string, updates: any) {
          return { ok: true as const, value: { id, ...updates } };
        },
      },
    }));

    globalProviderRegistry.registerProvider('organize', 'flat-by-date', async () => ({
      ok: true as const,
      value: {
        ...createMockProvider('flat-by-date', 'organize'),
        async organize() {
          return { ok: true as const, value: 'path' };
        },
      },
    }));

    const config: MemoryConfig = {
      enabled: true,
      hooks: { sessionEnd: true, userPromptSubmit: true, sessionStart: false },
      providers: {
        segment: 'per-message',
        extract: ['extractor-1', 'extractor-2'], // Sequential order
        summarize: 'simple-extract',
        storage: 'file-backend',
        search: 'keyword-search',
        organize: 'flat-by-date',
      },
      retention: {
        shortTermMaxSessions: 50,
        shortTermMaxAgeDays: 30,
        autoConsolidate: false,
      },
      performance: {
        maxRetrievalMs: 1000,
        maxInjectionTokens: 2000,
        maxResultCount: 10,
      },
    };

    const result = await loadPipelineProviders(config);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.extractProviders.length).toBe(2);
      expect(result.value.extractProviders[0].name).toBe('extractor-1');
      expect(result.value.extractProviders[1].name).toBe('extractor-2');
    }
  });

  test('should skip missing extract provider and continue', async () => {
    globalProviderRegistry.registerProvider(
      'extract',
      'extractor-1',
      async () => ({
        ok: true as const,
        value: {
          ...createMockProvider('extractor-1', 'extract'),
          async extract(segment: any) {
            return { ok: true as const, value: segment };
          },
        },
      })
    );

    globalProviderRegistry.registerProvider(
      'extract',
      'extractor-3',
      async () => ({
        ok: true as const,
        value: {
          ...createMockProvider('extractor-3', 'extract'),
          async extract(segment: any) {
            return { ok: true as const, value: segment };
          },
        },
      })
    );

    // Register other required providers
    globalProviderRegistry.registerProvider('segment', 'per-message', async () => ({
      ok: true as const,
      value: {
        ...createMockProvider('per-message', 'segment'),
        async segment() {
          return { ok: true as const, value: [] };
        },
      },
    }));

    globalProviderRegistry.registerProvider(
      'summarize',
      'simple-extract',
      async () => ({
        ok: true as const,
        value: {
          ...createMockProvider('simple-extract', 'summarize'),
          async summarize(segment: any) {
            return { ok: true as const, value: segment };
          },
        },
      })
    );

    globalProviderRegistry.registerProvider('storage', 'file-backend', async () => ({
      ok: true as const,
      value: {
        ...createMockProvider('file-backend', 'storage'),
        async store() {
          return { ok: true as const, value: { id: 'seg_1704567890123_abcd1234' } };
        },
        async retrieve() {
          return { ok: true as const, value: null };
        },
        async query() {
          return { ok: true as const, value: { results: [] } };
        },
        async delete() {
          return { ok: true as const, value: true };
        },
        async update(id: string, updates: any) {
          return { ok: true as const, value: { id, ...updates } };
        },
      },
    }));

    globalProviderRegistry.registerProvider('organize', 'flat-by-date', async () => ({
      ok: true as const,
      value: {
        ...createMockProvider('flat-by-date', 'organize'),
        async organize() {
          return { ok: true as const, value: 'path' };
        },
      },
    }));

    const config: MemoryConfig = {
      enabled: true,
      hooks: { sessionEnd: true, userPromptSubmit: true, sessionStart: false },
      providers: {
        segment: 'per-message',
        extract: ['extractor-1', 'nonexistent', 'extractor-3'], // Middle one doesn't exist
        summarize: 'simple-extract',
        storage: 'file-backend',
        search: 'keyword-search',
        organize: 'flat-by-date',
      },
      retention: {
        shortTermMaxSessions: 50,
        shortTermMaxAgeDays: 30,
        autoConsolidate: false,
      },
      performance: {
        maxRetrievalMs: 1000,
        maxInjectionTokens: 2000,
        maxResultCount: 10,
      },
    };

    const result = await loadPipelineProviders(config);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should have loaded extractor-1 and extractor-3, skipped nonexistent
      expect(result.value.extractProviders.length).toBe(2);
      expect(result.value.extractProviders[0].name).toBe('extractor-1');
      expect(result.value.extractProviders[1].name).toBe('extractor-3');
    }
  });
});
