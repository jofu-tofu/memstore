# Provider Implementation Guide

**Version:** 1.0.0
**Last Updated:** 2026-01-12
**Target Audience:** Weekend contributors, new provider implementers

## Overview

This guide walks you through implementing a new provider for MemStore. Whether you're adding a new storage backend, search strategy, or extraction technique, this guide has you covered.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Provider Types](#provider-types)
3. [Step-by-Step Implementation](#step-by-step-implementation)
4. [Testing Requirements](#testing-requirements)
5. [Registration Process](#registration-process)
6. [Common Patterns](#common-patterns)
7. [Troubleshooting](#troubleshooting)
8. [Examples](#examples)

## Quick Start

**Implementing a provider in 5 steps:**

1. Create a new file in `src/providers/{type}/`
2. Implement the interface (e.g., `StorageProvider`)
3. Write tests in a `.test.ts` file
4. Register the provider in `provider-registry.ts`
5. Run tests and verify integration

**Time estimate:** 2-4 hours for a simple provider

## Provider Types

MemStore has six provider types:

| Type | Interface | Purpose | Example Implementations |
|------|-----------|---------|------------------------|
| **Storage** | `StorageProvider` | Persist segments to durable storage | `file-backend`, `sqlite-backend` (future) |
| **Search** | `SearchProvider` | Query the memory index | `keyword-search`, `semantic-search` (future) |
| **Summarize** | `SummarizeProvider` | Generate summaries and tags | `simple-extract`, `llm-summarize` (future) |
| **Segment** | `SegmentProvider` | Split transcripts into segments | `per-message`, `semantic` (future) |
| **Extract** | `ExtractProvider` | Extract metadata from segments | `keyword-tagger`, `entity-extractor` (future) |
| **Organize** | `OrganizeProvider` | Determine storage paths | `flat-by-date`, `hierarchical-retention` (future) |

Choose the type that matches your use case, then read the interface documentation:
- [StorageProvider](./storage/interface.ts)
- [SearchProvider](./search/interface.ts)
- [SummarizeProvider](./summarize/interface.ts)
- [SegmentProvider](./segment/interface.ts)
- [ExtractProvider](./extract/interface.ts)
- [OrganizeProvider](./organize/interface.ts)

## Step-by-Step Implementation

### Step 1: Set Up Your Files

Create three files in the appropriate provider directory:

```bash
src/providers/{type}/
├── interface.ts           # Already exists
├── my-provider.ts         # Your implementation (NEW)
└── my-provider.test.ts    # Your tests (NEW)
```

**Naming conventions:**
- Use kebab-case for filenames: `my-provider.ts`
- Use PascalCase for class names: `MyProvider`
- Match the provider type: `class MyProvider implements {Type}Provider`

### Step 2: Implement the Interface

**Template for a new provider:**

```typescript
import type { Result, Provider, ProviderError, HealthStatus } from '../../types/common';
import type { {Type}Provider, {Type}Error } from './interface';
// Import other types as needed

/**
 * MyProvider - Brief description of what this provider does
 *
 * Implementation strategy: Describe your approach
 * Use cases: When to use this provider
 */
export class MyProvider implements {Type}Provider {
  readonly name = 'MyProvider';
  readonly version = '1.0.0';

  // Private state
  private initialized = false;
  private resources: any = null;

  /**
   * Initialize the provider
   */
  async initialize(): Promise<Result<void, ProviderError>> {
    if (this.initialized) {
      return { ok: true, value: undefined };
    }

    try {
      // Allocate resources, create directories, load indexes, etc.
      this.resources = await this.setupResources();
      this.initialized = true;
      return { ok: true, value: undefined };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'PROVIDER_INIT_FAILED',
          message: `Failed to initialize ${this.name}`,
          cause: error instanceof Error ? error : new Error(String(error))
        }
      };
    }
  }

  /**
   * Check provider health
   */
  async healthCheck(): Promise<HealthStatus> {
    if (!this.initialized) {
      return {
        healthy: false,
        message: `${this.name} not initialized`
      };
    }

    // Check resources, disk space, connections, etc.
    const healthy = await this.checkResources();

    return {
      healthy,
      message: healthy ? `${this.name} operational` : `${this.name} degraded`,
      details: {
        // Add diagnostic information
        initialized: this.initialized,
        // Add more details as needed
      }
    };
  }

  /**
   * Shutdown the provider
   */
  async shutdown(): Promise<void> {
    try {
      // Close file handles, flush buffers, release resources
      if (this.resources) {
        await this.cleanupResources();
        this.resources = null;
      }
      this.initialized = false;
    } catch (error) {
      // Log error but don't throw - shutdown should never fail
      console.error(`[Memory:${this.name}] Shutdown error:`, error);
    }
  }

  /**
   * Implement provider-specific methods here
   */
  async myProviderMethod(/* params */): Promise<Result</* ReturnType */, {Type}Error>> {
    if (!this.initialized) {
      return {
        ok: false,
        error: {
          code: '{TYPE}_NOT_INITIALIZED',
          message: `${this.name} not initialized - call initialize() first`
        }
      };
    }

    try {
      // Implementation logic here
      const result = await this.doWork();
      return { ok: true, value: result };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: '{TYPE}_OPERATION_FAILED',
          message: 'Operation failed',
          cause: error instanceof Error ? error : new Error(String(error))
        }
      };
    }
  }

  // Private helper methods
  private async setupResources(): Promise<any> {
    // Implementation
  }

  private async checkResources(): Promise<boolean> {
    // Implementation
  }

  private async cleanupResources(): Promise<void> {
    // Implementation
  }

  private async doWork(): Promise<any> {
    // Implementation
  }
}
```

### Step 3: Follow Result Type Pattern

**Critical: NEVER throw exceptions from provider methods.**

All provider methods must return `Result<T, E>` types:

```typescript
// ❌ BAD - Throws exceptions
async store(segment: MemorySegment): Promise<StoreResult> {
  if (!segment.id) {
    throw new Error('Segment ID required'); // DON'T DO THIS
  }
  return await fs.writeFile(path, data); // Can throw
}

// ✅ GOOD - Returns Result types
async store(segment: MemorySegment): Promise<Result<StoreResult, StorageError>> {
  if (!segment.id) {
    return {
      ok: false,
      error: {
        code: 'STORAGE_INVALID_SEGMENT',
        message: 'Segment ID required'
      }
    };
  }

  try {
    await fs.writeFile(path, data);
    return {
      ok: true,
      value: { id: segment.id, path, timestamp: Date.now() }
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'STORAGE_WRITE_FAILED',
        message: 'Failed to write segment to disk',
        cause: error instanceof Error ? error : new Error(String(error))
      }
    };
  }
}
```

### Step 4: Write Tests

Create comprehensive tests in `my-provider.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { MyProvider } from './my-provider';

describe('MyProvider', () => {
  let provider: MyProvider;

  beforeEach(async () => {
    provider = new MyProvider();
    const result = await provider.initialize();
    expect(result.ok).toBe(true);
  });

  afterEach(async () => {
    await provider.shutdown();
  });

  describe('Lifecycle', () => {
    test('should initialize successfully', async () => {
      const fresh = new MyProvider();
      const result = await fresh.initialize();
      expect(result.ok).toBe(true);
      await fresh.shutdown();
    });

    test('should be idempotent on multiple initialize calls', async () => {
      const result = await provider.initialize();
      expect(result.ok).toBe(true);
    });

    test('should pass health check after initialization', async () => {
      const health = await provider.healthCheck();
      expect(health.healthy).toBe(true);
    });

    test('should fail health check before initialization', async () => {
      const fresh = new MyProvider();
      const health = await fresh.healthCheck();
      expect(health.healthy).toBe(false);
    });

    test('should shutdown gracefully', async () => {
      await expect(provider.shutdown()).resolves.not.toThrow();
    });
  });

  describe('Provider Methods', () => {
    test('should handle valid input', async () => {
      const result = await provider.myMethod(validInput);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeDefined();
      }
    });

    test('should handle invalid input', async () => {
      const result = await provider.myMethod(invalidInput);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('EXPECTED_ERROR_CODE');
      }
    });

    test('should handle edge cases', async () => {
      // Empty input
      const emptyResult = await provider.myMethod('');
      expect(emptyResult.ok).toBe(true);

      // Large input
      const largeResult = await provider.myMethod(largeInput);
      expect(largeResult.ok).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should return error for uninitialized provider', async () => {
      const fresh = new MyProvider();
      const result = await fresh.myMethod(validInput);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toMatch(/_NOT_INITIALIZED$/);
      }
      await fresh.shutdown();
    });

    test('should handle resource failures gracefully', async () => {
      // Simulate resource failure
      const result = await provider.myMethod(failingInput);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBeDefined();
        expect(result.error.cause).toBeDefined();
      }
    });
  });
});
```

### Step 5: Register Your Provider

Add your provider to the provider registry in `src/core/register-providers.ts`:

```typescript
import { MyProvider } from '../providers/{type}/my-provider';

export async function registerDefaultProviders(registry: ProviderRegistry): Promise<void> {
  // Existing registrations...

  // Register MyProvider
  await registry.register('{type}', 'my-provider', new MyProvider());
}
```

Or use dynamic registration in your application code:

```typescript
import { getProviderRegistry } from './core/provider-registry';
import { MyProvider } from './providers/{type}/my-provider';

const registry = getProviderRegistry();
await registry.register('{type}', 'my-provider', new MyProvider());
```

## Testing Requirements

### Minimum Test Coverage

Every provider must have tests for:

1. ✅ **Lifecycle Methods**
   - `initialize()` succeeds
   - `initialize()` is idempotent
   - `healthCheck()` returns healthy after init
   - `healthCheck()` returns unhealthy before init
   - `shutdown()` completes without errors

2. ✅ **Provider-Specific Methods**
   - Valid input succeeds
   - Invalid input returns error
   - Edge cases (empty, null, large)
   - Concurrent operations (if applicable)

3. ✅ **Error Handling**
   - Uninitialized provider returns error
   - Resource failures return error (not throw)
   - Error codes are correct
   - Error messages are informative

4. ✅ **Result Types**
   - Success returns `{ ok: true, value: T }`
   - Failure returns `{ ok: false, error: E }`
   - Never throws exceptions

### Running Tests

```bash
# Run all provider tests
bun test hooks/memory/providers/

# Run specific provider tests
bun test src/providers/{type}/my-provider.test.ts

# Run with coverage
bun test --coverage hooks/memory/providers/
```

### Test Quality Standards

- **Arrange-Act-Assert**: Structure tests clearly
- **One assertion per test**: Keep tests focused
- **Descriptive names**: `test('should return error when segment ID is missing')`
- **Clean state**: Use `beforeEach`/`afterEach` for setup/teardown
- **No external dependencies**: Mock file system, network, etc.
- **Fast execution**: All provider tests should run in < 1 second

## Registration Process

### Provider Registry Pattern

MemStore uses a centralized provider registry:

```typescript
// Get the registry
const registry = getProviderRegistry();

// Register a provider
await registry.register('storage', 'my-backend', new MyStorageBackend());

// Load a provider
const result = await registry.load('storage', 'my-backend');
if (result.ok) {
  const provider = result.value;
  await provider.initialize();
}

// List available providers
const providers = await registry.list('storage');
```

### Default Provider Registration

Add to `src/core/register-providers.ts`:

```typescript
export async function registerDefaultProviders(registry: ProviderRegistry): Promise<void> {
  // Storage providers
  await registry.register('storage', 'file-backend', new FileBackend());
  await registry.register('storage', 'my-backend', new MyBackend()); // NEW

  // Search providers
  await registry.register('search', 'keyword-search', new KeywordSearch());

  // ... other providers
}
```

### Configuration-Based Registration

Support configuration-driven provider selection:

```yaml
# config.yaml
providers:
  storage: my-backend  # Use your provider
  search: keyword-search
  summarize: simple-extract
```

```typescript
// Load from config
const config = await loadConfig();
const storageProvider = await registry.load('storage', config.providers.storage);
```

## Common Patterns

### Pattern 1: Idempotent Initialization

```typescript
async initialize(): Promise<Result<void, ProviderError>> {
  if (this.initialized) {
    return { ok: true, value: undefined };
  }

  try {
    // Setup logic
    this.initialized = true;
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: this.toProviderError(error, 'INIT_FAILED') };
  }
}
```

### Pattern 2: Early Return for Uninitialized

```typescript
async myMethod(): Promise<Result<T, E>> {
  if (!this.initialized) {
    return {
      ok: false,
      error: {
        code: 'PROVIDER_NOT_INITIALIZED',
        message: `${this.name} not initialized`
      }
    };
  }

  // Method implementation...
}
```

### Pattern 3: Error Conversion Helper

```typescript
private toProviderError(error: unknown, code: string): ProviderError {
  return {
    code: `${this.name.toUpperCase()}_${code}`,
    message: error instanceof Error ? error.message : String(error),
    cause: error instanceof Error ? error : new Error(String(error))
  };
}
```

### Pattern 4: Resource Cleanup in Shutdown

```typescript
async shutdown(): Promise<void> {
  try {
    // Close handles
    await this.closeFileHandles();

    // Cancel pending operations
    this.pendingOps.forEach(op => op.cancel());

    // Clear state
    this.initialized = false;
  } catch (error) {
    // Log but don't throw
    console.error(`[Memory:${this.name}] Shutdown error:`, error);
  }
}
```

### Pattern 5: Health Check with Details

```typescript
async healthCheck(): Promise<HealthStatus> {
  const checks = {
    initialized: this.initialized,
    resourcesAvailable: await this.checkResources(),
    diskSpace: await this.checkDiskSpace()
  };

  const healthy = Object.values(checks).every(Boolean);

  return {
    healthy,
    message: healthy ? 'Operational' : 'Degraded',
    details: checks
  };
}
```

## Troubleshooting

### Common Issues

#### Issue: "Provider not initialized" errors

**Cause:** Calling provider methods before `initialize()`

**Solution:**
```typescript
// Always initialize before use
await provider.initialize();
await provider.myMethod();
```

#### Issue: Tests fail with "Cannot find module"

**Cause:** Import paths are incorrect

**Solution:**
```typescript
// Use relative imports
import type { Result } from '../../types/common';
import type { MyProvider } from './interface';
```

#### Issue: TypeScript compilation errors

**Cause:** Missing interface implementations

**Solution:**
```typescript
// Implement ALL interface methods
export class MyProvider implements StorageProvider {
  // Must implement: name, version, initialize, healthCheck, shutdown
  // Plus all StorageProvider methods
}
```

#### Issue: Provider registry can't find provider

**Cause:** Not registered or wrong type/name

**Solution:**
```typescript
// Check registration
await registry.register('storage', 'my-provider', new MyProvider());
// ^^^^^ Correct type    ^^^^^^^^^^^ Correct name
```

#### Issue: Result type errors

**Cause:** Returning wrong Result structure

**Solution:**
```typescript
// ❌ Wrong
return { success: true, data: value };

// ✅ Correct
return { ok: true, value: value };
```

### Debug Mode

Enable debug logging for your provider:

```typescript
export class MyProvider implements StorageProvider {
  private debug = false;

  constructor(options?: { debug?: boolean }) {
    this.debug = options?.debug ?? false;
  }

  async myMethod(): Promise<Result<T, E>> {
    if (this.debug) {
      console.log(`[Memory:${this.name}] myMethod called`);
    }
    // Implementation...
  }
}
```

## Examples

### Example 1: Simple Storage Provider

See [file-backend.ts](./storage/file-backend.ts) for a complete reference implementation.

### Example 2: Search Provider

See [keyword-search.ts](./search/keyword-search.ts) for keyword-based search.

### Example 3: Summarize Provider

See [simple-extract.ts](./summarize/simple-extract.ts) for basic summarization.

### Example 4: Custom Error Codes

```typescript
export interface MyProviderError extends ProviderError {
  code:
    | 'MY_PROVIDER_INIT_FAILED'
    | 'MY_PROVIDER_CONNECTION_LOST'
    | 'MY_PROVIDER_QUOTA_EXCEEDED'
    | 'MY_PROVIDER_INVALID_INPUT';
}
```

### Example 5: Provider with Configuration

```typescript
export interface MyProviderConfig {
  apiKey: string;
  endpoint: string;
  timeout?: number;
}

export class MyProvider implements SearchProvider {
  constructor(private config: MyProviderConfig) {}

  async initialize(): Promise<Result<void, ProviderError>> {
    // Validate config
    if (!this.config.apiKey) {
      return {
        ok: false,
        error: {
          code: 'MY_PROVIDER_INVALID_CONFIG',
          message: 'API key required'
        }
      };
    }
    // Initialize with config...
  }
}
```

## Next Steps

1. **Read the interface documentation** for your provider type
2. **Study reference implementations** in the same provider category
3. **Start with a simple implementation** - you can enhance it later
4. **Write tests first** - TDD approach helps clarify requirements
5. **Ask for help** - Open a GitHub issue if you get stuck

## Additional Resources

- [Provider Interface Contracts](./storage/interface.ts) - All interface definitions
- [Versioning Policy](./VERSIONING_POLICY.md) - Interface stability commitments
- [Architecture Documentation](../../../_bmad-output/planning-artifacts/architecture.md) - System design
- [Type Definitions](../types/common.ts) - Result types, Provider base interface

## Contributing

Found an error in this guide? Have a suggestion?

1. Open an issue: [GitHub Issues](https://github.com/your-repo/issues)
2. Submit a PR with improvements
3. Join discussions in the community forums

---

**Happy coding! We can't wait to see what providers you build. 🚀**
