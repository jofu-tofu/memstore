/**
 * Type definitions for provider test harness
 *
 * @module providers/test-harness/harness-types
 */

/**
 * Configuration options for test harness behavior.
 *
 * @example
 * ```typescript
 * const options: HarnessOptions = {
 *   cleanupBeforeEach: true,
 *   testDataPath: './.test-data',
 *   debug: false
 * };
 * runStorageProviderTests(FileBackend, options);
 * ```
 */
export interface HarnessOptions {
  /**
   * Clean test data between each test.
   *
   * When true, test directory is wiped clean after each test.
   * When false (default), data persists between tests within a describe block.
   *
   * Default: false
   */
  cleanupBeforeEach?: boolean;

  /**
   * Custom test data directory path.
   *
   * If not specified, harness creates unique directory:
   * `~/.memstore-test-{providerName}`
   *
   * Example: `./.test-data` for project-local test data
   */
  testDataPath?: string;

  /**
   * Enable verbose diagnostic logging during tests.
   *
   * When true, harness logs detailed test execution info:
   * - Provider initialization details
   * - Test data creation
   * - Contract validation steps
   *
   * Default: false
   */
  debug?: boolean;
}

/**
 * Test execution context shared across test suite.
 *
 * Used internally by harness to track state and resources.
 */
export interface TestContext {
  /** Provider instance being tested */
  provider: any;

  /** Test data directory path */
  testDir: string;

  /** Whether provider is initialized */
  initialized: boolean;

  /** Test data created during test run */
  testData: Map<string, any>;
}
