import { describe, test, expect } from 'bun:test';
import type { Result, Provider, ProviderError, HealthStatus } from './common';

describe('Result type', () => {
  test('should narrow type when ok is true', () => {
    const result: Result<string, Error> = { ok: true, value: 'success' };

    if (result.ok) {
      // TypeScript should know result.value is string here
      expect(result.value).toBe('success');
    }
  });

  test('should narrow type when ok is false', () => {
    const result: Result<string, Error> = {
      ok: false,
      error: new Error('fail')
    };

    if (!result.ok) {
      // TypeScript should know result.error is Error here
      expect(result.error.message).toBe('fail');
    }
  });

  test('should work with custom error types', () => {
    const customError: ProviderError = {
      code: 'TEST_ERROR',
      message: 'Test error message',
      cause: new Error('root cause')
    };

    const result: Result<number, ProviderError> = {
      ok: false,
      error: customError
    };

    if (!result.ok) {
      expect(result.error.code).toBe('TEST_ERROR');
      expect(result.error.message).toBe('Test error message');
      expect(result.error.cause?.message).toBe('root cause');
    }
  });

  test('should support generic success values', () => {
    type User = { id: string; name: string };
    const user: User = { id: '123', name: 'Josh' };

    const result: Result<User, ProviderError> = { ok: true, value: user };

    if (result.ok) {
      expect(result.value.id).toBe('123');
      expect(result.value.name).toBe('Josh');
    }
  });
});

describe('ProviderError', () => {
  test('should have required code and message fields', () => {
    const error: ProviderError = {
      code: 'STORAGE_WRITE_FAILED',
      message: 'Failed to write to storage'
    };

    expect(error.code).toBe('STORAGE_WRITE_FAILED');
    expect(error.message).toBe('Failed to write to storage');
    expect(error.cause).toBeUndefined();
  });

  test('should optionally include cause', () => {
    const rootCause = new Error('Disk full');
    const error: ProviderError = {
      code: 'STORAGE_WRITE_FAILED',
      message: 'Failed to write to storage',
      cause: rootCause
    };

    expect(error.cause).toBe(rootCause);
  });
});

describe('HealthStatus', () => {
  test('should represent healthy status', () => {
    const health: HealthStatus = {
      healthy: true,
      message: 'All systems operational'
    };

    expect(health.healthy).toBe(true);
    expect(health.message).toBe('All systems operational');
  });

  test('should represent unhealthy status', () => {
    const health: HealthStatus = {
      healthy: false,
      message: 'Connection lost'
    };

    expect(health.healthy).toBe(false);
    expect(health.message).toBe('Connection lost');
  });
});

describe('Provider interface', () => {
  test('should enforce required properties and methods', async () => {
    // Mock implementation to verify interface contract
    const mockProvider: Provider = {
      name: 'TestProvider',
      version: '1.0.0',

      async initialize(): Promise<Result<void, ProviderError>> {
        return { ok: true, value: undefined };
      },

      async healthCheck(): Promise<HealthStatus> {
        return { healthy: true, message: 'OK' };
      },

      async shutdown(): Promise<void> {
        // Clean shutdown
      }
    };

    expect(mockProvider.name).toBe('TestProvider');
    expect(mockProvider.version).toBe('1.0.0');

    const initResult = await mockProvider.initialize();
    expect(initResult.ok).toBe(true);

    const health = await mockProvider.healthCheck();
    expect(health.healthy).toBe(true);

    await mockProvider.shutdown();
  });
});
