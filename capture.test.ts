import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, rmSync, readdirSync } from 'fs';
import { promises as fs } from 'fs';
import { spawn } from 'bun';

// Use process.pid for test isolation
const TEST_PAI_DIR = join(homedir(), `pai-test-capture-${process.pid}`);
const HOOK_PATH = join(process.cwd(), 'hooks', 'memory', 'capture.ts');

/**
 * Helper: Create default settings.json for tests (Stories 3.2/3.3)
 */
async function createDefaultSettings() {
  const settingsDir = join(TEST_PAI_DIR, '.claude');
  mkdirSync(settingsDir, { recursive: true });

  const settings = {
    memory: {
      enabled: true,
      hooks: {
        sessionEnd: true,
        userPromptSubmit: true,
        sessionStart: false,
      },
    },
  };

  await fs.writeFile(
    join(settingsDir, 'settings.json'),
    JSON.stringify(settings, null, 2),
    'utf-8'
  );
}

describe('capture.ts hook', () => {
  beforeAll(async () => {
    mkdirSync(TEST_PAI_DIR, { recursive: true });
    // Create default settings for Stories 3.2/3.3 config checks
    await createDefaultSettings();
  });

  afterAll(() => {
    if (existsSync(TEST_PAI_DIR)) {
      rmSync(TEST_PAI_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    // Clean up entire mem-store directory before each test for isolation
    const memStoreDir = join(TEST_PAI_DIR, 'mem-store');
    if (existsSync(memStoreDir)) {
      rmSync(memStoreDir, { recursive: true, force: true });
    }

    // Pre-create required directories for Story 3.6 ensureMemStoreDirectories() check
    const dirs = [
      join(TEST_PAI_DIR, 'mem-store'),
      join(TEST_PAI_DIR, 'mem-store', 'segments'),
      join(TEST_PAI_DIR, 'mem-store', 'structured'),
      join(TEST_PAI_DIR, 'mem-store', 'indexes', 'keyword'),
      join(TEST_PAI_DIR, 'mem-store', 'queue'),
      join(TEST_PAI_DIR, 'mem-store', 'metrics'),
      join(TEST_PAI_DIR, 'mem-store', 'cache')
    ];
    for (const dir of dirs) {
      mkdirSync(dir, { recursive: true });
    }

    // Ensure settings file exists for each test
    await createDefaultSettings();
  });

  test('should read stdin and create queue file', async () => {
    const payload = JSON.stringify({
      transcript: 'User: test\nAssistant: response',
      metadata: { duration: 123 }
    });

    const proc = spawn({
      cmd: ['bun', 'run', HOOK_PATH],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: TEST_PAI_DIR }
    });

    // Write payload to stdin
    proc.stdin.write(payload);
    proc.stdin.end();

    // Wait for completion
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);

    // Verify queue file created
    const queueDir = join(TEST_PAI_DIR, 'mem-store', 'queue');
    expect(existsSync(queueDir)).toBe(true);

    // Find queue file
    const files = readdirSync(queueDir);
    const queueFiles = files.filter(f => f.endsWith('.json'));
    expect(queueFiles.length).toBe(1);

    // Verify queue file content
    const queueContent = await fs.readFile(
      join(queueDir, queueFiles[0]),
      'utf-8'
    );
    const queueData = JSON.parse(queueContent);

    expect(queueData.sessionId).toMatch(/^mem_\d+_[a-f0-9]{8}$/);
    expect(queueData.transcript).toContain('User: test');
    expect(queueData.capturedAt).toBeGreaterThan(0);
    expect(queueData.metadata).toBeDefined();
    expect(queueData.metadata.source).toBe('SessionEnd');
  });

  test('should exit gracefully on empty input', async () => {
    const proc = spawn({
      cmd: ['bun', 'run', HOOK_PATH],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: TEST_PAI_DIR }
    });

    // Send empty input
    proc.stdin.end();

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    // Verify no queue file created
    const queueDir = join(TEST_PAI_DIR, 'mem-store', 'queue');
    if (existsSync(queueDir)) {
      const files = readdirSync(queueDir);
      const queueFiles = files.filter(f => f.endsWith('.json'));
      expect(queueFiles.length).toBe(0);
    }
  });

  test('should exit gracefully on invalid JSON', async () => {
    const proc = spawn({
      cmd: ['bun', 'run', HOOK_PATH],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: TEST_PAI_DIR }
    });

    // Send invalid JSON
    proc.stdin.write('not valid json{{{');
    proc.stdin.end();

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0); // CRITICAL: Must still exit 0

    // Check stderr contains error message
    const stderr = await proc.stderr.text();
    expect(stderr).toContain('[Memory:Capture]');
  });

  test('should not spawn processor if lock exists', async () => {
    // Create a lock file
    const queueDir = join(TEST_PAI_DIR, 'mem-store', 'queue');
    mkdirSync(queueDir, { recursive: true });

    const lockPath = join(queueDir, '.processor.lock');
    await fs.writeFile(lockPath, JSON.stringify({
      pid: process.pid,
      started: Date.now(),
      hostname: 'test-host'
    }), 'utf-8');

    const payload = JSON.stringify({
      transcript: 'User: test with lock'
    });

    const proc = spawn({
      cmd: ['bun', 'run', HOOK_PATH],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: TEST_PAI_DIR }
    });

    proc.stdin.write(payload);
    proc.stdin.end();

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    // Verify stderr contains "Processor already running"
    const stderr = await proc.stderr.text();
    expect(stderr).toContain('Processor already running');
  });

  test('should spawn processor when no lock exists', async () => {
    const payload = JSON.stringify({
      transcript: 'User: test without lock'
    });

    const proc = spawn({
      cmd: ['bun', 'run', HOOK_PATH],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: TEST_PAI_DIR }
    });

    proc.stdin.write(payload);
    proc.stdin.end();

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    // Verify stderr contains spawn message
    const stderr = await proc.stderr.text();
    expect(stderr).toContain('Spawned background processor');

    // Wait briefly for spawned process to potentially create lock (if processor exists)
    // Note: This is best-effort validation - processor may not exist yet (Story 1.5)
    // But at minimum we verify spawn didn't throw an error
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  test('should complete in less than 1 second', async () => {
    const startTime = Date.now();

    const payload = JSON.stringify({
      transcript: 'Performance test'
    });

    const proc = spawn({
      cmd: ['bun', 'run', HOOK_PATH],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: TEST_PAI_DIR }
    });

    proc.stdin.write(payload);
    proc.stdin.end();

    await proc.exited;

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(1000);
  });

  test('should handle whitespace-only input gracefully', async () => {
    const proc = spawn({
      cmd: ['bun', 'run', HOOK_PATH],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: TEST_PAI_DIR }
    });

    // Send whitespace-only input
    proc.stdin.write('   \n\t  ');
    proc.stdin.end();

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });

  test('should use PAI_DIR environment variable', async () => {
    const customPaiDir = join(TEST_PAI_DIR, 'custom-pai');

    // Create settings.json in custom PAI dir
    const customSettingsDir = join(customPaiDir, '.claude');
    mkdirSync(customSettingsDir, { recursive: true });
    await fs.writeFile(
      join(customSettingsDir, 'settings.json'),
      JSON.stringify({
        memory: {
          enabled: true,
          hooks: { sessionEnd: true, userPromptSubmit: true, sessionStart: false },
        },
      }, null, 2),
      'utf-8'
    );

    const payload = JSON.stringify({
      transcript: 'Testing PAI_DIR variable'
    });

    const proc = spawn({
      cmd: ['bun', 'run', HOOK_PATH],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: customPaiDir }
    });

    proc.stdin.write(payload);
    proc.stdin.end();

    await proc.exited;

    // Verify queue file created in custom location
    const queueDir = join(customPaiDir, 'mem-store', 'queue');
    expect(existsSync(queueDir)).toBe(true);

    const files = readdirSync(queueDir);
    const queueFiles = files.filter(f => f.endsWith('.json'));
    expect(queueFiles.length).toBe(1);

    // Cleanup custom dir
    rmSync(customPaiDir, { recursive: true, force: true });
  });

  test('should generate unique filenames for multiple sessions', async () => {
    const payload = JSON.stringify({
      transcript: 'Multiple session test'
    });

    // Spawn multiple hooks simultaneously
    const procs = await Promise.all([
      spawn({
        cmd: ['bun', 'run', HOOK_PATH],
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, PAI_DIR: TEST_PAI_DIR }
      }),
      spawn({
        cmd: ['bun', 'run', HOOK_PATH],
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, PAI_DIR: TEST_PAI_DIR }
      }),
      spawn({
        cmd: ['bun', 'run', HOOK_PATH],
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, PAI_DIR: TEST_PAI_DIR }
      })
    ]);

    // Write to all processes
    for (const proc of procs) {
      proc.stdin.write(payload);
      proc.stdin.end();
    }

    // Wait for all to complete
    await Promise.all(procs.map(p => p.exited));

    // Verify unique queue files created
    const queueDir = join(TEST_PAI_DIR, 'mem-store', 'queue');
    const files = readdirSync(queueDir);
    const queueFiles = files.filter(f => f.endsWith('.json'));

    expect(queueFiles.length).toBe(3);

    // Verify all filenames are unique
    const uniqueNames = new Set(queueFiles);
    expect(uniqueNames.size).toBe(3);
  });

  test('should handle stale lock (>60s old) by spawning processor', async () => {
    // Create a stale lock file
    const queueDir = join(TEST_PAI_DIR, 'mem-store', 'queue');
    mkdirSync(queueDir, { recursive: true });

    const lockPath = join(queueDir, '.processor.lock');
    await fs.writeFile(lockPath, JSON.stringify({
      pid: 99999,
      started: Date.now() - 70000, // 70 seconds ago (stale)
      hostname: 'test-host'
    }), 'utf-8');

    const payload = JSON.stringify({
      transcript: 'User: test with stale lock'
    });

    const proc = spawn({
      cmd: ['bun', 'run', HOOK_PATH],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: TEST_PAI_DIR }
    });

    proc.stdin.write(payload);
    proc.stdin.end();

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    // Should spawn processor for stale lock
    const stderr = await proc.stderr.text();
    expect(stderr).toContain('Spawned background processor');
  });
});
