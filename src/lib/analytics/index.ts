/**
 * Analytics Module
 *
 * Analysis and insights for memory system.
 *
 * @module lib/analytics
 */

// Insights
export {
  topSegments,
  staleSegments,
  slowProviders,
  retrievalSuccessRate,
  providerComparison,
  analyzeProviderQuality,
  getInsightsSummary
} from './insights';

// Experiment Analysis
export {
  aggregateExperimentData,
  exportExperimentResults
} from './experiment-analyzer';
export type {
  VariantStats,
  VariantComparison,
  ExperimentResults,
  ExperimentAnalysisError,
  ExportFormat
} from './experiment-analyzer';

// Experiment Lifecycle
export {
  startExperiment,
  stopExperiment,
  listExperiments,
  getExperimentStatus
} from './experiment-lifecycle';
export type {
  ExperimentLifecycleError,
  ExperimentSummary
} from './experiment-lifecycle';

// Performance Metrics
export {
  getPerformanceMetrics,
  getSlowProviders,
  compareProviders,
  getTrends,
  DEFAULT_LATENCY_THRESHOLDS
} from './performance-metrics';
