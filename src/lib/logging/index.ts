/**
 * Logging Utilities Module
 *
 * @module lib/logging
 */

export { logMemoryError, isProviderError } from './error-logger';
export type { ProviderError } from './error-logger';

export { logRetrieval, createLogEntry } from './retrieval-logger';
export type { RetrievalLogEntry } from './retrieval-logger';

export { logExperimentResult } from './experiment-logger';
export type { ExperimentDataPoint, ExperimentLogError } from './experiment-logger';

export {
  getStats,
  updateCaptureStats,
  updateRetrievalStats,
  updateProcessingStats,
  updateUsageStats
} from './stats-manager';
export type {
  Stats,
  CaptureStats,
  RetrievalStats,
  ProcessingStats,
  UsageStats,
  StatsError
} from './stats-manager';

export { logCaptureOperation, logRetrievalOperation } from './operations-logger';
export type {
  CaptureOperationMetadata,
  RetrievalOperationMetadata,
  ProviderTiming,
  LayerTiming,
  SearchLayerTiming,
  OperationsLogError
} from './operations-logger';
