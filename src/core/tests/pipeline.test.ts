import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { promises as fs } from 'fs';
import { processPipeline, type PipelineConfig, type QueueItem } from '../pipeline';
import { PerMessageSegmentProvider } from '../../providers/segment/per-message';
import { FrontmatterGenProvider } from '../../providers/extract/frontmatter-gen';
import { KeywordTaggerProvider } from '../../providers/extract/keyword-tagger';
import { SimpleExtractProvider } from '../../providers/summarize/simple-extract';
import { FlatByDateOrganizeProvider } from '../../providers/organize/flat-by-date';
import { FileBackend } from '../../providers/storage/file-backend';

const TEST_MEMSTORE_DIR = join(homedir(), '.memstore-test-pipeline');

describe('core/pipeline.ts', () => {
  let pipelineConfig: PipelineConfig;

  beforeEach(async () => {
    // Clean slate
    if (existsSync(TEST_MEMSTORE_DIR)) {
      rmSync(TEST_MEMSTORE_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_MEMSTORE_DIR, { recursive: true });

    // Set MEMSTORE_DIR for tests
    process.env.MEMSTORE_DIR = TEST_MEMSTORE_DIR;

    // Create required directories
    await fs.mkdir(join(TEST_MEMSTORE_DIR, 'mem-store', 'segments'), { recursive: true });
    await fs.mkdir(join(TEST_MEMSTORE_DIR, 'mem-store', 'structured'), { recursive: true });

    // Initialize pipeline config
    pipelineConfig = {
      segmentProvider: new PerMessageSegmentProvider(),
      extractProviders: [
        new FrontmatterGenProvider(),
        new KeywordTaggerProvider()
      ],
      summarizeProvider: new SimpleExtractProvider(),
      organizeProvider: new FlatByDateOrganizeProvider(),
      storageProvider: new FileBackend()
    };

    // Initialize all providers
    await Promise.all([
      pipelineConfig.segmentProvider.initialize(),
      ...pipelineConfig.extractProviders.map(p => p.initialize()),
      pipelineConfig.summarizeProvider.initialize(),
      pipelineConfig.organizeProvider.initialize(),
      pipelineConfig.storageProvider.initialize()
    ]);
  });

  afterAll(() => {
    if (existsSync(TEST_MEMSTORE_DIR)) {
      rmSync(TEST_MEMSTORE_DIR, { recursive: true, force: true });
    }
  });

  test('should process queue item through full pipeline', async () => {
    const queueItem: QueueItem = {
      sessionId: 'mem_test_session',
      transcript: 'User: How do I fix TypeScript errors?\nAssistant: You can check the tsconfig.json file.',
      capturedAt: Date.now(),
      metadata: {}
    };

    const result = await processPipeline(queueItem, pipelineConfig);

    expect(result.ok).toBe(true);

    // Verify session registry was updated
    const registryPath = join(TEST_MEMSTORE_DIR, 'mem-store', 'structured', 'session-registry.json');
    expect(existsSync(registryPath)).toBe(true);

    const registry = JSON.parse(await fs.readFile(registryPath, 'utf-8'));
    expect(registry[queueItem.sessionId]).toBeDefined();
    expect(registry[queueItem.sessionId].segmentCount).toBeGreaterThan(0);
  });

  test('should handle empty transcript gracefully', async () => {
    const queueItem: QueueItem = {
      sessionId: 'mem_test_empty',
      transcript: '',
      capturedAt: Date.now(),
      metadata: {}
    };

    const result = await processPipeline(queueItem, pipelineConfig);

    expect(result.ok).toBe(true); // Not an error, just no segments
  });

  test('should update session registry with aggregated tags', async () => {
    const queueItem: QueueItem = {
      sessionId: 'mem_test_tags',
      transcript: 'User: What is TypeScript?\nAssistant: TypeScript is a strongly typed programming language built on JavaScript.',
      capturedAt: Date.now(),
      metadata: {}
    };

    const result = await processPipeline(queueItem, pipelineConfig);

    expect(result.ok).toBe(true);

    const registryPath = join(TEST_MEMSTORE_DIR, 'mem-store', 'structured', 'session-registry.json');
    const registry = JSON.parse(await fs.readFile(registryPath, 'utf-8'));

    expect(registry[queueItem.sessionId].tags).toBeDefined();
    expect(Array.isArray(registry[queueItem.sessionId].tags)).toBe(true);
  });

  test('should handle pipeline stage errors gracefully', async () => {
    // Test with invalid pipeline config (missing provider)
    const badConfig: any = {
      ...pipelineConfig,
      segmentProvider: null // Invalid provider
    };

    const queueItem: QueueItem = {
      sessionId: 'mem_test_error',
      transcript: 'User: Test\nAssistant: Test',
      capturedAt: Date.now(),
      metadata: {}
    };

    const result = await processPipeline(queueItem, badConfig);

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('PIPELINE_UNEXPECTED_ERROR');
  });

  test('should process multiple exchanges correctly', async () => {
    const queueItem: QueueItem = {
      sessionId: 'mem_test_multi',
      transcript: 'User: First question\nAssistant: First answer with details\nUser: Second question\nAssistant: Second answer with more information',
      capturedAt: Date.now(),
      metadata: {}
    };

    const result = await processPipeline(queueItem, pipelineConfig);

    expect(result.ok).toBe(true);

    const registryPath = join(TEST_MEMSTORE_DIR, 'mem-store', 'structured', 'session-registry.json');
    const registry = JSON.parse(await fs.readFile(registryPath, 'utf-8'));

    // Should have multiple segments
    expect(registry[queueItem.sessionId].segmentCount).toBeGreaterThan(1);
  });
});
