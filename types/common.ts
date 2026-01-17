/**
 * Core types for the PAI Memory System
 *
 * This module defines the fundamental types used throughout the memory system:
 * - Result type for error handling without exceptions
 * - Provider base interface for pluggable components
 * - Error and health status types
 */

/**
 * Result type for representing success or failure without throwing exceptions.
 *
 * All provider methods return Result types to enable explicit error handling
 * and type-safe value access.
 *
 * @template T - The type of the success value
 * @template E - The type of the error (defaults to Error)
 *
 * @example
 * ```typescript
 * const result: Result<string, ProviderError> = await provider.getData();
 *
 * if (!result.ok) {
 *   console.error(`[Memory:Component] ${result.error.message}`);
 *   return;
 * }
 *
 * // TypeScript knows result.value is string here
 * const data = result.value;
 * ```
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Error type returned by provider methods.
 *
 * All errors include a namespaced code, human-readable message,
 * and optional original error cause.
 *
 * ## Error Code Format
 *
 * Error codes must follow the format: `{PROVIDER}_{ERROR_TYPE}`
 * - PROVIDER: UPPERCASE provider type (STORAGE, SEARCH, EXTRACT, etc.)
 * - ERROR_TYPE: UPPERCASE description (WRITE_FAILED, INDEX_CORRUPT, etc.)
 *
 * Examples: `STORAGE_WRITE_FAILED`, `SEARCH_INDEX_CORRUPT`, `EXTRACT_KEYWORDS_FAILED`
 *
 * @example
 * ```typescript
 * const error: ProviderError = {
 *   code: 'STORAGE_WRITE_FAILED',
 *   message: 'Failed to write segment to disk',
 *   cause: originalError
 * };
 * ```
 */
export interface ProviderError {
  /** Error name for Error interface compatibility (default: 'ProviderError') */
  name: string;

  /** Namespaced error code (e.g., 'STORAGE_WRITE_FAILED', 'SEARCH_INDEX_CORRUPT') */
  code: string;

  /** Human-readable error message */
  message: string;

  /** Optional original error that caused this error */
  cause?: Error;
}

/**
 * Health status returned by provider health checks.
 *
 * Used for diagnostics and graceful degradation.
 *
 * @example
 * ```typescript
 * const health = await provider.healthCheck();
 *
 * if (!health.healthy) {
 *   console.warn(`[Memory:Provider] ${health.message}`);
 * }
 * ```
 */
export interface HealthStatus {
  /** Whether the provider is healthy and operational */
  healthy: boolean;

  /** Human-readable status message */
  message: string;

  /** Optional provider-specific diagnostic details */
  details?: Record<string, unknown>;
}

/**
 * Base interface for all providers in the memory system.
 *
 * All provider types (storage, search, extraction, etc.) extend this interface
 * to ensure consistent lifecycle management and health monitoring.
 *
 * ## Provider Lifecycle
 *
 * Every provider follows this lifecycle:
 * 1. **Construction**: Provider instance created
 * 2. **Initialization**: `initialize()` called to set up resources
 * 3. **Operation**: Provider methods called (search, store, etc.)
 * 4. **Health Checks**: `healthCheck()` called for diagnostics
 * 5. **Shutdown**: `shutdown()` called to release resources
 *
 * @example
 * ```typescript
 * // Extending Provider for custom provider type
 * interface StorageProvider extends Provider {
 *   store(segment: MemorySegment): Promise<Result<StoreResult, StorageError>>;
 *   retrieve(id: string): Promise<Result<MemorySegment | null, StorageError>>;
 * }
 *
 * // Implementing a provider
 * class FileBackend implements StorageProvider {
 *   readonly name = 'FileBackend';
 *   readonly version = '1.0.0';
 *
 *   async initialize(): Promise<Result<void, ProviderError>> {
 *     // Set up directories, indexes, etc.
 *     return { ok: true, value: undefined };
 *   }
 *
 *   async healthCheck(): Promise<HealthStatus> {
 *     // Check disk space, file access, etc.
 *     return { healthy: true, message: 'FileBackend operational' };
 *   }
 *
 *   async shutdown(): Promise<void> {
 *     // Close file handles, flush buffers, etc.
 *   }
 *
 *   async store(segment: MemorySegment): Promise<Result<StoreResult, StorageError>> {
 *     // Implementation...
 *   }
 *
 *   async retrieve(id: string): Promise<Result<MemorySegment | null, StorageError>> {
 *     // Implementation...
 *   }
 * }
 * ```
 */
export interface Provider {
  /**
   * Provider name (e.g., 'FileBackend', 'KeywordSearch').
   *
   * Must be unique within a provider type.
   * Used for diagnostics and provider selection.
   */
  readonly name: string;

  /**
   * Semantic version (e.g., '1.0.0').
   *
   * Used for compatibility checking and migrations.
   * Must follow SemVer: MAJOR.MINOR.PATCH
   */
  readonly version: string;

  /**
   * Initialize the provider and allocate required resources.
   *
   * ## When Called
   *
   * Called once during system startup, before any other provider methods.
   *
   * ## Responsibilities
   *
   * - Allocate resources (connections, file handles, memory)
   * - Create required directories or database tables
   * - Load indexes or configuration
   * - Validate environment and dependencies
   *
   * ## Initialization Patterns
   *
   * **Idempotent initialization:**
   * ```typescript
   * async initialize(): Promise<Result<void, ProviderError>> {
   *   if (this.initialized) {
   *     return { ok: true, value: undefined };
   *   }
   *   // Initialize resources...
   *   this.initialized = true;
   *   return { ok: true, value: undefined };
   * }
   * ```
   *
   * **Resource allocation:**
   * ```typescript
   * async initialize(): Promise<Result<void, ProviderError>> {
   *   try {
   *     await mkdir(this.dataDir, { recursive: true });
   *     this.index = await this.loadIndex();
   *     return { ok: true, value: undefined };
   *   } catch (error) {
   *     return {
   *       ok: false,
   *       error: {
   *         code: 'PROVIDER_INIT_FAILED',
   *         message: 'Failed to initialize provider',
   *         cause: error
   *       }
   *     };
   *   }
   * }
   * ```
   *
   * @returns Result indicating success or initialization error
   */
  initialize(): Promise<Result<void, ProviderError>>;

  /**
   * Check provider health and operational status.
   *
   * ## When Called
   *
   * - Periodically for monitoring
   * - Before critical operations
   * - For diagnostics and debugging (Story 4.6)
   *
   * ## Responsibilities
   *
   * - Verify resources are available (disk space, memory, connections)
   * - Check dependencies are accessible
   * - Return diagnostic details for troubleshooting
   *
   * ## Usage for Graceful Degradation
   *
   * ```typescript
   * const health = await provider.healthCheck();
   * if (!health.healthy) {
   *   console.warn(`[Memory:Provider] ${health.message}`);
   *   // Fall back to alternative provider or disable feature
   *   return fallbackBehavior();
   * }
   * // Proceed with normal operation
   * ```
   *
   * ## Diagnostic Details
   *
   * ```typescript
   * async healthCheck(): Promise<HealthStatus> {
   *   const diskSpace = await checkDiskSpace(this.dataDir);
   *   const indexSize = await this.getIndexSize();
   *
   *   return {
   *     healthy: diskSpace > 100_000_000, // 100MB
   *     message: diskSpace > 100_000_000
   *       ? 'FileBackend operational'
   *       : 'Low disk space',
   *     details: {
   *       diskSpaceBytes: diskSpace,
   *       indexSizeBytes: indexSize,
   *       lastWrite: this.lastWriteTimestamp
   *     }
   *   };
   * }
   * ```
   *
   * @returns Current health status with optional diagnostic details
   */
  healthCheck(): Promise<HealthStatus>;

  /**
   * Gracefully shutdown the provider and release resources.
   *
   * ## When Called
   *
   * - During system shutdown
   * - When replacing a provider (Story 3.4)
   * - Before running tests that reset state
   *
   * ## Responsibilities
   *
   * - Close file handles and connections
   * - Flush pending writes
   * - Release memory allocations
   * - Cancel pending operations
   * - Save state if necessary
   *
   * ## Cleanup Expectations
   *
   * ```typescript
   * async shutdown(): Promise<void> {
   *   // Cancel pending operations
   *   this.pendingWrites.forEach(write => write.cancel());
   *
   *   // Flush buffers
   *   await this.flushPendingWrites();
   *
   *   // Close resources
   *   await this.closeFileHandles();
   *   await this.closeConnections();
   *
   *   // Clear state
   *   this.index = null;
   *   this.initialized = false;
   * }
   * ```
   *
   * **Note**: shutdown() should never throw - handle errors internally.
   */
  shutdown(): Promise<void>;
}
