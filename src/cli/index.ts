/**
 * CLI Tools Module
 *
 * Command-line utilities for memory system diagnostics and management.
 *
 * @module cli
 */

// CLI tools are meant to be run directly
// Export path references for convenience
export const CLI_TOOLS = {
  queryMemories: './query-memories.ts',
  interactiveDiagnostics: './interactive-diagnostics.ts',
  diagnosticAnalyzer: './diagnostic-analyzer.ts',
  segmentInvestigator: './segment-investigator.ts',
  retrievalComparator: './retrieval-comparator.ts',
  insightsCli: './insights-cli.ts',
  metricsAnalyzer: './metrics-analyzer.ts'
} as const;
