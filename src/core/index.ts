/**
 * Core Memory System Module
 *
 * Provides retrieval, configuration, and pipeline functionality.
 *
 * @module core
 */

// Configuration
export { getMemoryConfig, getDebugMode } from './config';
export type { MemoryConfig, ExperimentConfig } from './config';

// Retrieval pipeline
export { retrieveMemories } from './retrieval';
export type { RetrievalOptions, MemoryContext } from './retrieval';

// Context formatting
export { formatMemoryContext } from './context-formatter';

// Processing pipeline
export { processPipeline, loadPipelineProviders } from './pipeline';

// Provider registry
export { ProviderRegistry, globalProviderRegistry } from './provider-registry';
export type { Provider, ProviderType, ProviderFactory, HealthStatus, ProviderError } from './provider-registry';

// Filters
export { applyFilters } from './filters';

// Ranking
export { rankResults } from './ranking';

// Lifecycle management
export { identifyDecayCandidates, generateDecayReport } from './lifecycle';

// Experiments
export { getActiveExperiment, selectVariant, hashCode, validateSplitPercentages } from './experiment';
export type { ExperimentError, ActiveExperiment } from './experiment';
export { validateExperimentProvider } from './experiment-validation';

// Decay
export { calculateDecay } from './decay';
