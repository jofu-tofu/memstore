#!/usr/bin/env bun
/**
 * Interactive Diagnostic CLI
 *
 * Interactive command-line tool for rapid retrieval troubleshooting.
 * Supports query execution, config adjustment, segment investigation.
 *
 * Story 4.6.3: Diagnostic Analysis Tools (AC6)
 *
 * Usage:
 *   bun run hooks/memory/tools/interactive-diagnostics.ts
 */

import { retrieveMemories } from '../core/retrieval';
import { analyzeDiagnostics } from './diagnostic-analyzer';
import { investigateSegment } from './segment-investigator';
import { getMemoryConfig } from '../core/config';
import {
  formatDiagnosticReport,
  formatSegmentInvestigation,
} from './lib/report-formatter';
import { initDebugCache } from '../lib/debug-utils';
import '../core/register-providers'; // Ensure providers are registered

/**
 * Interactive diagnostic CLI main function
 *
 * AC6: Interactive mode with query execution, config adjustment, re-run
 */
async function main() {
  console.log('🔍 MemStore Diagnostic Tool (Interactive Mode)');
  console.log(
    'Commands: query <text>, config <param> <value>, investigate <segmentId>, help, quit'
  );
  console.log('');

  // Initialize debug cache for faster checks
  await initDebugCache();

  let currentConfig = await getMemoryConfig();
  if (!currentConfig.ok) {
    console.error(
      '[Error] Failed to load config:',
      currentConfig.error.message
    );
    process.exit(1);
  }

  // Create readline interface
  const readline = (await import('readline')).createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (): void => {
    readline.question('diagnostic> ', async (input: string) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      // Quit command
      if (trimmed === 'quit' || trimmed === 'exit') {
        console.log('Exiting...');
        readline.close();
        process.exit(0);
      }

      // Help command
      if (trimmed === 'help') {
        console.log('\n🔍 MemStore Diagnostic Tool - Available Commands:\n');
        console.log('  query <text>');
        console.log(
          '    Execute retrieval query with debug mode enabled and analyze results'
        );
        console.log('    Example: query typescript hooks error\n');
        console.log('  config <param> <value>');
        console.log(
          '    Adjust configuration parameters (changes apply to current session only)'
        );
        console.log('    Parameters:');
        console.log(
          '      - recency_window_days: Number of days to look back (e.g., 30)'
        );
        console.log(
          '      - min_importance_score: Minimum importance score threshold (e.g., 40)'
        );
        console.log('    Example: config recency_window_days 60\n');
        console.log('  investigate <segmentId>');
        console.log(
          '    Investigate why a specific segment wasn\'t retrieved for a query'
        );
        console.log('    Checks existence, tag matching, filters, and relevance score');
        console.log('    Example: investigate seg_abc123_def456\n');
        console.log('  help');
        console.log('    Show this help message\n');
        console.log('  quit (or exit)');
        console.log('    Exit the diagnostic tool\n');
        prompt();
        return;
      }

      // Query command: "query typescript hook error"
      if (trimmed.startsWith('query ')) {
        const query = trimmed.substring(6);
        await executeQuery(query, currentConfig.value);
        prompt();
        return;
      }

      // Config command: "config recency_window_days 60"
      if (trimmed.startsWith('config ')) {
        const parts = trimmed.split(' ');
        if (parts.length !== 3) {
          console.log('[Error] Usage: config <param> <value>');
          console.log(
            'Example: config recency_window_days 60'
          );
          prompt();
          return;
        }

        const [_, param, value] = parts;
        currentConfig = await adjustConfig(param, value, currentConfig.value);
        prompt();
        return;
      }

      // Investigate command: "investigate seg_001"
      if (trimmed.startsWith('investigate ')) {
        const segmentId = trimmed.substring(12).trim();
        if (!segmentId) {
          console.log('[Error] Usage: investigate <segmentId>');
          prompt();
          return;
        }
        await executeInvestigation(segmentId, readline);
        prompt();
        return;
      }

      console.log(
        '[Error] Unknown command. Type "help" for available commands.'
      );
      prompt();
    });
  };

  prompt();
}

/**
 * Execute retrieval query with debug mode enabled
 *
 * AC6: Run query, capture debug output, show diagnostic analysis
 */
async function executeQuery(query: string, config: any) {
  console.log(`\n🔍 Executing query: "${query}"`);
  console.log('Debug mode: enabled\n');

  // Capture stderr for debug logs
  let debugOutput = '';
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk: any, ...args: any[]): boolean => {
    debugOutput += chunk.toString();
    return originalStderrWrite(chunk, ...args);
  };

  try {
    // Execute retrieval with debug enabled
    const result = await retrieveMemories(query, { debug: true });

    // Analyze diagnostics (no longer async - LOW-2)
    const analysisResult = analyzeDiagnostics(debugOutput);

    if (analysisResult.ok) {
      const report = analysisResult.value;
      console.log('📊 DIAGNOSTIC REPORT:\n');
      console.log(formatDiagnosticReport(report));
      console.log('');

      if (result.ok && result.value.length > 0) {
        console.log(`✅ Retrieved ${result.value.length} segments\n`);
      }
    } else {
      console.log(
        '[Error] Failed to analyze diagnostics:',
        analysisResult.error.message
      );
    }
  } catch (error) {
    console.log(
      '[Error] Query execution failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
  } finally {
    // HIGH-3: Always restore stderr, even on exception
    process.stderr.write = originalStderrWrite;
  }
}

/**
 * Adjust configuration parameters
 *
 * AC6: Modify recency/importance without editing files
 */
async function adjustConfig(
  param: string,
  value: string,
  currentConfig: any
): Promise<{ ok: boolean; value: any }> {
  const numValue = parseInt(value);

  if (isNaN(numValue)) {
    console.log(`[Error] Value must be a number: ${value}`);
    return { ok: true, value: currentConfig };
  }

  if (param === 'recency_window_days') {
    currentConfig.search.recency_window_days = numValue;
    console.log(`✅ Set recency_window_days = ${numValue}`);
  } else if (param === 'min_importance_score') {
    currentConfig.search.min_importance_score = numValue;
    console.log(`✅ Set min_importance_score = ${numValue}`);
  } else {
    console.log(`[Error] Unknown config parameter: ${param}`);
    console.log(
      'Available parameters: recency_window_days, min_importance_score'
    );
  }

  return { ok: true, value: currentConfig };
}

/**
 * Execute segment investigation
 *
 * AC6: Investigate specific segment with user-provided query
 * HIGH-2 fix: Reuse existing readline interface instead of creating new one
 */
async function executeInvestigation(
  segmentId: string,
  readline: any
): Promise<void> {
  return new Promise((resolve) => {
    console.log(`\n🔍 Investigating segment: ${segmentId}`);
    console.log('Enter query to test against this segment:');

    readline.question('query> ', async (query: string) => {
      if (!query.trim()) {
        console.log('[Error] Query cannot be empty\n');
        resolve();
        return;
      }

      const result = await investigateSegment(segmentId, query.trim());

      if (result.ok) {
        console.log('\n📊 INVESTIGATION REPORT:\n');
        console.log(formatSegmentInvestigation(result.value));
        console.log('');
      } else {
        console.log('[Error] Investigation failed:', result.error.message);
      }

      resolve();
    });
  });
}

// Run the CLI
main().catch((error) => {
  console.error('[Fatal] Unexpected error:', error);
  process.exit(1);
});
