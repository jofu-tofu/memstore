# Summarize Provider Documentation

**Provider Type:** `SummarizeProvider`
**Interface Version:** 1.0.0
**Purpose:** Generate concise summaries and extract tags from memory segments

## Quick Reference

**When to use:** After segmentation, before storage
**What it does:** Enriches segments with `summary` and `tags` fields
**Current implementations:** `simple-extract` (extractive)
**Example implementations:** `textrank.example.ts` (graph-based)

## Overview

Summarization providers condense segment content into concise summaries and extract relevant tags. This enables:
- Quick scanning of memory content
- Tag-based filtering and search
- Reduced cognitive load when reviewing memories

## When to Use Different Implementations

### Simple Extract (`simple-extract.ts`) ✅ Implemented

**Strategy:** First sentence + keyword extraction
**Best for:** Quick summarization, minimal resources
**Pros:** Fast, no dependencies, deterministic
**Cons:** Limited quality, no semantic understanding

### TextRank (`textrank.example.ts`) 📝 Future Example

**Strategy:** Graph-based extractive summarization
**Best for:** Better quality summaries, offline operation
**Pros:** Better sentence selection, configurable, no API
**Cons:** Slower than simple-extract, requires tuning
**Status:** Not yet implemented - planned example

### LLM-Based (Future) 🔮

**Strategy:** Abstractive summarization via LLM
**Best for:** Highest quality summaries
**Pros:** Human-like summaries, understands context
**Cons:** API costs, latency, requires internet

## Interface Reference

```typescript
interface SummarizeProvider extends Provider {
  summarize(segment: MemorySegment): Promise<Result<MemorySegment, SummarizeError>>;
}
```

**Input:** Memory segment with `content` field
**Output:** Same segment enriched with `summary` and `tags`
**Errors:** `SUMMARIZE_EXTRACTION_FAILED`, `SUMMARIZE_INVALID_SEGMENT`

See [interface.ts](./interface.ts) for details.

## Implementation Guide

### Basic Pattern

```typescript
export class MySummarizer implements SummarizeProvider {
  readonly name = 'MySummarizer';
  readonly version = '1.0.0';
  private initialized = false;

  async initialize(): Promise<Result<void, ProviderError>> {
    // Load models, initialize resources
    this.initialized = true;
    return { ok: true, value: undefined };
  }

  async summarize(segment: MemorySegment): Promise<Result<MemorySegment, SummarizeError>> {
    if (!this.initialized) {
      return { ok: false, error: { code: 'SUMMARIZE_NOT_INITIALIZED', message: 'Not initialized' } };
    }

    if (!segment.content) {
      return { ok: false, error: { code: 'SUMMARIZE_INVALID_SEGMENT', message: 'Missing content' } };
    }

    try {
      // Generate summary
      const summary = await this.generateSummary(segment.content);

      // Extract tags
      const tags = await this.extractTags(segment.content);

      // Return enriched segment
      return {
        ok: true,
        value: { ...segment, summary, tags }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'SUMMARIZE_EXTRACTION_FAILED',
          message: 'Failed to summarize',
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

  private async generateSummary(content: string): Promise<string> {
    // Your summarization logic
  }

  private async extractTags(content: string): Promise<string[]> {
    // Your tag extraction logic
  }
}
```

## Examples

### Reference: simple-extract.ts

First sentence + basic keyword extraction. See [simple-extract.ts](./simple-extract.ts).

### Example: textrank.example.ts (Future)

Graph-based extractive summarization. **Note:** This example has not been implemented yet.

**Planned key features:**
- Sentence graph construction
- PageRank algorithm for scoring
- Top-N sentence extraction
- Configurable parameters (damping, iterations)

## Testing

```typescript
import { runSummarizeProviderTests } from '../test-harness/summarize-harness';
import { MySummarizer } from './my-summarizer';

describe('MySummarizer', () => {
  runSummarizeProviderTests(MySummarizer);
});
```

Contract tests validate:
- ✅ Enriches `summary` field
- ✅ Enriches `tags` array
- ✅ Preserves original `content`
- ✅ Handles empty content gracefully

## Tuning Parameters

### TextRank Parameters

- **damping** (0.85): Random walk restart probability
- **iterations** (30): PageRank convergence iterations
- **sentenceCount** (2): Number of sentences to extract

### LLM Parameters (Future)

- **maxTokens**: Summary length limit
- **temperature**: Creativity (0=deterministic, 1=creative)
- **model**: Which LLM to use

## Related Documentation

- [Interface](./interface.ts) - Complete interface definition
- [Test Harness](../test-harness/summarize-harness.ts) - Contract tests
- [IMPLEMENTATION_GUIDE.md](../IMPLEMENTATION_GUIDE.md) - General guide
- [Experiments](../../docs/experiments.md) - A/B testing guide

---

**Need help?** See [IMPLEMENTATION_GUIDE.md](../IMPLEMENTATION_GUIDE.md) troubleshooting section.
