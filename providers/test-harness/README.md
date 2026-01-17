# Provider Test Harness

Automated contract testing for PAI Memory System provider implementations.

## Overview

The Provider Test Harness validates that provider implementations comply with their interface contracts. Each provider type has a dedicated test harness that validates:

- **Lifecycle methods**: `initialize()`, `healthCheck()`, `shutdown()`
- **Provider-specific methods**: Implementation-specific operations
- **Error handling**: Result types, no thrown exceptions
- **Edge cases**: Empty inputs, invalid data, graceful degradation

## Quick Start

### Running Contract Tests for Your Provider

```typescript
import { runStorageProviderTests } from '../test-harness';
import { MyStorageBackend } from './my-storage-backend';

describe('MyStorageBackend', () => {
  runStorageProviderTests(MyStorageBackend);
});
```

That's it! The harness will run ~17 contract tests validating your implementation.

## Available Harnesses

### 1. StorageProvider (`storage-harness.ts`)

Validates storage provider implementations (Story 5.2).

**Contract Tests:**
- `initialize()` completes without error
- `store()` persists segments correctly
- `retrieve()` returns stored data
- `retrieve()` returns `null` for non-existent IDs (not an error)
- `query()` filters by tags, recency, importance, accessCount
- `update()` merges segment updates
- `update()` increments accessCount if not explicitly set
- `delete()` removes segments
- `delete()` is idempotent (deleting twice doesn't fail)
- `healthCheck()` returns valid HealthStatus
- `shutdown()` completes cleanup
- Error cases return Result errors, not exceptions

**Usage:**
```typescript
import { runStorageProviderTests } from '../test-harness/storage-harness';
import { FileBackend } from './file-backend';

describe('FileBackend', () => {
  runStorageProviderTests(FileBackend, {
    cleanupBeforeEach: true,
    testDataPath: './.test-data'
  });
});
```

### 2. SearchProvider (`search-harness.ts`)

Validates search provider implementations (Story 5.2).

**Contract Tests:**
- `initialize()` succeeds
- `search()` accepts query string and SearchOptions
- `search()` returns `Result<SearchResult[], SearchError>`
- `search()` respects `maxResults` option
- `search()` respects `minMatchCount` option
- `search()` handles empty queries (returns empty array)
- `search()` handles no matches (returns empty array, not error)
- `healthCheck()` returns valid status
- Error cases return Result errors

**Usage:**
```typescript
import { runSearchProviderTests } from '../test-harness/search-harness';
import { KeywordSearch } from './keyword-search';

describe('KeywordSearch', () => {
  runSearchProviderTests(KeywordSearch);
});
```

### 3. SummarizeProvider (`summarize-harness.ts`)

Validates summarize provider implementations (Story 5.2).

**Contract Tests:**
- `initialize()` succeeds
- `summarize()` accepts MemorySegment
- `summarize()` returns `Result<MemorySegment, SummarizeError>`
- `summarize()` enriches summary field
- `summarize()` enriches tags array
- `summarize()` preserves original content
- `summarize()` handles empty content gracefully
- `healthCheck()` returns valid status
- Error cases return Result errors

**Usage:**
```typescript
import { runSummarizeProviderTests } from '../test-harness/summarize-harness';
import { SimpleExtractProvider } from './simple-extract';

describe('SimpleExtractProvider', () => {
  runSummarizeProviderTests(SimpleExtractProvider);
});
```

### 4. SegmentProvider (`segment-harness.ts`)

Validates segment provider implementations (Story 5.2).

**Contract Tests:**
- `initialize()` succeeds
- `segment()` accepts transcript string and sessionId
- `segment()` returns `Result<MemorySegment[], SegmentError>`
- `segment()` returns empty array for empty transcript (not error)
- `segment()` assigns unique IDs to each segment
- `segment()` sets sessionId on all segments
- `segment()` sets sourceRange on all segments
- `healthCheck()` returns valid status
- Error cases return Result errors

**Usage:**
```typescript
import { runSegmentProviderTests } from '../test-harness/segment-harness';
import { PerMessageSegmentProvider } from './per-message';

describe('PerMessageSegmentProvider', () => {
  runSegmentProviderTests(PerMessageSegmentProvider);
});
```

### 5. ExtractProvider (`extract-harness.ts`)

Validates extract provider implementations (Story 5.2).

**Contract Tests:**
- `initialize()` succeeds
- `extract()` accepts MemorySegment
- `extract()` returns `Result<MemorySegment, ExtractError>`
- `extract()` enriches segment with metadata
- `extract()` preserves original content
- `extract()` handles empty content gracefully
- `healthCheck()` returns valid status
- Error cases return Result errors

**Usage:**
```typescript
import { runExtractProviderTests } from '../test-harness/extract-harness';
import { KeywordTaggerProvider } from './keyword-tagger';

describe('KeywordTaggerProvider', () => {
  runExtractProviderTests(KeywordTaggerProvider);
});
```

### 6. OrganizeProvider (`organize-harness.ts`)

Validates organize provider implementations (Story 5.2).

**Contract Tests:**
- `initialize()` succeeds
- `organize()` returns valid file paths
- `organize()` returns `Result<string, OrganizeError>`
- Path format matches documented pattern
- Different timestamps handled consistently
- Invalid timestamps handled gracefully
- `healthCheck()` returns valid status
- Error cases return Result errors

**Usage:**
```typescript
import { runOrganizeProviderTests } from '../test-harness/organize-harness';
import { FlatByDateOrganizeProvider } from './flat-by-date';

describe('FlatByDateOrganizeProvider', () => {
  runOrganizeProviderTests(FlatByDateOrganizeProvider);
});
```

## Harness Options

All harnesses accept an optional options object:

```typescript
interface HarnessOptions {
  /**
   * Clean test data between each test (default: false)
   */
  cleanupBeforeEach?: boolean;

  /**
   * Custom test data path (default: ~/pai-test-{provider-name})
   */
  testDataPath?: string;
}
```

**Example:**
```typescript
runStorageProviderTests(MyBackend, {
  cleanupBeforeEach: true,
  testDataPath: join(__dirname, '.test-data')
});
```

## Understanding Failure Messages

Contract test failures provide clear, actionable information:

```
✗ StorageProvider.retrieve() should return null for non-existent IDs
  Expected: { ok: true, value: null }
  Actual: { ok: false, error: { code: 'STORAGE_NOT_FOUND' } }
```

**Common Failures:**

### 1. Wrong Return Type

```
✗ Expected result.ok to be true
```
**Fix:** Ensure method returns `{ ok: true, value: ... }` on success.

### 2. Missing Error Result

```
✗ Expected result.error to be defined
```
**Fix:** Return `{ ok: false, error: { code, message } }` instead of throwing.

### 3. Missing Metadata Field

```
✗ Expected healthCheck() to have property 'message'
```
**Fix:** Return `{ healthy: true, message: 'Provider operational' }`.

### 4. Thrown Exception

```
✗ Uncaught Error: Cannot read property...
```
**Fix:** Wrap operations in try-catch, return Result errors instead of throwing.

## Adding Custom Tests

Contract tests validate the interface. Add custom tests for implementation-specific behavior:

```typescript
import { runStorageProviderTests } from '../test-harness/storage-harness';
import { SQLiteBackend } from './sqlite-backend';

describe('SQLiteBackend', () => {
  // Run contract tests
  runStorageProviderTests(SQLiteBackend);

  // Custom implementation-specific tests
  describe('SQLite-specific behavior', () => {
    test('should create database file on initialize', async () => {
      // Custom test for SQLite-specific behavior
    });

    test('should handle connection pooling', async () => {
      // Custom test for connection management
    });
  });
});
```

## Test Utilities

The harness provides shared utilities:

### Assertion Helpers

```typescript
import { expectOk, expectError } from './base-harness';

// Assert Result is ok and narrow type
const result = await provider.store(segment);
expectOk(result);
expect(result.value.id).toBeDefined(); // TypeScript knows value exists

// Assert Result is error and narrow type
const errorResult = await provider.invalidOp();
expectError(errorResult);
expect(errorResult.error.code).toBeDefined(); // TypeScript knows error exists
```

### Test Data Factories

```typescript
import { createTestSegment, createTestSession } from './base-harness';

// Create test segment with defaults
const segment = createTestSegment();

// Override specific fields
const customSegment = createTestSegment({
  tags: ['custom', 'test'],
  importanceScore: 80
});

// Create unique session ID
const sessionId = createTestSession();
```

### Cleanup Utilities

```typescript
import { cleanTestDirectory, removeTestDirectory } from './base-harness';

// Clean (remove and recreate) directory
beforeEach(() => {
  cleanTestDirectory(testDir);
});

// Remove directory completely
afterAll(() => {
  removeTestDirectory(testDir);
});
```

## Performance Expectations

**Full test suite must complete in < 10 seconds** (NFR-M3).

**Optimization strategies:**
- Use in-memory providers for fast tests where possible
- Minimize disk I/O in test setup/teardown
- Run tests in parallel (bun:test default)
- Use small test datasets
- Avoid sleep/wait in tests

**Current performance:**
- All harness tests: ~40 tests in < 100ms
- Storage harness: 21 tests in ~50ms
- Search harness: 10 tests in ~30ms
- Summarize harness: 11 tests in ~40ms
- Segment harness: 10 tests in ~35ms
- Extract harness: 10 tests in ~35ms
- Organize harness: 9 tests in ~30ms

## Test Framework: bun:test

This project uses `bun:test`, **NOT Jest**.

**Correct imports:**
```typescript
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
```

**Wrong (don't use):**
```typescript
import { describe, it, expect } from '@jest/globals'; // ❌ WRONG
```

## Contract Violations and Fixes

### Common Contract Violations

**1. Throwing exceptions instead of returning Result errors**

❌ **Wrong:**
```typescript
async store(segment: MemorySegment): Promise<Result<StoreResult, StorageError>> {
  throw new Error('Storage failed'); // ❌ Contract violation
}
```

✅ **Correct:**
```typescript
async store(segment: MemorySegment): Promise<Result<StoreResult, StorageError>> {
  try {
    // ... operation
    return { ok: true, value: { id, path } };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'STORAGE_WRITE_FAILED',
        message: `Failed to store: ${(error as Error).message}`,
        cause: error as Error
      }
    };
  }
}
```

**2. Returning error for missing data instead of null**

❌ **Wrong:**
```typescript
async retrieve(id: string): Promise<Result<MemorySegment | null, StorageError>> {
  if (!exists(id)) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Segment not found' } }; // ❌
  }
}
```

✅ **Correct:**
```typescript
async retrieve(id: string): Promise<Result<MemorySegment | null, StorageError>> {
  if (!exists(id)) {
    return { ok: true, value: null }; // ✅ Null is not an error
  }
  // ... return segment
}
```

**3. Missing HealthStatus.message field**

❌ **Wrong:**
```typescript
async healthCheck(): Promise<HealthStatus> {
  return { healthy: true }; // ❌ Missing message
}
```

✅ **Correct:**
```typescript
async healthCheck(): Promise<HealthStatus> {
  return { healthy: true, message: 'Provider operational' }; // ✅
}
```

**4. Wrong shutdown() return type**

❌ **Wrong:**
```typescript
async shutdown(): Promise<void> { // ❌ Wrong return type
  // cleanup
}
```

✅ **Correct:**
```typescript
async shutdown(): Promise<Result<void, ProviderError>> { // ✅
  return { ok: true, value: undefined };
}
```

## Troubleshooting

### "Expected result.ok to be true"

**Cause:** Method returned error Result when success was expected.

**Fix:** Check error message in `result.error.message` for details.

### "Expected result.error to be defined"

**Cause:** Method returned success when test expected error.

**Fix:** Verify test conditions - may indicate graceful error handling (which is good!).

### "Uncaught Error" or thrown exception

**Cause:** Provider threw exception instead of returning Result error.

**Fix:** Wrap all operations in try-catch, return Result errors.

### Tests fail with file permission errors

**Cause:** Test directory cleanup failed or conflicts with running provider.

**Fix:** Ensure `shutdown()` is called in `afterEach()`, verify test isolation.

### Tests are slow (> 10 seconds)

**Cause:** Too much disk I/O or synchronous operations.

**Fix:** Use in-memory test backends, minimize file operations, parallelize tests.

## Examples Directory

See `examples/` for complete working examples:

- `examples/new-storage-provider.example.test.ts` - Storage provider test setup
- `examples/new-search-provider.example.test.ts` - Search provider test setup

## Integration with Existing Tests

Contract tests can be added to existing provider test files:

```typescript
// file-backend.test.ts
import { describe, test } from 'bun:test';
import { runStorageProviderTests } from '../test-harness/storage-harness';
import { FileBackend } from './file-backend';

describe('FileBackend', () => {
  // Contract tests (validates interface compliance)
  runStorageProviderTests(FileBackend);

  // Existing implementation-specific tests
  describe('file-backend specific tests', () => {
    test('should organize files by date', async () => {
      // ...
    });
  });
});
```

## References

- **Provider Interfaces:** `hooks/memory/providers/*/interface.ts`
- **Implementation Guide:** `hooks/memory/providers/IMPLEMENTATION_GUIDE.md`
- **Versioning Policy:** `hooks/memory/providers/VERSIONING_POLICY.md`
- **Story 5.2:** Provider Interface Contracts (comprehensive interface documentation)
- **Story 5.3:** Provider Test Harness (this implementation)

## Contributing

When adding new provider types:

1. Create interface in `providers/{type}/interface.ts`
2. Create test harness in `test-harness/{type}-harness.ts`
3. Export harness in `test-harness/index.ts`
4. Add documentation section to this README
5. Create example test file
6. Update IMPLEMENTATION_GUIDE.md to reference test harness

## FAQ

**Q: Do I need to write tests for my provider?**
A: No! The contract harness tests the interface compliance. You only need to call `runXProviderTests(YourProvider)` and the harness handles the rest.

**Q: Can I skip contract tests?**
A: No. All providers must pass contract tests to ensure system-wide compatibility.

**Q: What if my provider has extra methods?**
A: Contract tests validate the interface. Add custom tests for extra methods.

**Q: How do I test error cases?**
A: Contract tests cover error handling. Your provider just needs to return proper Result errors.

**Q: Can I customize test harness behavior?**
A: Use `HarnessOptions` to configure cleanup, test paths, etc. For more control, fork the harness.

**Q: Tests pass locally but fail in CI?**
A: Check file paths (Windows vs Unix), test isolation (cleanup), and timing issues.
