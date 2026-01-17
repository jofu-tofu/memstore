# Segment Provider Documentation

**Provider Type:** `SegmentProvider`
**Interface Version:** 1.0.0
**Purpose:** Split session transcripts into individual memory segments

## Quick Reference

**When to use:** First step in memory pipeline
**What it does:** Splits transcript into segments
**Current implementations:** `per-message` (one segment per turn)
**Example implementations:** `semantic-chunking.example.ts` (topic-based)

## Overview

Segmentation providers split session transcripts into memory segments. The segmentation strategy determines:
- Memory granularity (message-level vs topic-level)
- Retrieval precision (specific vs contextual)
- Storage efficiency (many small vs fewer large)

## When to Use Different Implementations

### Per-Message (`per-message.ts`) ✅ Implemented

**Strategy:** One segment per user/assistant turn pair
**Best for:** Precise retrieval, conversation flow
**Pros:** Simple, deterministic, preserves structure
**Cons:** Many small segments, may split related content

### Semantic Chunking (`semantic-chunking.example.ts`) 📝 Future Example

**Strategy:** Group messages by topic similarity
**Best for:** Topical retrieval, fewer segments
**Pros:** Related content together, better context
**Cons:** Requires embeddings, less precise timestamps
**Status:** Not yet implemented - planned example

### Time-Based (Future) 🔮

**Strategy:** Split by time intervals (e.g., 5 minutes)
**Best for:** Long conversations, temporal patterns
**Pros:** Consistent segment sizes
**Cons:** May split topics mid-discussion

## Interface Reference

```typescript
interface SegmentProvider extends Provider {
  segment(transcript: string, sessionId: string): Promise<Result<MemorySegment[], SegmentError>>;
}
```

**Input:** Raw transcript + session ID
**Output:** Array of memory segments
**Errors:** `SEGMENT_EXTRACTION_FAILED`, `SEGMENT_INVALID_TRANSCRIPT`

See [interface.ts](./interface.ts) for details.

## Implementation Guide

### Basic Pattern

```typescript
export class MySegmenter implements SegmentProvider {
  readonly name = 'MySegmenter';
  readonly version = '1.0.0';
  private initialized = false;

  async initialize(): Promise<Result<void, ProviderError>> {
    this.initialized = true;
    return { ok: true, value: undefined };
  }

  async segment(transcript: string, sessionId: string): Promise<Result<MemorySegment[], SegmentError>> {
    if (!this.initialized) {
      return { ok: false, error: { code: 'SEGMENT_NOT_INITIALIZED', message: 'Not initialized' } };
    }

    if (!transcript || typeof transcript !== 'string') {
      return { ok: false, error: { code: 'SEGMENT_INVALID_TRANSCRIPT', message: 'Invalid transcript' } };
    }

    try {
      const segments = await this.splitTranscript(transcript, sessionId);
      return { ok: true, value: segments };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_EXTRACTION_FAILED',
          message: 'Failed to segment transcript',
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

  private async splitTranscript(transcript: string, sessionId: string): Promise<MemorySegment[]> {
    // Your segmentation logic
    // Return array of MemorySegment objects
  }
}
```

## Examples

### Reference: per-message.ts

One segment per turn. See [per-message.ts](./per-message.ts).

### Example: semantic-chunking.example.ts (Future)

Topic-based grouping. **Note:** This example has not been implemented yet.

**Planned key features:**
- Sentence embedding generation
- Similarity-based boundary detection
- Configurable similarity threshold
- Minimum/maximum segment sizes

## Testing

```typescript
import { runSegmentProviderTests } from '../test-harness/segment-harness';
import { MySegmenter } from './my-segmenter';

describe('MySegmenter', () => {
  runSegmentProviderTests(MySegmenter);
});
```

Contract tests validate:
- ✅ Accepts transcript and session ID
- ✅ Returns array of segments
- ✅ Each segment has required fields (id, sessionId, content, timestamp)
- ✅ Handles empty transcripts

## Chunking Guidelines

### Segment Size

- **Too small:** Overhead in storage/retrieval, loss of context
- **Too large:** Less precise retrieval, slower processing
- **Sweet spot:** 100-500 words per segment

### Boundary Detection

**Message-based:** Natural conversation boundaries
**Semantic:** Detect topic shifts using embedding similarity
**Time-based:** Split at regular intervals
**Hybrid:** Combine multiple strategies

## Related Documentation

- [Interface](./interface.ts) - Complete interface definition
- [Test Harness](../test-harness/segment-harness.ts) - Contract tests
- [IMPLEMENTATION_GUIDE.md](../IMPLEMENTATION_GUIDE.md) - General guide

---

**Need help?** See [IMPLEMENTATION_GUIDE.md](../IMPLEMENTATION_GUIDE.md) troubleshooting section.
