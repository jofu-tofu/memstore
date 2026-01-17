# Test Harness Architecture Design

**Story**: 5.3 Provider Test Harness
**Date**: 2026-01-12
**Status**: Implementation Ready

## Overview

Reusable contract testing framework that validates provider implementations against interface specifications from Story 5.2.

## Design Principles

1. **Reusability**: Single function call runs full contract test suite
2. **Clarity**: Failure messages clearly indicate contract violations
3. **Performance**: Full suite completes in <10 seconds (NFR-M3)
4. **Isolation**: Each test run is independent with thorough cleanup
5. **Type Safety**: Assertion helpers validate Result types

## Architecture

### Core Components

```
test-harness/
├── base-harness.ts          # Shared utilities
├── harness-types.ts         # Type definitions
├── storage-harness.ts       # StorageProvider tests
├── search-harness.ts        # SearchProvider tests
├── summarize-harness.ts     # SummarizeProvider tests
├── segment-harness.ts       # SegmentProvider tests
├── extract-harness.ts       # ExtractProvider tests
├── organize-harness.ts      # OrganizeProvider tests
├── index.ts                 # Barrel exports
├── README.md                # Usage documentation
└── examples/                # Usage examples
    ├── new-storage-provider.example.test.ts
    └── new-search-provider.example.test.ts
```

### Harness API Pattern

Each provider type has a `runXProviderTests()` function:

```typescript
export function runStorageProviderTests(
  ProviderClass: new (...args: any[]) => StorageProvider,
  options?: HarnessOptions
): void {
  describe(`${ProviderClass.name} (StorageProvider Contract)`, () => {
    // Lifecycle setup
    // Contract tests
    // Cleanup
  });
}
```

**Usage**:
```typescript
import { runStorageProviderTests } from '../test-harness/storage-harness';
import { FileBackend } from './file-backend';

describe('FileBackend', () => {
  runStorageProviderTests(FileBackend);

  // Optional: custom tests
  test('custom behavior', () => { /* ... */ });
});
```

### Harness Options

```typescript
interface HarnessOptions {
  cleanupBeforeEach?: boolean;    // Clean test data between tests
  testDataPath?: string;          // Custom test directory
  debug?: boolean;                // Enable verbose logging
}
```

### Test Isolation Strategy

**Per-test cleanup**:
```typescript
beforeAll(() => {
  testDir = join(homedir(), `pai-test-${ProviderClass.name.toLowerCase()}`);
  mkdirSync(testDir, { recursive: true });
});

beforeEach(async () => {
  provider = new ProviderClass({ storePath: testDir });
  await provider.initialize();
});

afterEach(async () => {
  await provider.shutdown();
  if (options?.cleanupBeforeEach) {
    // Clean test data
  }
});

afterAll(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});
```

### Failure Message Format

Clear, actionable failure messages referencing interface contracts:

```
✗ StorageProvider.retrieve() should return null for non-existent IDs
  Expected: { ok: true, value: null }
  Actual: { ok: false, error: { code: 'STORAGE_NOT_FOUND' } }
  Contract: retrieve() must return null for missing IDs, not an error
  See: providers/storage/interface.ts:89-97
```

## Shared Utilities (base-harness.ts)

### Result Type Assertion Helpers

```typescript
export function expectOk<T, E>(result: Result<T, E>): asserts result is { ok: true; value: T } {
  expect(result.ok).toBe(true);
}

export function expectError<T, E>(result: Result<T, E>): asserts result is { ok: false; error: E } {
  expect(result.ok).toBe(false);
}
```

**Benefits**:
- Type-safe Result unwrapping
- Clear failure messages
- TypeScript narrows type after assertion

### Test Data Factories

```typescript
export function createTestSegment(overrides?: Partial<MemorySegment>): MemorySegment {
  return {
    id: `seg_test_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    sessionId: `mem_test_${Date.now()}`,
    timestamp: Date.now(),
    importanceScore: 50,
    accessCount: 0,
    lastAccessed: null,
    tags: ['test', 'typescript'],
    memoryType: 'episodic',
    sourceRange: { start: 0, end: 100 },
    content: 'Test content for provider validation',
    ...overrides
  };
}

export function createTestSession(): string {
  return `mem_test_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
```

**Benefits**:
- Consistent test data
- Easy customization with overrides
- Unique IDs prevent test pollution

### Cleanup Utilities

```typescript
export function cleanTestDirectory(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }
}
```

## Contract Test Coverage

### StorageProvider (17 tests)

- ✓ initialize() returns Result<void, ProviderError>
- ✓ store() persists segment and returns StoreResult
- ✓ retrieve() returns existing segment
- ✓ retrieve() returns null for non-existent ID (null-not-error pattern)
- ✓ query() filters by tags (OR logic)
- ✓ query() filters by recency
- ✓ query() filters by importance
- ✓ query() filters by accessCount
- ✓ update() merges partial updates
- ✓ update() increments accessCount (not replace)
- ✓ delete() removes segment
- ✓ delete() is idempotent (delete twice doesn't fail)
- ✓ healthCheck() returns HealthStatus
- ✓ shutdown() completes without error
- ✓ Errors return Result errors (no exceptions)
- ✓ Error codes match interface specifications
- ✓ All methods return correct Result types

### SearchProvider (10 tests)

- ✓ initialize() succeeds
- ✓ search() accepts query and returns SearchResult[]
- ✓ search() respects maxResults option
- ✓ search() respects minMatchCount option
- ✓ search() handles empty query (returns empty array)
- ✓ search() handles no matches (returns empty array, not error)
- ✓ SearchResult includes segmentId, matchCount, matchedTerms
- ✓ healthCheck() returns valid status
- ✓ Error cases return Result errors
- ✓ Error codes match interface specifications

### SummarizeProvider (9 tests)

- ✓ initialize() succeeds
- ✓ summarize() enriches segment with summary field
- ✓ summarize() enriches segment with tags array
- ✓ summarize() preserves original content
- ✓ summarize() handles empty content gracefully
- ✓ summarize() returns Result<MemorySegment, SummarizeError>
- ✓ healthCheck() returns valid status
- ✓ Error cases return Result errors
- ✓ Error codes match interface specifications

### SegmentProvider (10 tests)

- ✓ initialize() succeeds
- ✓ segment() accepts transcript and sessionId
- ✓ segment() returns Result<MemorySegment[], SegmentError>
- ✓ segment() returns empty array for empty transcript
- ✓ segment() assigns unique IDs to segments
- ✓ segment() sets sessionId on all segments
- ✓ segment() sets sourceRange on all segments
- ✓ healthCheck() returns valid status
- ✓ Error cases return Result errors
- ✓ Error codes match interface specifications

### ExtractProvider (8 tests)

- ✓ initialize() succeeds
- ✓ extract() enriches segment with metadata
- ✓ extract() preserves original content
- ✓ extract() handles empty content gracefully
- ✓ extract() returns Result<MemorySegment, ExtractError>
- ✓ healthCheck() returns valid status
- ✓ Error cases return Result errors
- ✓ Error codes match interface specifications

### OrganizeProvider (7 tests)

- ✓ initialize() succeeds
- ✓ getPath() returns valid file paths
- ✓ getPath() format matches documented pattern
- ✓ getPath() handles different segment types
- ✓ healthCheck() returns valid status
- ✓ Error cases return Result errors
- ✓ Error codes match interface specifications

**Total: 61 contract tests across 6 provider types**

## Performance Strategy

**Target**: Full test suite <10 seconds (NFR-M3)

**Optimizations**:
1. **Parallel Execution**: Leverage bun:test parallelism
2. **Fast Test Data**: Small datasets, minimal I/O
3. **Efficient Cleanup**: Only clean what's necessary
4. **In-Memory When Possible**: Mock heavy operations

## Integration with Existing Tests

**Optional Pattern**:
```typescript
// file-backend.test.ts
import { runStorageProviderTests } from '../test-harness/storage-harness';
import { FileBackend } from './file-backend';

describe('FileBackend', () => {
  // Run contract tests
  runStorageProviderTests(FileBackend);

  // Implementation-specific tests
  describe('file-backend specific', () => {
    test('organizes files by date', async () => {
      // ...
    });
  });
});
```

**Non-Breaking**: Existing tests can optionally integrate harness without modification.

## Documentation Strategy

### README.md Sections

1. **Overview**: What is the test harness
2. **Quick Start**: Minimal example for each provider type
3. **Harness Options**: Configuration reference
4. **Contract Coverage**: What each harness validates
5. **Failure Interpretation**: How to read error messages
6. **Custom Tests**: Adding provider-specific tests
7. **Troubleshooting**: Common issues and solutions

### Example Files

- `new-storage-provider.example.test.ts`: Complete working example
- `new-search-provider.example.test.ts`: Search provider example

## Success Criteria

✓ Single function call runs full contract suite
✓ Clear failure messages with interface references
✓ Full suite completes in <10 seconds
✓ No test pollution between runs
✓ Comprehensive documentation with examples
✓ All existing providers pass contract tests
