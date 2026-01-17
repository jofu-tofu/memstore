# Organize Provider Documentation

**Provider Type:** `OrganizeProvider`
**Interface Version:** 1.0.0
**Purpose:** Determine storage path strategies for memory segments

## Quick Reference

**When to use:** During storage to determine file paths
**What it does:** Returns storage path for segment
**Current implementations:** `flat-by-date` (chronological)
**Example implementations:** `hierarchical-retention.example.ts` (tiered)

## Overview

Organization providers determine where memory segments are stored. The organization strategy affects:
- File system browsability
- Retention policy enforcement
- Query performance
- Lifecycle management

## When to Use Different Implementations

### Flat-by-Date (`flat-by-date.ts`) ✅ Implemented

**Strategy:** `segments/{YYYY-MM}/`
**Best for:** Simple chronological organization
**Pros:** Easy to browse by time, simple implementation
**Cons:** No retention policy, all memories treated equally

### Hierarchical Retention (`hierarchical-retention.example.ts`) 📝 Future Example

**Strategy:** `short-term/`, `long-term/`, `archive/`
**Best for:** Retention policies, lifecycle management
**Pros:** Automatic lifecycle, query optimization, retention enforcement
**Cons:** More complex, requires importance scoring
**Status:** Not yet implemented - planned example

### Topic-Based (Future) 🔮

**Strategy:** Organize by tags/topics
**Best for:** Topic-focused browsing
**Pros:** Semantic organization
**Cons:** Multi-tag complexity, reorganization overhead

## Interface Reference

```typescript
interface OrganizeProvider extends Provider {
  organize(segment: MemorySegment): Promise<Result<string, OrganizeError>>;
}
```

**Input:** Memory segment with metadata
**Output:** Relative storage path (e.g., `short-term/2026-01/`)
**Errors:** `ORGANIZE_PATH_FAILED`, `ORGANIZE_INVALID_SEGMENT`

See [interface.ts](./interface.ts) for details.

## Implementation Guide

### Basic Pattern

```typescript
export class MyOrganizer implements OrganizeProvider {
  readonly name = 'MyOrganizer';
  readonly version = '1.0.0';
  private initialized = false;

  async initialize(): Promise<Result<void, ProviderError>> {
    this.initialized = true;
    return { ok: true, value: undefined };
  }

  async organize(segment: MemorySegment): Promise<Result<string, OrganizeError>> {
    if (!this.initialized) {
      return { ok: false, error: { code: 'ORGANIZE_NOT_INITIALIZED', message: 'Not initialized' } };
    }

    if (!segment.timestamp) {
      return { ok: false, error: { code: 'ORGANIZE_INVALID_SEGMENT', message: 'Missing timestamp' } };
    }

    try {
      const path = this.determinePath(segment);
      return { ok: true, value: path };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'ORGANIZE_PATH_FAILED',
          message: 'Failed to determine path',
          cause: error instanceof Error ? error : new Error(String(error))
        }
      };
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    return { healthy: this.initialized, message: 'Operational' };
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  private determinePath(segment: MemorySegment): string {
    // Your path generation logic
    // Return relative path like "short-term/2026-01/"
  }
}
```

## Examples

### Reference: flat-by-date.ts

Simple chronological organization. See [flat-by-date.ts](./flat-by-date.ts).

### Example: hierarchical-retention.example.ts (Future)

Multi-tier storage organization. **Note:** This example has not been implemented yet.

**Planned key features:**
- Hot/warm/cold storage tiers
- Automatic lifecycle transitions
- Retention policy enforcement
- Query path optimization

**Planned tiers:**
- **short-term/:** Last 7 days, frequently accessed
- **long-term/:** 8-90 days, occasionally accessed
- **archive/:** 90+ days, rarely accessed

## Testing

```typescript
import { runOrganizeProviderTests } from '../test-harness/organize-harness';
import { MyOrganizer } from './my-organizer';

describe('MyOrganizer', () => {
  runOrganizeProviderTests(MyOrganizer);
});
```

Contract tests validate:
- ✅ Returns valid path string
- ✅ Handles segments with different timestamps
- ✅ Paths are consistent (same input = same output)

## Path Generation Strategies

### Chronological

```typescript
const date = new Date(segment.timestamp);
const year = date.getFullYear();
const month = String(date.getMonth() + 1).padStart(2, '0');
return `segments/${year}-${month}/`;
```

### Retention-Based

```typescript
const age = Date.now() - segment.timestamp;
const days = age / (1000 * 60 * 60 * 24);

if (days < 7) return 'short-term/';
if (days < 90) return 'long-term/';
return 'archive/';
```

### Importance-Based

```typescript
if (segment.importanceScore >= 80) return 'critical/';
if (segment.importanceScore >= 50) return 'important/';
return 'standard/';
```

## Lifecycle Management

### Automatic Transitions

Periodically move segments between tiers:

```typescript
async transitionSegments() {
  // Move 7-day-old segments from short-term → long-term
  // Move 90-day-old segments from long-term → archive
  // Delete segments beyond retention limit
}
```

### Retention Policies

```yaml
retention:
  short_term_days: 7
  long_term_days: 90
  archive_days: 365
  delete_after_days: 730
```

## Related Documentation

- [Interface](./interface.ts) - Complete interface definition
- [Test Harness](../test-harness/organize-harness.ts) - Contract tests
- [IMPLEMENTATION_GUIDE.md](../IMPLEMENTATION_GUIDE.md) - General guide

---

**Need help?** See [IMPLEMENTATION_GUIDE.md](../IMPLEMENTATION_GUIDE.md) troubleshooting section.
