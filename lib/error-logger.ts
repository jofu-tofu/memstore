/**
 * Centralized error logging utility for memory system
 * Ensures consistent error format across all components
 */

export interface ProviderError {
  code: string;
  message: string;
  cause?: Error;
}

export function isProviderError(error: unknown): error is ProviderError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  );
}

/**
 * Log memory system error with diagnostic context
 *
 * @param component - Component name (Capture, Retrieve, Pipeline, etc.)
 * @param error - Error object (Error or ProviderError)
 * @param context - Optional diagnostic context
 */
export function logMemoryError(
  component: string,
  error: Error | ProviderError,
  context?: Record<string, unknown>
): void {
  // Component prefix with error message
  console.error(`[Memory:${component}] Error: ${error.message}`);

  // Error code (if provider error)
  if ('code' in error) {
    console.error(`[Memory:${component}] Code: ${error.code}`);
  }

  // Context (if provided and not empty)
  if (context && Object.keys(context).length > 0) {
    console.error(`[Memory:${component}] Context:`, JSON.stringify(context, null, 2));
  }

  // Stack trace (if available)
  if (error.stack) {
    console.error(error.stack);
  }

  // Original cause (if wrapped in provider error)
  if ('cause' in error && error.cause) {
    console.error(`[Memory:${component}] Caused by:`, error.cause);
  }
}
