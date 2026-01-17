import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { spawn } from 'bun';

describe('QueryMemories CLI', () => {
  let testMemstoreDir: string;
  const cliPath = join(__dirname, '..', 'query-memories.ts');

  beforeEach(() => {
    // Create isolated test directory
    testMemstoreDir = join(homedir(), '.memstore-test-cli');
    mkdirSync(testMemstoreDir, { recursive: true });

    // Create test data structure
    const memStoreDir = join(testMemstoreDir, 'mem-store');
    const structuredDir = join(memStoreDir, 'structured');
    const indexesDir = join(memStoreDir, 'indexes', 'keyword');
    const segmentsDir2026 = join(memStoreDir, 'segments', '2026-01');

    mkdirSync(structuredDir, { recursive: true });
    mkdirSync(indexesDir, { recursive: true });
    mkdirSync(segmentsDir2026, { recursive: true });

    // Create test registry
    const registry = {
      version: '1.0',
      sessions: [
        {
          sessionId: 'mem_1704912345000_a1b2c3d4',
          capturedAt: Date.parse('2026-01-15'),
          segmentCount: 2,
          tags: ['typescript', 'hooks'],
          archived: false
        },
        {
          sessionId: 'mem_1705012345000_e5f6g7h8',
          capturedAt: Date.parse('2026-02-10'),
          segmentCount: 1,
          tags: ['auth'],
          archived: false
        }
      ]
    };
    writeFileSync(join(structuredDir, 'session-registry.json'), JSON.stringify(registry, null, 2));

    // Create test keyword index
    const keywordIndex = {
      typescript: ['seg_001', 'seg_002'],
      auth: ['seg_003']
    };
    writeFileSync(join(indexesDir, 'index.json'), JSON.stringify(keywordIndex, null, 2));

    // Create test segment
    const segment = `---
id: seg_1768867200000_a1b2c3d4
session_id: mem_1704912345000_a1b2c3d4
timestamp: 1768867200000
importance_score: 75
access_count: 5
last_accessed: 1768953600000
tags:
  - typescript
  - hooks
memory_type: episodic
source_range:
  start: 0
  end: 1200
---
Test segment content about TypeScript hooks.`;
    writeFileSync(join(segmentsDir2026, 'seg_1768867200000_a1b2c3d4.md'), segment);
  });

  afterEach(() => {
    // ALWAYS clean up
    if (existsSync(testMemstoreDir)) {
      rmSync(testMemstoreDir, { recursive: true, force: true });
    }
  });

  describe('help command', () => {
    test('should display help message when no arguments provided', async () => {
      // Act
      const proc = spawn({
        cmd: ['bun', 'run', cliPath],
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, MEMSTORE_DIR: testMemstoreDir }
      });

      const stdout = await proc.stdout.text();
      const exitCode = await proc.exited;

      // Assert
      expect(exitCode).toBe(0);
      expect(stdout).toContain('query-memories - CLI tool');
      expect(stdout).toContain('USAGE:');
      expect(stdout).toContain('COMMANDS:');
    });

    test('should display help when help command specified', async () => {
      // Act
      const proc = spawn({
        cmd: ['bun', 'run', cliPath, 'help'],
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, MEMSTORE_DIR: testMemstoreDir }
      });

      const stdout = await proc.stdout.text();
      const exitCode = await proc.exited;

      // Assert
      expect(exitCode).toBe(0);
      expect(stdout).toContain('query-memories - CLI tool');
    });
  });

  describe('sessions command', () => {
    test('should query sessions by date', async () => {
      // Act
      const proc = spawn({
        cmd: ['bun', 'run', cliPath, 'sessions', '--date', '2026-01'],
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, MEMSTORE_DIR: testMemstoreDir }
      });

      const stdout = await proc.stdout.text();
      const exitCode = await proc.exited;

      // Assert
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Found 1 sessions');
      expect(stdout).toContain('mem_1704912345000_a1b2c3d4');
    });

    test('should query sessions by tag', async () => {
      // Act
      const proc = spawn({
        cmd: ['bun', 'run', cliPath, 'sessions', '--tag', 'typescript'],
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, MEMSTORE_DIR: testMemstoreDir }
      });

      const stdout = await proc.stdout.text();
      const exitCode = await proc.exited;

      // Assert
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Found 1 sessions');
      expect(stdout).toContain('typescript');
    });

    test('should output JSON when --format json specified', async () => {
      // Act
      const proc = spawn({
        cmd: ['bun', 'run', cliPath, 'sessions', '--tag', 'typescript', '--format', 'json'],
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, MEMSTORE_DIR: testMemstoreDir }
      });

      const stdout = await proc.stdout.text();
      const exitCode = await proc.exited;

      // Assert
      expect(exitCode).toBe(0);
      const results = JSON.parse(stdout);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('sessionId');
      expect(results[0]).toHaveProperty('tags');
    });

    test('should support pagination with --limit and --offset', async () => {
      // Act
      const proc = spawn({
        cmd: ['bun', 'run', cliPath, 'sessions', '--tag', 'typescript', '--limit', '1', '--offset', '0', '--format', 'json'],
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, MEMSTORE_DIR: testMemstoreDir }
      });

      const stdout = await proc.stdout.text();
      const exitCode = await proc.exited;

      // Assert
      expect(exitCode).toBe(0);
      const results = JSON.parse(stdout);
      expect(results.length).toBeLessThanOrEqual(1);
    });

    test('should error when no date or tag specified', async () => {
      // Act
      const proc = spawn({
        cmd: ['bun', 'run', cliPath, 'sessions'],
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, MEMSTORE_DIR: testMemstoreDir }
      });

      const stderr = await proc.stderr.text();
      const exitCode = await proc.exited;

      // Assert
      expect(exitCode).toBe(1);
      expect(stderr).toContain('Must specify --date or --tag');
    });
  });

  describe('segments command', () => {
    test('should find segments by keyword', async () => {
      // Act
      const proc = spawn({
        cmd: ['bun', 'run', cliPath, 'segments', '--keyword', 'typescript'],
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, MEMSTORE_DIR: testMemstoreDir }
      });

      const stdout = await proc.stdout.text();
      const exitCode = await proc.exited;

      // Assert
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Found');
      expect(stdout).toContain('segments');
    });

    test('should find segments by multiple keywords with scoring', async () => {
      // Act
      const proc = spawn({
        cmd: ['bun', 'run', cliPath, 'segments', '--keywords', 'typescript,auth'],
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, MEMSTORE_DIR: testMemstoreDir }
      });

      const stdout = await proc.stdout.text();
      const exitCode = await proc.exited;

      // Assert
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Found');
      expect(stdout).toContain('Score');
      expect(stdout).toContain('Matched Keywords');
    });

    test('should output JSON for segments query', async () => {
      // Act
      const proc = spawn({
        cmd: ['bun', 'run', cliPath, 'segments', '--keyword', 'typescript', '--format', 'json'],
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, MEMSTORE_DIR: testMemstoreDir }
      });

      const stdout = await proc.stdout.text();
      const exitCode = await proc.exited;

      // Assert
      expect(exitCode).toBe(0);
      const results = JSON.parse(stdout);
      expect(Array.isArray(results)).toBe(true);
    });

    test('should error when no keyword specified', async () => {
      // Act
      const proc = spawn({
        cmd: ['bun', 'run', cliPath, 'segments'],
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, MEMSTORE_DIR: testMemstoreDir }
      });

      const stderr = await proc.stderr.text();
      const exitCode = await proc.exited;

      // Assert
      expect(exitCode).toBe(1);
      expect(stderr).toContain('Must specify --keyword or --keywords');
    });
  });

  describe('read command', () => {
    test('should read segment by ID', async () => {
      // Act
      const proc = spawn({
        cmd: ['bun', 'run', cliPath, 'read', '--segment', 'seg_1768867200000_a1b2c3d4'],
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, MEMSTORE_DIR: testMemstoreDir }
      });

      const stdout = await proc.stdout.text();
      const exitCode = await proc.exited;

      // Assert
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Segment: seg_1768867200000_a1b2c3d4');
      expect(stdout).toContain('Test segment content');
    });

    test('should read segment as JSON', async () => {
      // Act
      const proc = spawn({
        cmd: ['bun', 'run', cliPath, 'read', '--segment', 'seg_1768867200000_a1b2c3d4', '--format', 'json'],
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, MEMSTORE_DIR: testMemstoreDir }
      });

      const stdout = await proc.stdout.text();
      const exitCode = await proc.exited;

      // Assert
      expect(exitCode).toBe(0);
      const segment = JSON.parse(stdout);
      expect(segment).toHaveProperty('id');
      expect(segment).toHaveProperty('content');
      expect(segment.id).toBe('seg_1768867200000_a1b2c3d4');
    });

    test('should read all segments from session', async () => {
      // Act
      const proc = spawn({
        cmd: ['bun', 'run', cliPath, 'read', '--session', 'mem_1704912345000_a1b2c3d4'],
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, MEMSTORE_DIR: testMemstoreDir }
      });

      const stdout = await proc.stdout.text();
      const exitCode = await proc.exited;

      // Assert
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Found');
      expect(stdout).toContain('segments for session');
    });

    test('should error when segment not found', async () => {
      // Act
      const proc = spawn({
        cmd: ['bun', 'run', cliPath, 'read', '--segment', 'seg_9999999999999_99999999'],
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, MEMSTORE_DIR: testMemstoreDir }
      });

      const stderr = await proc.stderr.text();
      const exitCode = await proc.exited;

      // Assert
      expect(exitCode).toBe(1);
      expect(stderr).toContain('Error:');
    });

    test('should error when no segment or session specified', async () => {
      // Act
      const proc = spawn({
        cmd: ['bun', 'run', cliPath, 'read'],
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, MEMSTORE_DIR: testMemstoreDir }
      });

      const stderr = await proc.stderr.text();
      const exitCode = await proc.exited;

      // Assert
      expect(exitCode).toBe(1);
      expect(stderr).toContain('Must specify --segment or --session');
    });
  });
});
