#!/usr/bin/env bun

/**
 * Session Capture Hook
 *
 * Captures session transcripts when SessionEnd event fires.
 * Writes raw transcript to queue for async processing.
 * Spawns background processor if none is running.
 *
 * CRITICAL: ALWAYS exits 0 (never blocks PAI)
 */

import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { generateSessionId } from './lib/id-generator';
import { isProcessorRunning } from './lib/lock';
import { getMemoryConfig } from './core/config';
import { logMemoryError } from './lib/error-logger';
import { ensureMemStoreDirectories } from './lib/directory-utils';
import { updateCaptureStats } from './lib/logging/stats-manager';
import './core/register-providers'; // Register MVP providers

// Constants
const STALE_LOCK_TIMEOUT_MS = 60000; // 60 seconds

/**
 * Reads and converts a Claude Code JSONL transcript to a plain text format.
 * Extracts user and assistant messages into "User: ...\nAssistant: ..." format.
 *
 * @param transcriptPath - Path to the JSONL transcript file
 * @returns Formatted transcript string, or empty string if file doesn't exist
 */
async function readTranscriptContent(transcriptPath: string): Promise<string> {
  try {
    if (!existsSync(transcriptPath)) {
      console.error(`[Memory:Capture] Transcript file not found: ${transcriptPath}`);
      return '';
    }

    const content = await fs.readFile(transcriptPath, 'utf-8');
    const lines = content.split('\n');
    const messages: string[] = [];

    // Use index-based loop (for-of has issues in some Bun contexts)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length === 0) continue;

      try {
        const entry = JSON.parse(line);

        // Extract user messages
        if (entry.type === 'user' && entry.message?.content) {
          const textContent = extractTextContent(entry.message.content);
          if (textContent) {
            messages.push(`User: ${textContent}`);
          }
        }

        // Extract assistant messages
        if (entry.type === 'assistant' && entry.message?.content) {
          const textContent = extractTextContent(entry.message.content);
          if (textContent) {
            messages.push(`Assistant: ${textContent}`);
          }
        }
      } catch (parseError) {
        // Skip malformed lines
        continue;
      }
    }

    return messages.join('\n\n');
  } catch (error) {
    console.error(`[Memory:Capture] Error reading transcript: ${(error as Error).message}`);
    return '';
  }
}

/**
 * Extracts text content from Claude message content array.
 * Handles string content, text blocks, and tool_result blocks.
 */
function extractTextContent(content: any): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const texts: string[] = [];
    for (let i = 0; i < content.length; i++) {
      const block = content[i];
      // Handle text blocks
      if (block.type === 'text' && block.text) {
        texts.push(block.text);
      }
      // Handle tool_result blocks with string content
      if (block.type === 'tool_result' && typeof block.content === 'string') {
        texts.push(`[Tool Result: ${block.content}]`);
      }
    }
    return texts.join('\n');
  }

  return '';
}

/**
 * Gets PAI directory path from environment or uses default.
 */
function getPaiDir(): string {
  return process.env.PAI_DIR || join(homedir(), 'pai');
}

/**
 * Reads complete stdin stream using Bun's ReadableStream API.
 */
async function readStdin(): Promise<string> {
  let input = '';
  const decoder = new TextDecoder();
  const reader = Bun.stdin.stream().getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      input += decoder.decode(value, { stream: true });
    }
  } catch (e) {
    // Ignore read errors - graceful degradation
  }

  return input;
}

/**
 * Spawns background processor as fully detached process.
 * Uses fire-and-forget pattern (no wait).
 */
function spawnProcessor() {
  const processorPath = join(getPaiDir(), 'hooks', 'memory', 'process-queue.ts');

  try {
    // Spawn using Bun.spawn (NOT child_process)
    Bun.spawn(['bun', 'run', processorPath], {
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore'],
      env: process.env
    });

    console.error('[Memory:Capture] Spawned background processor');
  } catch (error) {
    console.error(`[Memory:Capture] Failed to spawn processor: ${(error as Error).message}`);
    // Don't throw - this is not critical failure
  }
}

/**
 * Main hook logic
 */
async function main() {
  const startTime = Date.now();
  let captureSuccess = false;

  try {
    // === Story 3.6: Graceful Degradation ===
    // Ensure directories exist before operations (AC: Story 3.6)
    const dirResult = ensureMemStoreDirectories();
    if (!dirResult.ok) {
      logMemoryError('Capture', dirResult.error);
      process.exit(0); // Graceful exit if directories can't be created
    }
    // === End Story 3.6 ===

    // LEVEL 1: Check if memory system is globally enabled
    const configResult = await getMemoryConfig();

    if (!configResult.ok) {
      console.error(`[Memory:Capture] Failed to load config: ${configResult.error.message}`);
      console.error('[Memory:Capture] Using defaults, assuming enabled');
      // Graceful degradation - continue with defaults
    } else {
      const config = configResult.value;

      // LEVEL 1: Global toggle check
      if (!config.enabled) {
        console.error('[Memory:Capture] Memory system disabled, exiting');
        process.exit(0);  // No-op, zero overhead
      }

      // LEVEL 2: Hook-specific toggle check (Story 3.3)
      if (!config.hooks.sessionEnd) {
        console.error('[Memory:Capture] SessionEnd hook disabled, exiting');
        process.exit(0);  // No-op, zero overhead
      }
    }

    // THEN: Read session payload from stdin
    const input = await readStdin();
    if (!input.trim()) {
      // Empty input - graceful no-op
      process.exit(0);
    }

    // Parse payload
    let payload: any;
    try {
      payload = JSON.parse(input);
      // Basic validation: ensure it's an object
      if (typeof payload !== 'object' || payload === null) {
        throw new Error('Payload must be an object');
      }
    } catch (parseError) {
      throw new Error(`Invalid JSON payload: ${(parseError as Error).message}`);
    }

    // Generate session ID
    const sessionIdResult = generateSessionId();
    if (!sessionIdResult.ok) {
      console.error(`[Memory:Capture] Failed to generate session ID: ${sessionIdResult.error.message}`);
      process.exit(0);
    }
    const sessionId = sessionIdResult.value;

    // Read actual transcript content from the file path provided by Claude Code
    let transcriptContent = '';
    if (payload.transcript_path) {
      console.error(`[Memory:Capture] Reading transcript from: ${payload.transcript_path}`);
      transcriptContent = await readTranscriptContent(payload.transcript_path);
      console.error(`[Memory:Capture] Extracted ${transcriptContent.length} chars from transcript`);
    } else {
      console.error('[Memory:Capture] No transcript_path in payload, skipping');
      process.exit(0);
    }

    // Skip if no content extracted
    if (!transcriptContent.trim()) {
      console.error('[Memory:Capture] No transcript content extracted, skipping');
      process.exit(0);
    }

    // Queue directory already ensured by ensureMemStoreDirectories()
    const queueDir = join(getPaiDir(), 'mem-store', 'queue');

    const timestamp = Date.now();
    const queueFile = join(queueDir, `${timestamp}_${sessionId}.json`);

    const queueData = {
      sessionId,
      transcript: transcriptContent,  // Now stores actual string content
      capturedAt: timestamp,
      metadata: {
        source: 'SessionEnd',
        version: '1.0.1',  // Bumped version for fix
        transcriptPath: payload.transcript_path,
        claudeSessionId: payload.session_id,
        ...payload.metadata
      }
    };

    await fs.writeFile(queueFile, JSON.stringify(queueData, null, 2), 'utf-8');

    // Check if processor is running
    const lockPath = join(queueDir, '.processor.lock');
    const processorCheck = isProcessorRunning(lockPath, STALE_LOCK_TIMEOUT_MS);

    if (!processorCheck.ok) {
      // Error checking lock - assume no processor running
      console.error(`[Memory:Capture] Error checking lock: ${processorCheck.error.message}`);
      spawnProcessor();
    } else if (!processorCheck.value) {
      // No processor running - spawn one
      spawnProcessor();
    } else {
      // Processor already running
      console.error('[Memory:Capture] Processor already running, skipping spawn');
    }

    // Mark capture as successful
    captureSuccess = true;

    // Performance monitoring
    const elapsed = Date.now() - startTime;
    if (elapsed > 1000) {
      console.error(`[Memory:Capture] WARNING: Execution took ${elapsed}ms (budget: 1000ms)`);
    }
  } catch (error) {
    captureSuccess = false;
    // === Story 3.6: Graceful Degradation ===
    // CRITICAL: Catch all exceptions and exit gracefully
    // Use enhanced error logger with stack trace (Story 3.6)
    if (error instanceof Error) {
      logMemoryError('Capture', error);
    } else {
      console.error(`[Memory:Capture] Error: ${String(error)}`);
    }
    // === End Story 3.6 ===
  } finally {
    // === Story 4.3: Performance Logging ===
    // Update capture stats (fire-and-forget, never blocks hook)
    const latencyMs = Date.now() - startTime;
    try {
      const statsResult = updateCaptureStats(latencyMs, captureSuccess);
      if (!statsResult.ok) {
        console.error(`[Memory:Capture] Stats update failed: ${statsResult.error.message}`);
      }
    } catch (statsError) {
      // Ignore stats errors - never block hook execution
      console.error(`[Memory:Capture] Stats update exception: ${statsError instanceof Error ? statsError.message : String(statsError)}`);
    }
    // === End Story 4.3 ===
  }

  // CRITICAL: Always exit 0 - never block PAI
  process.exit(0);
}

// === Story 3.6: Graceful Degradation ===
// Handle unhandled rejections
main().catch((error) => {
  console.error('[Memory:Capture] Fatal: Unhandled rejection');
  if (error instanceof Error) {
    logMemoryError('Capture', error);
  } else {
    console.error(error);
  }
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[Memory:Capture] Fatal: Uncaught exception');
  logMemoryError('Capture', error);
  process.exit(0);
});
// === End Story 3.6 ===
