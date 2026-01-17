# Extract Provider Documentation

**Provider Type:** `ExtractProvider`
**Interface Version:** 1.0.0
**Purpose:** Extract and enrich segment metadata (tags, keywords, entities)

## Quick Reference

**When to use:** After segmentation, enriches metadata
**What it does:** Extracts `tags`, `memoryType`, `importanceScore`
**Current implementations:** `keyword-tagger`, `frontmatter-gen`
**Example implementations:** `entity-extractor.example.ts` (NER-based)

## Overview

Extraction providers enrich memory segments with structured metadata. This enables:
- Tag-based filtering and search
- Memory importance scoring
- Entity recognition (people, places, concepts)
- Relationship mapping (future)

## When to Use Different Implementations

### Keyword Tagger (`keyword-tagger.ts`) ✅ Implemented

**Strategy:** Frequency-based keyword extraction
**Best for:** Tag generation, search indexing
**Pros:** Fast, no dependencies, works offline
**Cons:** No semantic understanding, misses rare important terms

### Frontmatter Generator (`frontmatter-gen.ts`) ✅ Implemented

**Strategy:** Sets core metadata with defaults
**Best for:** Basic metadata initialization
**Pros:** Simple, reliable
**Cons:** No intelligent extraction

### Entity Extractor (`entity-extractor.example.ts`) 📝 Future Example

**Strategy:** Named Entity Recognition (NER)
**Best for:** Identifying people, places, organizations
**Pros:** Structured metadata, relationship mapping
**Cons:** Requires NLP library, slower
**Status:** Not yet implemented - planned example

### LLM-Based (Future) 🔮

**Strategy:** LLM extracts custom metadata
**Best for:** Complex extraction requirements
**Pros:** Flexible, high quality
**Cons:** API costs, latency

## Interface Reference

```typescript
interface ExtractProvider extends Provider {
  extract(segment: MemorySegment): Promise<Result<MemorySegment, ExtractError>>;
}
```

**Input:** Memory segment with `content`
**Output:** Same segment enriched with metadata (`tags`, `memoryType`, `importanceScore`)
**Errors:** `EXTRACT_KEYWORDS_FAILED`, `EXTRACT_INVALID_SEGMENT`

See [interface.ts](./interface.ts) for details.

## Implementation Guide

### Basic Pattern

```typescript
export class MyExtractor implements ExtractProvider {
  readonly name = 'MyExtractor';
  readonly version = '1.0.0';
  private initialized = false;

  async initialize(): Promise<Result<void, ProviderError>> {
    this.initialized = true;
    return { ok: true, value: undefined };
  }

  async extract(segment: MemorySegment): Promise<Result<MemorySegment, ExtractError>> {
    if (!this.initialized) {
      return { ok: false, error: { code: 'EXTRACT_NOT_INITIALIZED', message: 'Not initialized' } };
    }

    if (!segment.content) {
      return { ok: false, error: { code: 'EXTRACT_INVALID_SEGMENT', message: 'Missing content' } };
    }

    try {
      // Extract tags
      const tags = await this.extractKeywords(segment.content);

      // Classify memory type
      const memoryType = this.classifyMemoryType(segment.content);

      // Calculate importance
      const importanceScore = this.calculateImportance(segment.content);

      return {
        ok: true,
        value: { ...segment, tags, memoryType, importanceScore }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'EXTRACT_KEYWORDS_FAILED',
          message: 'Failed to extract metadata',
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

  private async extractKeywords(content: string): Promise<string[]> {
    // Your keyword extraction logic
  }

  private classifyMemoryType(content: string): 'episodic' | 'semantic' | 'procedural' {
    // Your classification logic
  }

  private calculateImportance(content: string): number {
    // Your scoring logic (0-100)
  }
}
```

## Examples

### Reference: keyword-tagger.ts

TF-IDF based keyword extraction. See [keyword-tagger.ts](./keyword-tagger.ts).

### Example: entity-extractor.example.ts (Future)

NER-based entity extraction. **Note:** This example has not been implemented yet.

**Planned key features:**
- Named entity recognition (people, places, organizations)
- Entity categorization
- Relationship extraction
- Custom entity types

## Testing

```typescript
import { runExtractProviderTests } from '../test-harness/extract-harness';
import { MyExtractor } from './my-extractor';

describe('MyExtractor', () => {
  runExtractProviderTests(MyExtractor);
});
```

Contract tests validate:
- ✅ Enriches `tags` array
- ✅ Sets `memoryType` field
- ✅ Calculates `importanceScore`
- ✅ Preserves original `content`

## Extraction Techniques

### Keyword Extraction

**TF-IDF:** Term frequency × inverse document frequency
**RAKE:** Rapid Automatic Keyword Extraction
**YAKE:** Yet Another Keyword Extractor

### Entity Recognition

**Rule-based:** Pattern matching (proper nouns, capitalization)
**Model-based:** NLP models (spaCy, Stanford NER)
**LLM-based:** Prompt engineering for entity extraction

### Importance Scoring

**Factors to consider:**
- Message length (longer = more content)
- Keyword density (more keywords = higher importance)
- User sentiment (questions, decisions = important)
- Recency (newer = more relevant)

## Related Documentation

- [Interface](./interface.ts) - Complete interface definition
- [Test Harness](../test-harness/extract-harness.ts) - Contract tests
- [IMPLEMENTATION_GUIDE.md](../IMPLEMENTATION_GUIDE.md) - General guide

---

**Need help?** See [IMPLEMENTATION_GUIDE.md](../IMPLEMENTATION_GUIDE.md) troubleshooting section.
