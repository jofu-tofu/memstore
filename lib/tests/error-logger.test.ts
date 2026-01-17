import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { logMemoryError } from '../error-logger';

describe('logMemoryError', () => {
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('should log error with component prefix', () => {
    const error = new Error('Test error');

    logMemoryError('Capture', error);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Memory:Capture] Error: Test error')
    );
  });

  test('should include error code for provider errors', () => {
    const error = {
      code: 'STORAGE_WRITE_FAILED',
      message: 'Failed to write',
      cause: new Error('Disk full')
    };

    logMemoryError('Storage', error);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Memory:Storage] Error: Failed to write')
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Memory:Storage] Code: STORAGE_WRITE_FAILED')
    );
  });

  test('should include stack trace when available', () => {
    const error = new Error('Test error with stack');

    logMemoryError('Pipeline', error);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error: Test error with stack')
    );
    // Stack trace should be logged separately
    const calls = consoleErrorSpy.mock.calls;
    const hasStackTrace = calls.some(call =>
      call[0]?.toString().includes('at ')
    );
    expect(hasStackTrace).toBe(true);
  });

  test('should include context when provided', () => {
    const error = new Error('Context test');
    const context = { sessionId: 'mem_123', operation: 'store' };

    logMemoryError('Storage', error, context);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Memory:Storage] Context:',
      expect.stringContaining('mem_123')
    );
  });

  test('should include cause when present in provider error', () => {
    const cause = new Error('Root cause');
    const error = {
      code: 'STORAGE_WRITE_FAILED',
      message: 'Failed to write',
      cause: cause
    };

    logMemoryError('Storage', error);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Memory:Storage] Caused by:',
      cause
    );
  });

  test('should handle errors without stack trace', () => {
    const error = { message: 'Simple error' } as Error;
    delete error.stack;

    logMemoryError('Test', error);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Memory:Test] Error: Simple error')
    );
  });

  test('should handle empty context gracefully', () => {
    const error = new Error('Test');

    logMemoryError('Test', error, {});

    // Should still log error, not crash
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
