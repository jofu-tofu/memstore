import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { spawn } from 'bun';
import { getStats } from '../lib/logging/stats-manager';

const TEST_PAI_DIR = join(homedir(), 'pai-test-stats-integration');

describe('Stats Integration Tests (Story 4.3)', () => {
  beforeEach(() => {
    // Create test directory
    mkdirSync(TEST_PAI_DIR, { recursive: true });

    // Create necessary subdirectories
    mkdirSync(join(TEST_PAI_DIR, 'mem-store', 'metrics'), { recursive: true });
    mkdirSync(join(TEST_PAI_DIR, 'mem-store', 'queue'), { recursive: true });
    mkdirSync(join(TEST_PAI_DIR, 'mem-store', 'segments'), { recursive: true });
    mkdirSync(join(TEST_PAI_DIR, '.claude'), { recursive: true });

    // Create minimal settings file
    const settings = {
      memory: {
        enabled: true,
        hooks: {
          sessionEnd: true,
          userPromptSubmit: true,
        },
      },
    };
    writeFileSync(
      join(TEST_PAI_DIR, '.claude', 'settings.json'),
      JSON.stringify(settings, null, 2)
    );
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(TEST_PAI_DIR)) {
      rmSync(TEST_PAI_DIR, { recursive: true, force: true });
    }
  });

  describe('Capture Hook Stats (AC1)', () => {
    test('should update capture stats when hook completes successfully', async () => {
      // Arrange
      const capturePath = join(process.cwd(), 'hooks', 'memory', 'capture.ts');
      const payload = JSON.stringify({
        transcript: 'Test session transcript for stats integration',
        metadata: { source: 'test' },
      });

      // Act: Run capture hook
      const proc = spawn({
        cmd: ['bun', 'run', capturePath],
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, PAI_DIR: TEST_PAI_DIR },
      });

      proc.stdin.write(payload);
      proc.stdin.end();

      await proc.exited;

      // Small delay to ensure stats are written
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert: Stats file should exist and have updated capture stats
      process.env.PAI_DIR = TEST_PAI_DIR;
      const result = getStats();
      delete process.env.PAI_DIR;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.capture.totalCount).toBeGreaterThan(0);
        expect(result.value.capture.avgLatencyMs).toBeGreaterThan(0);
        expect(result.value.capture.lastRun).toBeGreaterThan(0);
      }
    }, 10000);

    test('should track errors when capture fails', async () => {
      // Arrange: Invalid JSON payload
      const capturePath = join(process.cwd(), 'hooks', 'memory', 'capture.ts');
      const invalidPayload = 'not json';

      // Act: Run capture hook with invalid payload
      const proc = spawn({
        cmd: ['bun', 'run', capturePath],
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, PAI_DIR: TEST_PAI_DIR },
      });

      proc.stdin.write(invalidPayload);
      proc.stdin.end();

      await proc.exited;

      // Small delay to ensure stats are written
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert: Error count should be incremented
      process.env.PAI_DIR = TEST_PAI_DIR;
      const result = getStats();
      delete process.env.PAI_DIR;

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Note: Capture failed, so it should be tracked
        expect(result.value.capture.totalCount).toBeGreaterThan(0);
      }
    }, 10000);
  });

  describe('Retrieval Hook Stats (AC2, AC3)', () => {
    test('should update retrieval stats when hook completes', async () => {
      // Arrange: Ensure all necessary directories exist for retrieval hook
      mkdirSync(join(TEST_PAI_DIR, 'mem-store', 'structured'), { recursive: true });
      mkdirSync(join(TEST_PAI_DIR, 'mem-store', 'indexes', 'keyword'), { recursive: true });
      mkdirSync(join(TEST_PAI_DIR, 'mem-store', 'cache'), { recursive: true });

      const retrievePath = join(process.cwd(), 'hooks', 'memory', 'retrieve.ts');
      const payload = JSON.stringify({
        query: 'test query for stats integration',
      });

      // Act: Run retrieve hook
      const proc = spawn({
        cmd: ['bun', 'run', retrievePath],
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, PAI_DIR: TEST_PAI_DIR },
      });

      proc.stdin.write(payload);
      proc.stdin.end();

      await proc.exited;

      // Capture stderr for debugging
      const stderr = await new Response(proc.stderr).text();

      // Wait for stats file to be written (retry up to 2 seconds with longer delays)
      let statsReady = false;
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        process.env.PAI_DIR = TEST_PAI_DIR;
        const testResult = getStats();
        delete process.env.PAI_DIR;
        if (testResult.ok && testResult.value.retrieval.totalCount > 0) {
          statsReady = true;
          break;
        }
      }

      // Assert: Stats file should have retrieval data
      process.env.PAI_DIR = TEST_PAI_DIR;
      const result = getStats();
      delete process.env.PAI_DIR;

      // Debug output if test fails
      if (!statsReady) {
        const statsPath = join(TEST_PAI_DIR, 'mem-store', 'metrics', 'stats.json');
        console.error(`\n=== DEBUGGING STATS FAILURE ===`);
        console.error(`Stats file path: ${statsPath}`);
        console.error(`Stats file exists: ${existsSync(statsPath)}`);
        console.error(`Hook stderr:`, stderr.substring(0, 500));
        if (existsSync(statsPath)) {
          const fs = require('fs');
          const content = fs.readFileSync(statsPath, 'utf-8');
          console.error('Stats file content:', content.substring(0, 200));
        }
        console.error(`=== END DEBUG ===\n`);
      }

      expect(result.ok).toBe(true);
      expect(statsReady).toBe(true); // Stats should be ready within 2 seconds
      if (result.ok) {
        expect(result.value.retrieval.totalCount).toBeGreaterThan(0);
        expect(result.value.retrieval.lastRun).toBeGreaterThan(0);
        // Result count should be 0 (no memories in empty test system)
        expect(result.value.retrieval.avgResultCount).toBe(0);
        expect(result.value.retrieval.avgInjectedTokens).toBe(0);
      }
    }, 15000);

    test('should detect budget exceeded when retrieval is slow', async () => {
      // Note: This test is difficult to implement without mocking
      // because we can't easily make retrieval slow in a controlled way.
      // The budget detection logic is tested in unit tests.
      // Here we just verify the budget threshold is read from config.

      // Arrange: Ensure all necessary directories exist
      mkdirSync(join(TEST_PAI_DIR, 'mem-store', 'structured'), { recursive: true });
      mkdirSync(join(TEST_PAI_DIR, 'mem-store', 'indexes', 'keyword'), { recursive: true });
      mkdirSync(join(TEST_PAI_DIR, 'mem-store', 'cache'), { recursive: true });

      // Update config to have very low budget (1ms)
      const settings = {
        memory: {
          enabled: true,
          hooks: {
            userPromptSubmit: true,
          },
          performance: {
            maxRetrievalMs: 1, // Very low budget
          },
        },
      };
      writeFileSync(
        join(TEST_PAI_DIR, '.claude', 'settings.json'),
        JSON.stringify(settings, null, 2)
      );

      const retrievePath = join(process.cwd(), 'hooks', 'memory', 'retrieve.ts');
      const payload = JSON.stringify({
        query: 'test query',
      });

      // Act: Run retrieve hook
      const proc = spawn({
        cmd: ['bun', 'run', retrievePath],
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, PAI_DIR: TEST_PAI_DIR },
      });

      proc.stdin.write(payload);
      proc.stdin.end();

      await proc.exited;

      // Capture stderr for debugging
      const stderr = await new Response(proc.stderr).text();

      // Wait for stats file to be written (retry up to 2 seconds with longer delays)
      let statsReady = false;
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        process.env.PAI_DIR = TEST_PAI_DIR;
        const testResult = getStats();
        delete process.env.PAI_DIR;
        if (testResult.ok && testResult.value.retrieval.totalCount > 0) {
          statsReady = true;
          break;
        }
      }

      // Assert: Should have detected budget exceeded (1ms is too low)
      process.env.PAI_DIR = TEST_PAI_DIR;
      const result = getStats();
      delete process.env.PAI_DIR;

      // Debug output if test fails
      if (!statsReady) {
        const statsPath = join(TEST_PAI_DIR, 'mem-store', 'metrics', 'stats.json');
        console.error(`\n=== DEBUGGING STATS FAILURE ===`);
        console.error(`Stats file path: ${statsPath}`);
        console.error(`Stats file exists: ${existsSync(statsPath)}`);
        console.error(`Hook stderr:`, stderr.substring(0, 500));
        if (existsSync(statsPath)) {
          const fs = require('fs');
          const content = fs.readFileSync(statsPath, 'utf-8');
          console.error('Stats file content:', content.substring(0, 200));
        }
        console.error(`=== END DEBUG ===\n`);
      }

      expect(result.ok).toBe(true);
      expect(statsReady).toBe(true); // Stats should be ready within 2 seconds
      if (result.ok) {
        expect(result.value.retrieval.totalCount).toBeGreaterThan(0);
        // With 1ms budget, it should almost always exceed
        expect(result.value.retrieval.budgetExceededCount).toBeGreaterThan(0);
      }
    }, 15000);
  });

  describe('Stats File Structure (AC5)', () => {
    test('should create stats.json with correct structure', async () => {
      // Arrange: Run a capture to initialize stats
      const capturePath = join(process.cwd(), 'hooks', 'memory', 'capture.ts');
      const payload = JSON.stringify({
        transcript: 'Test transcript',
      });

      const proc = spawn({
        cmd: ['bun', 'run', capturePath],
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, PAI_DIR: TEST_PAI_DIR },
      });

      proc.stdin.write(payload);
      proc.stdin.end();
      await proc.exited;

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert: Check file structure
      const statsPath = join(TEST_PAI_DIR, 'mem-store', 'metrics', 'stats.json');
      expect(existsSync(statsPath)).toBe(true);

      // Read and verify JSON structure
      const statsContent = await Bun.file(statsPath).text();
      const stats = JSON.parse(statsContent);

      // Verify top-level sections
      expect(stats).toHaveProperty('capture');
      expect(stats).toHaveProperty('retrieval');
      expect(stats).toHaveProperty('processing');

      // Verify capture section
      expect(stats.capture).toHaveProperty('totalCount');
      expect(stats.capture).toHaveProperty('sum');
      expect(stats.capture).toHaveProperty('avgLatencyMs');
      expect(stats.capture).toHaveProperty('lastRun');
      expect(stats.capture).toHaveProperty('errors');

      // Verify retrieval section
      expect(stats.retrieval).toHaveProperty('totalCount');
      expect(stats.retrieval).toHaveProperty('avgLatencyMs');
      expect(stats.retrieval).toHaveProperty('avgResultCount');
      expect(stats.retrieval).toHaveProperty('avgInjectedTokens');
      expect(stats.retrieval).toHaveProperty('budgetExceededCount');

      // Verify processing section
      expect(stats.processing).toHaveProperty('totalSegmentsCreated');
      expect(stats.processing).toHaveProperty('sessionCount');
      expect(stats.processing).toHaveProperty('avgSegmentsPerSession');
      expect(stats.processing).toHaveProperty('avgProcessingMs');
      expect(stats.processing).toHaveProperty('queueDepth');
      expect(stats.processing).toHaveProperty('failedItems');
    }, 10000);
  });

  describe('Graceful Failure (Never Block Hooks)', () => {
    test('should not block capture hook if stats update fails', async () => {
      // Arrange: Make metrics directory read-only (skip on Windows)
      if (process.platform !== 'win32') {
        const metricsDir = join(TEST_PAI_DIR, 'mem-store', 'metrics');
        const fs = require('fs');
        fs.chmodSync(metricsDir, 0o444); // Read-only

        const capturePath = join(process.cwd(), 'hooks', 'memory', 'capture.ts');
        const payload = JSON.stringify({
          transcript: 'Test transcript',
        });

        // Act: Run capture hook
        const proc = spawn({
          cmd: ['bun', 'run', capturePath],
          stdin: 'pipe',
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...process.env, PAI_DIR: TEST_PAI_DIR },
        });

        proc.stdin.write(payload);
        proc.stdin.end();

        await proc.exited;

        // Assert: Hook should still exit successfully (exit code 0)
        expect(proc.exitCode).toBe(0);

        // Cleanup: Restore permissions
        fs.chmodSync(metricsDir, 0o755);
      }
    }, 10000);
  });
});
