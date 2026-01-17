import { retrieveMemories } from '../core/retrieval';
import { formatMemoryContext } from '../core/context-formatter';
import { updateUsageSignals } from '../lib/usage-tracker';
import { logRetrieval, createLogEntry } from '../lib/logging/retrieval-logger';
import { estimateTokens } from '../lib/formatting/token-counter';
import { getMemoryConfig, getDebugMode } from '../core/config';
import { logMemoryError } from '../lib/logging/error-logger';
import { ensureMemStoreDirectories } from '../lib/directory-utils';
import { updateRetrievalStats } from '../lib/logging/stats-manager';
import '../core/register-providers'; // Register MVP providers

// Performance budget constants (Story 4.3)
const DEFAULT_LATENCY_BUDGET_MS = 1000; // 1 second (NFR-P1)

/**
 * Read all input from stdin
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
 * Flexible payload structure for UserPromptSubmit
 */
interface PromptPayload {
  query?: string;
  prompt?: string;
  message?: string;
  text?: string;
  // Payload structure may vary - be flexible
}

/**
 * Extract user query from payload, trying multiple possible field names
 */
function extractQuery(payload: PromptPayload): string {
  return payload.query || payload.prompt || payload.message || payload.text || '';
}

/**
 * Main hook execution
 */
async function main() {
  const startTime = Date.now();
  let resultCount = 0;
  let injectedTokens = 0;
  let budgetExceeded = false;
  let maxRetrievalMs = DEFAULT_LATENCY_BUDGET_MS;

  try {
    // === Story 3.6: Graceful Degradation ===
    // Ensure directories exist before operations (AC: Story 3.6)
    const dirResult = ensureMemStoreDirectories();
    if (!dirResult.ok) {
      logMemoryError('Retrieve', dirResult.error);
      // Output nothing to stdout - prompt proceeds without memory
      process.exit(0);
    }
    // === End Story 3.6 ===

    // LEVEL 1: Check if memory system is globally enabled
    const configResult = await getMemoryConfig();

    if (!configResult.ok) {
      console.error(`[Memory:Retrieve] Failed to load config: ${configResult.error.message}`);
      console.error('[Memory:Retrieve] Using defaults, assuming enabled');
      // Graceful degradation - continue with defaults
    } else {
      const config = configResult.value;

      // === Story 4.3: Performance Logging ===
      // Read performance budget from configuration (AC3)
      maxRetrievalMs = config.performance.maxRetrievalMs;
      // === End Story 4.3 ===

      // LEVEL 1: Global toggle check
      if (!config.enabled) {
        console.error('[Memory:Retrieve] Memory system disabled, exiting');
        process.exit(0);  // No-op, zero overhead
      }

      // LEVEL 2: Hook-specific toggle check (Story 3.3)
      if (!config.hooks.userPromptSubmit) {
        console.error('[Memory:Retrieve] UserPromptSubmit hook disabled, exiting');
        process.exit(0);  // No-op, zero overhead
      }
    }

    // === Story 4.6: Retrieval Diagnostics ===
    // Load debug mode setting from configuration (AC5, Task 1.2)
    const debugMode = await getDebugMode();
    // === End Story 4.6 ===

    // THEN: Read input payload
    const input = await readStdin();
    if (!input.trim()) {
      process.exit(0);
    }

    const payload = JSON.parse(input);

    // Extract query from payload
    // Support multiple payload formats: { query, prompt, message, text }
    const userQuery = extractQuery(payload);

    if (!userQuery.trim()) {
      console.error('[Memory:Retrieve] Empty query, skipping retrieval');
      process.exit(0);
    }

    // === Story 4.6: Only log query in debug mode (AC5 - opt-in logging) ===
    if (debugMode) {
      console.error(`[Memory:Retrieve:Debug] Query: "${userQuery}"`);
    }
    // === End Story 4.6 ===

    // Execute retrieval pipeline (search → filter → rank)
    // Pass debug mode for verbose diagnostics (Story 4.6, Task 1.3)
    const retrievalResult = await retrieveMemories(userQuery, {
      maxResults: 10,
      minRelevance: 0,
      filters: {
        recency: '30d'  // Only memories from last 30 days
      },
      debug: debugMode  // Enable verbose diagnostics if configured
    });

    if (!retrievalResult.ok) {
      console.error(
        `[Memory:Retrieve] Retrieval failed: ${retrievalResult.error.message}`
      );
      process.exit(0);  // Graceful degradation
    }

    const rankedResults = retrievalResult.value;

    if (rankedResults.length === 0) {
      console.error('[Memory:Retrieve] No memories found');

      // === Story 4.6: No-Results Diagnostic (AC2, Task 3) ===
      // When debug mode is enabled, detailed diagnostics were already logged
      // during the search/filter/rank pipeline. Provide actionable guidance.
      console.error(`[Memory:Retrieve:Diagnostic] No results for query: "${userQuery}"`);
      console.error('[Memory:Retrieve:Diagnostic] Check debug logs above if debug mode enabled');
      console.error('[Memory:Retrieve:Diagnostic] Common causes:');
      console.error('[Memory:Retrieve:Diagnostic]   1. No terms extracted (all stop words)');
      console.error('[Memory:Retrieve:Diagnostic]   2. Terms not in keyword index (no matching memories)');
      console.error('[Memory:Retrieve:Diagnostic]   3. All candidates filtered out (adjust recency/importance)');
      console.error('[Memory:Retrieve:Diagnostic] Suggestion: Enable debug mode (memory.debug: true) for detailed pipeline diagnostics');
      // === End Story 4.6 ===

      // === Story 4.1: Retrieval Inspection ===
      // Log zero-result retrieval for diagnostics (AC5)
      const latency = Date.now() - startTime;
      logRetrieval(createLogEntry(userQuery, [], latency, 0));
      // === End Story 4.1 ===

      // === Story 4.3: Performance Logging ===
      // Track zero-result stats
      resultCount = 0;
      injectedTokens = 0;
      budgetExceeded = latency > maxRetrievalMs;
      // === End Story 4.3 ===

      // Continue to finally block for stats update (don't exit here)
      return;
    }

    console.error(
      `[Memory:Retrieve] Found ${rankedResults.length} ranked memories`
    );

    // Format memories for context injection
    const formatResult = await formatMemoryContext(rankedResults, {
      maxTokens: 2000,
      maxMemories: 10
    });

    if (!formatResult.ok) {
      console.error(
        `[Memory:Retrieve] Formatting failed: ${formatResult.error.message}`
      );
      return; // Continue to finally block for stats update
    }

    const formattedContext = formatResult.value;

    if (!formattedContext) {
      console.error('[Memory:Retrieve] No context formatted (all memories failed)');
      return; // Continue to finally block for stats update
    }

    // Output formatted context to stdout for Claude Code
    console.log(formattedContext);

    // === Story 4.4: Usage Signal Tracking ===
    // Track access counts for injected segments (AC1)
    // Fire-and-forget: Don't block retrieval if tracking fails
    const injectedIds = rankedResults.map(r => r.segmentId);
    updateUsageSignals(injectedIds).catch(err => {
      console.error(`[Memory:Retrieve] Usage tracking failed: ${err.message || String(err)}`);
      // Graceful degradation - retrieval continues even if tracking fails
    });
    // === End Story 4.4 ===

    // === Story 4.1: Retrieval Inspection ===
    // Log retrieval for diagnostics (AC1, AC2)
    const latency = Date.now() - startTime;
    injectedTokens = estimateTokens(formattedContext);
    logRetrieval(createLogEntry(userQuery, rankedResults, latency, injectedTokens));
    // === End Story 4.1 ===

    // === Story 4.3: Performance Logging ===
    // Track successful retrieval stats
    resultCount = rankedResults.length;
    budgetExceeded = latency > maxRetrievalMs;
    // === End Story 4.3 ===

    console.error(
      `[Memory:Retrieve] Complete: ${rankedResults.length} memories, ${injectedTokens} tokens, ${latency}ms`
    );

    // Check latency budget (AC3)
    if (budgetExceeded) {
      console.error(
        `[Memory:Retrieve] Latency budget exceeded: ${latency}ms > ${maxRetrievalMs}ms`
      );
    }
  } catch (error) {
    // === Story 3.6: Graceful Degradation ===
    // CRITICAL: Catch all exceptions and exit gracefully
    // Use enhanced error logger with stack trace (Story 3.6)
    if (error instanceof Error) {
      logMemoryError('Retrieve', error);
    } else {
      console.error(`[Memory:Retrieve] Error: ${String(error)}`);
    }
    // CRITICAL: stdout remains EMPTY - user prompt proceeds without memory
    // === End Story 3.6 ===
  } finally {
    // === Story 4.3: Performance Logging ===
    // Update retrieval stats (fire-and-forget, never blocks hook)
    const latencyMs = Date.now() - startTime;
    try {
      const statsResult = updateRetrievalStats(latencyMs, resultCount, injectedTokens, budgetExceeded);
      if (!statsResult.ok) {
        console.error(`[Memory:Retrieve] Stats update failed: ${statsResult.error.message}`);
      }
    } catch (statsError) {
      // Ignore stats errors - never block hook execution
      console.error(`[Memory:Retrieve] Stats update exception: ${statsError instanceof Error ? statsError.message : String(statsError)}`);
    }
    // === End Story 4.3 ===
  }

  // CRITICAL: Always exit 0 - never block Claude Code
  process.exit(0);
}

// === Story 3.6: Graceful Degradation ===
// Handle unhandled rejections
main().catch((error) => {
  console.error('[Memory:Retrieve] Fatal: Unhandled rejection');
  if (error instanceof Error) {
    logMemoryError('Retrieve', error);
  } else {
    console.error(error);
  }
  // Output nothing to stdout
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[Memory:Retrieve] Fatal: Uncaught exception');
  logMemoryError('Retrieve', error);
  // Output nothing to stdout
  process.exit(0);
});
// === End Story 3.6 ===
