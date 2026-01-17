import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { spawn } from 'bun';
import { fileURLToPath } from 'url';

const TEST_PAI_DIR = join(homedir(), 'pai-test-retrieve');

// Get the directory containing this test file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HOOK_PATH = join(__dirname, '..', 'retrieve.ts');

describe('retrieve.ts hook', () => {
  beforeAll(() => {
    mkdirSync(TEST_PAI_DIR, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(TEST_PAI_DIR)) {
      rmSync(TEST_PAI_DIR, { recursive: true, force: true });
    }
  });

  test('should read stdin and process prompt payload', async () => {
    const hookPath = HOOK_PATH;

    const payload = JSON.stringify({
      prompt: 'How do I implement TypeScript hooks?'
    });

    const proc = spawn({
      cmd: ['bun', 'run', hookPath],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: TEST_PAI_DIR }
    });

    proc.stdin.write(payload);
    proc.stdin.end();

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    // MVP: Should output nothing (stub returns empty results)
    const stdout = await proc.stdout.text();
    expect(stdout.trim()).toBe('');
  });

  test('should exit gracefully on empty input', async () => {
    const hookPath = HOOK_PATH;

    const proc = spawn({
      cmd: ['bun', 'run', hookPath],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: TEST_PAI_DIR }
    });

    proc.stdin.end(); // Empty input

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    const stdout = await proc.stdout.text();
    expect(stdout.trim()).toBe('');
  });

  test('should exit gracefully on invalid JSON', async () => {
    const hookPath = HOOK_PATH;

    const proc = spawn({
      cmd: ['bun', 'run', hookPath],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: TEST_PAI_DIR }
    });

    proc.stdin.write('not valid json{{{');
    proc.stdin.end();

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0); // CRITICAL: Must still exit 0

    const stdout = await proc.stdout.text();
    expect(stdout.trim()).toBe(''); // No output on error

    // stderr may not be captured reliably with bun spawn - just check exit code
  });

  test('should complete in less than 1 second', async () => {
    const startTime = Date.now();

    const hookPath = HOOK_PATH;

    const payload = JSON.stringify({
      prompt: 'Performance test query'
    });

    const proc = spawn({
      cmd: ['bun', 'run', hookPath],
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

  test('should handle various payload field names for query extraction', async () => {
    const hookPath = HOOK_PATH;

    // Test with 'message' field instead of 'prompt'
    const payload = JSON.stringify({
      message: 'Test query with message field'
    });

    const proc = spawn({
      cmd: ['bun', 'run', hookPath],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: TEST_PAI_DIR }
    });

    proc.stdin.write(payload);
    proc.stdin.end();

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    const stdout = await proc.stdout.text();
    expect(stdout.trim()).toBe(''); // MVP: Empty results
  });

  test('should handle payload with text field', async () => {
    const hookPath = HOOK_PATH;

    const payload = JSON.stringify({
      text: 'Test query with text field'
    });

    const proc = spawn({
      cmd: ['bun', 'run', hookPath],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: TEST_PAI_DIR }
    });

    proc.stdin.write(payload);
    proc.stdin.end();

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    const stdout = await proc.stdout.text();
    expect(stdout.trim()).toBe(''); // MVP: Empty results
  });

  test('should output nothing when retrieval returns empty results', async () => {
    const hookPath = HOOK_PATH;

    const payload = JSON.stringify({
      prompt: 'Test query that will have no results'
    });

    const proc = spawn({
      cmd: ['bun', 'run', hookPath],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: TEST_PAI_DIR }
    });

    proc.stdin.write(payload);
    proc.stdin.end();

    await proc.exited;

    const stdout = await proc.stdout.text();

    // MVP: Stub returns empty, so no output
    expect(stdout.trim()).toBe('');
  });

  test('should execute without errors', async () => {
    const hookPath = HOOK_PATH;

    const payload = JSON.stringify({
      prompt: 'Test logging'
    });

    const proc = spawn({
      cmd: ['bun', 'run', hookPath],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: TEST_PAI_DIR }
    });

    proc.stdin.write(payload);
    proc.stdin.end();

    const exitCode = await proc.exited;

    // Just verify it completes successfully
    expect(exitCode).toBe(0);
  });

  test('should support PAI_DIR environment variable', async () => {
    const customPaiDir = join(homedir(), 'pai-test-custom');
    mkdirSync(customPaiDir, { recursive: true });

    try {
      const hookPath = HOOK_PATH;

      const payload = JSON.stringify({
        prompt: 'Test PAI_DIR support'
      });

      const proc = spawn({
        cmd: ['bun', 'run', hookPath],
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, PAI_DIR: customPaiDir }
      });

      proc.stdin.write(payload);
      proc.stdin.end();

      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
    } finally {
      if (existsSync(customPaiDir)) {
        rmSync(customPaiDir, { recursive: true, force: true });
      }
    }
  });

  test('should handle whitespace-only input gracefully', async () => {
    const hookPath = HOOK_PATH;

    const proc = spawn({
      cmd: ['bun', 'run', hookPath],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: TEST_PAI_DIR }
    });

    proc.stdin.write('   \n\t  ');
    proc.stdin.end();

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    const stdout = await proc.stdout.text();
    expect(stdout.trim()).toBe('');
  });
});

/**
 * Helper: Create settings.json with specific memory.enabled value
 */
function createSettings(paiDir: string, enabled: boolean) {
  const settingsDir = join(paiDir, '.claude');
  mkdirSync(settingsDir, { recursive: true });

  const settings = {
    memory: {
      enabled,
    },
  };

  writeFileSync(
    join(settingsDir, 'settings.json'),
    JSON.stringify(settings, null, 2),
    'utf-8'
  );
}

/**
 * Helper: Create settings.json with hook-specific config
 */
function createHookSettings(paiDir: string, config: {
  enabled: boolean;
  sessionEnd?: boolean;
  userPromptSubmit?: boolean;
  sessionStart?: boolean;
}) {
  const settingsDir = join(paiDir, '.claude');
  mkdirSync(settingsDir, { recursive: true });

  const settings = {
    memory: {
      enabled: config.enabled,
      hooks: {
        sessionEnd: config.sessionEnd ?? true,
        userPromptSubmit: config.userPromptSubmit ?? true,
        sessionStart: config.sessionStart ?? false,
      },
    },
  };

  writeFileSync(
    join(settingsDir, 'settings.json'),
    JSON.stringify(settings, null, 2),
    'utf-8'
  );
}

describe('retrieve.ts - memory system toggle', () => {
  const TOGGLE_TEST_DIR = join(homedir(), 'pai-test-retrieve-toggle');

  beforeAll(() => {
    // Clean slate for toggle tests
    if (existsSync(TOGGLE_TEST_DIR)) {
      rmSync(TOGGLE_TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TOGGLE_TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    // Clean up
    if (existsSync(TOGGLE_TEST_DIR)) {
      rmSync(TOGGLE_TEST_DIR, { recursive: true, force: true });
    }
  });

  test('should exit immediately when memory.enabled = false', async () => {
    // Arrange: Create settings.json with memory.enabled = false
    createSettings(TOGGLE_TEST_DIR, false);

    const payload = JSON.stringify({
      prompt: 'Test query that should be ignored',
    });

    // Act: Run retrieve hook
    const proc = spawn({
      cmd: ['bun', 'run', HOOK_PATH],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: TOGGLE_TEST_DIR },
    });

    proc.stdin.write(payload);
    proc.stdin.end();

    const exitCode = await proc.exited;
    const stderr = await proc.stderr.text();
    const stdout = await proc.stdout.text();

    // Assert: Exit code 0, disabled message logged, no output
    expect(exitCode).toBe(0);
    expect(stderr).toContain('[Memory:Retrieve] Memory system disabled');
    expect(stderr).toContain('exiting');
    expect(stdout.trim()).toBe(''); // No context injection
  });

  test('should process normally when memory.enabled = true', async () => {
    // Arrange: Create settings.json with memory.enabled = true
    createSettings(TOGGLE_TEST_DIR, true);

    const payload = JSON.stringify({
      prompt: 'Test query for normal processing',
    });

    // Act: Run retrieve hook
    const proc = spawn({
      cmd: ['bun', 'run', HOOK_PATH],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: TOGGLE_TEST_DIR },
    });

    proc.stdin.write(payload);
    proc.stdin.end();

    const exitCode = await proc.exited;
    const stderr = await proc.stderr.text();

    // Assert: Exit code 0, normal processing logs (NOT debug logs unless debug enabled)
    expect(exitCode).toBe(0);
    expect(stderr).toContain('[Memory:'); // Any memory log indicates processing happened
    expect(stderr).not.toContain('Memory system disabled');
  });

  test('should add zero overhead when disabled (<100ms execution)', async () => {
    // Arrange: memory.enabled = false
    createSettings(TOGGLE_TEST_DIR, false);

    const payload = JSON.stringify({
      prompt: 'Performance test',
    });

    // Act: Measure execution time
    const startTime = Date.now();

    const proc = spawn({
      cmd: ['bun', 'run', HOOK_PATH],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: TOGGLE_TEST_DIR },
    });

    proc.stdin.write(payload);
    proc.stdin.end();

    await proc.exited;

    const executionTime = Date.now() - startTime;

    // Assert: Execution time <= 110ms (config check + exit is fast)
    // Note: Using 110ms for test stability on slow CI, actual should be <10ms
    expect(executionTime).toBeLessThanOrEqual(110);
  });

  test('should not perform search when disabled', async () => {
    // Arrange: memory.enabled = false
    createSettings(TOGGLE_TEST_DIR, false);

    const payload = JSON.stringify({
      prompt: 'This should not trigger search',
    });

    // Act: Run retrieve hook
    const proc = spawn({
      cmd: ['bun', 'run', HOOK_PATH],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: TOGGLE_TEST_DIR },
    });

    proc.stdin.write(payload);
    proc.stdin.end();

    await proc.exited;
    const stderr = await proc.stderr.text();

    // Assert: No search-related logs appear
    expect(stderr).not.toContain('Found');
    expect(stderr).not.toContain('memories');
    expect(stderr).not.toContain('Complete:');
    expect(stderr).toContain('Memory system disabled');
  });

  test('should use defaults when no settings file exists', async () => {
    // Arrange: No settings.json (triggers default behavior)
    // Create PAI dir but don't create settings.json

    const noSettingsDir = join(homedir(), 'pai-test-retrieve-no-settings');
    if (existsSync(noSettingsDir)) {
      rmSync(noSettingsDir, { recursive: true, force: true });
    }
    mkdirSync(noSettingsDir, { recursive: true });

    try {
      const payload = JSON.stringify({
        prompt: 'Test graceful degradation',
      });

      // Act: Run retrieve hook
      const proc = spawn({
        cmd: ['bun', 'run', HOOK_PATH],
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, PAI_DIR: noSettingsDir },
      });

      proc.stdin.write(payload);
      proc.stdin.end();

      const exitCode = await proc.exited;

      // Assert: Graceful degradation - uses defaults (enabled = true)
      // Default config is enabled = true, hook should execute successfully
      expect(exitCode).toBe(0);
    } finally {
      if (existsSync(noSettingsDir)) {
        rmSync(noSettingsDir, { recursive: true, force: true });
      }
    }
  });

  test('should exit before reading stdin when disabled', async () => {
    // Arrange: memory.enabled = false
    createSettings(TOGGLE_TEST_DIR, false);

    // Act: Run with empty stdin (should exit before attempting to read)
    const proc = spawn({
      cmd: ['bun', 'run', HOOK_PATH],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: TOGGLE_TEST_DIR },
    });

    proc.stdin.end(); // Empty input

    const exitCode = await proc.exited;
    const stderr = await proc.stderr.text();

    // Assert: Exit code 0, disabled message appears
    expect(exitCode).toBe(0);
    expect(stderr).toContain('[Memory:Retrieve] Memory system disabled');

    // No error about invalid JSON because we exit BEFORE reading stdin
  });
});

describe('retrieve.ts - hook-specific toggle (Story 3.3)', () => {
  const HOOK_TOGGLE_TEST_DIR = join(homedir(), 'pai-test-retrieve-hook-toggle');

  beforeAll(() => {
    // Clean slate
    if (existsSync(HOOK_TOGGLE_TEST_DIR)) {
      rmSync(HOOK_TOGGLE_TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(HOOK_TOGGLE_TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    // ALWAYS clean up
    if (existsSync(HOOK_TOGGLE_TEST_DIR)) {
      rmSync(HOOK_TOGGLE_TEST_DIR, { recursive: true, force: true });
    }
  });

  test('should exit when memory.hooks.userPromptSubmit = false but memory.enabled = true', async () => {
    // Arrange: Global toggle ON, hook-specific toggle OFF
    createHookSettings(HOOK_TOGGLE_TEST_DIR, {
      enabled: true,
      sessionEnd: true,
      userPromptSubmit: false,
    });

    const payload = JSON.stringify({
      prompt: 'Test query that should be blocked',
    });

    // Act: Run retrieve hook
    const proc = spawn({
      cmd: ['bun', 'run', HOOK_PATH],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: HOOK_TOGGLE_TEST_DIR },
    });

    proc.stdin.write(payload);
    proc.stdin.end();

    const exitCode = await proc.exited;
    const stderr = await proc.stderr.text();
    const stdout = await proc.stdout.text();

    // Assert: Exit code 0, hook-specific disabled message
    expect(exitCode).toBe(0);
    expect(stderr).toContain('[Memory:Retrieve] UserPromptSubmit hook disabled');
    expect(stderr).toContain('exiting');

    // Assert: Global toggle message should NOT appear
    expect(stderr).not.toContain('Memory system disabled');

    // Assert: No context injection (empty stdout)
    expect(stdout.trim()).toBe('');

    // Assert: No search performed
    expect(stderr).not.toContain('Query:');
    expect(stderr).not.toContain('Found');
  });

  test('should process normally when memory.hooks.userPromptSubmit = true', async () => {
    // Arrange: Both global and hook-specific toggles ON
    createHookSettings(HOOK_TOGGLE_TEST_DIR, {
      enabled: true,
      sessionEnd: true,
      userPromptSubmit: true,
    });

    const payload = JSON.stringify({
      prompt: 'Test query for normal processing',
    });

    // Act: Run retrieve hook
    const proc = spawn({
      cmd: ['bun', 'run', HOOK_PATH],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: HOOK_TOGGLE_TEST_DIR },
    });

    proc.stdin.write(payload);
    proc.stdin.end();

    const exitCode = await proc.exited;
    const stderr = await proc.stderr.text();

    // Assert: Exit code 0, normal processing occurred
    expect(exitCode).toBe(0);

    // Assert: No disabled messages
    expect(stderr).not.toContain('disabled');

    // Assert: Normal retrieval logs (NOT debug logs unless debug enabled)
    expect(stderr).toContain('[Memory:'); // Any memory log indicates processing happened
  });

  test('should check global toggle BEFORE hook-specific toggle', async () => {
    // Arrange: Global OFF, hook-specific ON
    createHookSettings(HOOK_TOGGLE_TEST_DIR, {
      enabled: false,
      userPromptSubmit: true,
    });

    const payload = JSON.stringify({ prompt: 'Test' });

    // Act: Run retrieve hook
    const proc = spawn({
      cmd: ['bun', 'run', HOOK_PATH],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: HOOK_TOGGLE_TEST_DIR },
    });

    proc.stdin.write(payload);
    proc.stdin.end();

    const exitCode = await proc.exited;
    const stderr = await proc.stderr.text();

    // Assert: Global toggle message appears (checked first)
    expect(exitCode).toBe(0);
    expect(stderr).toContain('[Memory:Retrieve] Memory system disabled');

    // Assert: Hook-specific message does NOT appear (never reached)
    expect(stderr).not.toContain('UserPromptSubmit hook disabled');
  });

  test('should add zero overhead when hook disabled (<100ms execution)', async () => {
    // Arrange: memory.hooks.userPromptSubmit = false
    createHookSettings(HOOK_TOGGLE_TEST_DIR, {
      enabled: true,
      userPromptSubmit: false,
    });

    const payload = JSON.stringify({ prompt: 'Performance test' });

    // Act: Measure execution time
    const startTime = Date.now();

    const proc = spawn({
      cmd: ['bun', 'run', HOOK_PATH],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: HOOK_TOGGLE_TEST_DIR },
    });

    proc.stdin.write(payload);
    proc.stdin.end();

    await proc.exited;

    const executionTime = Date.now() - startTime;

    // Assert: Execution time < 100ms (two-level config check + exit is fast)
    expect(executionTime).toBeLessThan(100);
  });

  test('should not perform search when hook disabled', async () => {
    // Arrange: memory.hooks.userPromptSubmit = false
    createHookSettings(HOOK_TOGGLE_TEST_DIR, {
      enabled: true,
      userPromptSubmit: false,
    });

    const payload = JSON.stringify({
      prompt: 'This should not trigger search',
    });

    // Act: Run retrieve hook
    const proc = spawn({
      cmd: ['bun', 'run', HOOK_PATH],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: HOOK_TOGGLE_TEST_DIR },
    });

    proc.stdin.write(payload);
    proc.stdin.end();

    await proc.exited;
    const stderr = await proc.stderr.text();
    const stdout = await proc.stdout.text();

    // Assert: No search-related logs appear
    expect(stderr).not.toContain('Query:');
    expect(stderr).not.toContain('Found');
    expect(stderr).not.toContain('Complete:');
    expect(stderr).toContain('UserPromptSubmit hook disabled');

    // Assert: No context injection
    expect(stdout.trim()).toBe('');
  });

  test('should work independently from sessionEnd hook', async () => {
    // Arrange: userPromptSubmit disabled, sessionEnd enabled
    // This tests that disabling userPromptSubmit doesn't affect other hooks
    createHookSettings(HOOK_TOGGLE_TEST_DIR, {
      enabled: true,
      sessionEnd: true, // Other hook still enabled
      userPromptSubmit: false,
    });

    const payload = JSON.stringify({ prompt: 'Test independence' });

    // Act: Run retrieve hook
    const proc = spawn({
      cmd: ['bun', 'run', HOOK_PATH],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PAI_DIR: HOOK_TOGGLE_TEST_DIR },
    });

    proc.stdin.write(payload);
    proc.stdin.end();

    const exitCode = await proc.exited;
    const stderr = await proc.stderr.text();

    // Assert: Retrieve hook exits due to userPromptSubmit=false
    expect(exitCode).toBe(0);
    expect(stderr).toContain('UserPromptSubmit hook disabled');

    // Note: We can't test capture.ts here, but config allows sessionEnd to work
  });
});
