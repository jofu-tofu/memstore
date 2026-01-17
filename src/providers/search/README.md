# Search Provider Documentation

**Provider Type:** `SearchProvider`
**Interface Version:** 1.0.0
**Purpose:** Query the memory index to find relevant segments

## Table of Contents

1. [Overview](#overview)
2. [When to Use Different Implementations](#when-to-use-different-implementations)
3. [Interface Reference](#interface-reference)
4. [How to Implement a Search Provider](#how-to-implement-a-search-provider)
5. [Implementation Examples](#implementation-examples)
6. [Testing Your Provider](#testing-your-provider)
7. [Configuration & Registration](#configuration--registration)
8. [Performance Considerations](#performance-considerations)
9. [Common Pitfalls](#common-pitfalls)
10. [Validating Your Provider](#validating-your-provider)

## Overview

Search providers enable the MemStore Memory System to find relevant memory segments based on user queries. Different search strategies offer different trade-offs between accuracy, speed, and resource requirements.

### What is a Search Provider?

A search provider implements the `SearchProvider` interface to:
1. Accept user queries (text strings)
2. Search the memory index for matching segments
3. Return ranked results ordered by relevance
4. Handle edge cases (empty queries, no matches, errors)

### Why Multiple Implementations?

Different use cases benefit from different search strategies:

| Strategy | Accuracy | Speed | Resources | Best For |
|----------|----------|-------|-----------|----------|
| **Keyword** | Good | Fast | Low | Quick lookups, exact matches |
| **Semantic** | Excellent | Slower | High | Conceptual queries, similar meaning |
| **Hybrid** | Excellent | Medium | High | Best-of-both when resources allow |

## When to Use Different Implementations

### Keyword Search (`keyword-search.ts`)

**Use when:**
- Users search for specific terms or phrases
- Fast response time is critical (<10ms)
- Memory footprint must be minimal
- Queries use exact technical terms

**Examples:**
- "Show me sessions about TypeScript"
- "Find memories containing 'async/await'"
- "Search for 'bug fix' discussions"

**Pros:**
- ✅ Very fast (TF-IDF index lookup)
- ✅ Low memory usage
- ✅ Deterministic results
- ✅ Works offline

**Cons:**
- ❌ Misses synonyms ("car" won't match "automobile")
- ❌ No understanding of context or meaning
- ❌ Struggles with typos or variations

**Current Status:** ✅ Implemented (`keyword-search.ts`)

---

### Semantic Search (`semantic-search.example.ts`)

**Use when:**
- Users ask conceptual questions
- Finding similar meanings is important
- You have API access (OpenAI, Cohere, etc.) or local embeddings
- Resources allow ~50-200ms query latency

**Examples:**
- "What did I learn about error handling?" (matches "exception management", "try-catch patterns")
- "Show conversations about testing" (matches "QA", "validation", "quality assurance")
- "Find discussions on performance" (matches "optimization", "speed improvements", "efficiency")

**Pros:**
- ✅ Understands meaning, not just keywords
- ✅ Finds semantically similar content
- ✅ Handles synonyms and variations
- ✅ Robust to typos

**Cons:**
- ❌ Requires embedding model (API cost or local resources)
- ❌ Slower than keyword search
- ❌ Higher memory footprint (vector storage)
- ❌ May need API access (unless using local models)

**Current Status:** 📝 Example implementation provided (`semantic-search.example.ts`)

---

### Hybrid Search (Future)

**Use when:**
- You want the best of both worlds
- Resources allow additional complexity
- Users have mixed query types (keywords + concepts)

**How it works:**
1. Run both keyword and semantic search
2. Combine results with configurable weighting
3. Re-rank by composite score

**Current Status:** 🔮 Future implementation

## Interface Reference

### SearchProvider Interface

```typescript
interface SearchProvider extends Provider {
  search(query: string, options?: SearchOptions): Promise<Result<SearchResult[], SearchError>>;
}
```

See [interface.ts](./interface.ts) for complete interface documentation with:
- Method signatures and parameter types
- Return types and error codes
- JSDoc examples
- Version stability commitment

### Key Types

**SearchOptions:**
```typescript
interface SearchOptions {
  maxResults?: number;      // Max results to return (default: 10-20)
  minMatchCount?: number;   // Min terms that must match (default: 1)
  debug?: boolean;          // Enable diagnostic logging (default: false)
}
```

**SearchResult:**
```typescript
interface SearchResult {
  segmentId: string;        // Segment identifier
  matchCount: number;       // Number of matched terms
  matchedTerms: string[];   // Which terms matched
  totalQueryTerms: number;  // Total terms in query
}
```

**SearchError Codes:**
- `SEARCH_INDEX_CORRUPT` - Index file corrupted or invalid
- `SEARCH_FAILED` - General search failure
- `SEARCH_QUERY_INVALID` - Invalid query string
- `SEARCH_PROVIDER_NOT_INITIALIZED` - Provider not initialized

## How to Implement a Search Provider

### Step-by-Step Guide

#### 1. Create Your Provider File

```typescript
// providers/search/my-search.ts
import type { Result } from '../../types/common';
import type { SearchProvider, SearchResult, SearchError, SearchOptions } from './interface';

export class MySearch implements SearchProvider {
  readonly name = 'MySearch';
  readonly version = '1.0.0';

  private initialized = false;
  private index: any = null;

  async initialize(): Promise<Result<void, ProviderError>> {
    if (this.initialized) return { ok: true, value: undefined };

    try {
      // Load/build your index
      this.index = await this.buildIndex();
      this.initialized = true;
      return { ok: true, value: undefined };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'SEARCH_PROVIDER_INIT_FAILED',
          message: 'Failed to initialize search provider',
          cause: error instanceof Error ? error : new Error(String(error))
        }
      };
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    return {
      healthy: this.initialized && this.index !== null,
      message: this.initialized ? 'Operational' : 'Not initialized',
      details: { initialized: this.initialized }
    };
  }

  async shutdown(): Promise<void> {
    this.index = null;
    this.initialized = false;
  }

  async search(query: string, options?: SearchOptions): Promise<Result<SearchResult[], SearchError>> {
    if (!this.initialized) {
      return {
        ok: false,
        error: {
          code: 'SEARCH_PROVIDER_NOT_INITIALIZED',
          message: 'Search provider not initialized'
        }
      };
    }

    if (!query.trim()) {
      // Empty query = return empty results (not an error)
      return { ok: true, value: [] };
    }

    try {
      // Implement your search logic here
      const results = await this.performSearch(query, options);
      return { ok: true, value: results };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'SEARCH_FAILED',
          message: 'Search operation failed',
          cause: error instanceof Error ? error : new Error(String(error))
        }
      };
    }
  }

  private async buildIndex(): Promise<any> {
    // Your index construction logic
  }

  private async performSearch(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    // Your search algorithm
  }
}
```

#### 2. Implement the Search Algorithm

**Keyword Search Pattern:**
```typescript
private async performSearch(query: string, options?: SearchOptions): Promise<SearchResult[]> {
  const maxResults = options?.maxResults ?? 10;
  const minMatchCount = options?.minMatchCount ?? 1;

  // Extract search terms
  const queryTerms = this.extractTerms(query);

  // Lookup in keyword index
  const matches: Map<string, Set<string>> = new Map();
  for (const term of queryTerms) {
    const segmentIds = this.index.get(term) ?? new Set();
    for (const id of segmentIds) {
      if (!matches.has(id)) matches.set(id, new Set());
      matches.get(id)!.add(term);
    }
  }

  // Build results
  const results: SearchResult[] = [];
  for (const [segmentId, matchedTerms] of matches.entries()) {
    if (matchedTerms.size >= minMatchCount) {
      results.push({
        segmentId,
        matchCount: matchedTerms.size,
        matchedTerms: Array.from(matchedTerms),
        totalQueryTerms: queryTerms.length
      });
    }
  }

  // Sort by relevance (most matches first)
  results.sort((a, b) => b.matchCount - a.matchCount);

  return results.slice(0, maxResults);
}
```

**Semantic Search Pattern:**
```typescript
private async performSearch(query: string, options?: SearchOptions): Promise<SearchResult[]> {
  const maxResults = options?.maxResults ?? 10;

  // Generate query embedding
  const queryEmbedding = await this.generateEmbedding(query);

  // Find similar segments (cosine similarity)
  const similarities: Array<{ segmentId: string; similarity: number }> = [];
  for (const [segmentId, embedding] of this.embeddings.entries()) {
    const similarity = this.cosineSimilarity(queryEmbedding, embedding);
    similarities.push({ segmentId, similarity });
  }

  // Sort by similarity (highest first)
  similarities.sort((a, b) => b.similarity - a.similarity);

  // Convert to SearchResult format
  return similarities.slice(0, maxResults).map(({ segmentId, similarity }) => ({
    segmentId,
    matchCount: Math.round(similarity * 100), // Use similarity as score
    matchedTerms: [query], // Semantic match = entire query
    totalQueryTerms: 1
  }));
}
```

#### 3. Write Tests

See [Testing Your Provider](#testing-your-provider) section below.

## Implementation Examples

### Example 1: Keyword Search (Reference)

See [keyword-search.ts](./keyword-search.ts) for the complete reference implementation.

**Key features:**
- TF-IDF based keyword index
- Fast in-memory lookups
- Handles multi-word queries
- Filters by minMatchCount

**Test coverage:** [keyword-search.test.ts](./keyword-search.test.ts)

### Example 2: Semantic Search (Example Template)

See [semantic-search.example.ts](./semantic-search.example.ts) for a working example.

**Key features:**
- Embedding-based similarity search
- OpenAI/Cohere API integration examples
- Caching strategy for embeddings
- Batching for performance

**Test coverage:** [semantic-search.example.test.ts](./semantic-search.example.test.ts)

## Testing Your Provider

### Contract Tests (Automated)

Use the search provider test harness to validate interface compliance:

```typescript
import { runSearchProviderTests } from '../test-harness/search-harness';
import { MySearch } from './my-search';

describe('MySearch contract compliance', () => {
  runSearchProviderTests(MySearch);
});
```

This automatically runs ~15 contract tests validating:
- ✅ Lifecycle methods (initialize, healthCheck, shutdown)
- ✅ Search with valid inputs returns results
- ✅ Search with empty query returns empty array (not error)
- ✅ Search with no matches returns empty array (not error)
- ✅ maxResults option limits results
- ✅ minMatchCount option filters matches
- ✅ Error handling returns Result errors (not exceptions)

### Provider-Specific Tests

Add tests for your implementation's unique features:

```typescript
describe('MySearch specific behavior', () => {
  test('should find segments with synonym matching', async () => {
    const provider = new MySearch();
    await provider.initialize();

    const result = await provider.search('automobile');
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should match segments containing "car"
      expect(result.value.length).toBeGreaterThan(0);
    }

    await provider.shutdown();
  });
});
```

## Configuration & Registration

### Register Your Provider

Add to `hooks/memory/core/register-providers.ts`:

```typescript
import { MySearch } from '../providers/search/my-search';

export async function registerDefaultProviders(registry: ProviderRegistry): Promise<void> {
  // Existing providers...
  await registry.register('search', 'keyword-search', new KeywordSearch());

  // Your provider
  await registry.register('search', 'my-search', new MySearch());
}
```

### Configure in config.yaml

```yaml
memory:
  providers:
    search: my-search  # Use your provider
```

### Dynamic Registration

```typescript
import { getProviderRegistry } from './core/provider-registry';
import { MySearch } from './providers/search/my-search';

const registry = getProviderRegistry();
await registry.register('search', 'my-search', new MySearch());
```

## Performance Considerations

### Keyword Search Performance

**Index Size:** O(unique_terms × segments_per_term)
- For 1,000 segments with ~50 unique terms each: ~50KB index
- In-memory lookup: ~1-5ms per query

**Optimization strategies:**
1. **Term filtering:** Ignore common words (stop words)
2. **Stemming:** Reduce variants to root forms
3. **Index compression:** Use efficient data structures

### Semantic Search Performance

**Index Size:** O(segments × embedding_dimensions)
- For 1,000 segments with 1536-dim embeddings: ~6MB vectors
- Similarity computation: ~50-200ms per query

**Optimization strategies:**
1. **Caching:** Cache query embeddings for repeated queries
2. **Batching:** Generate embeddings in batches
3. **Approximate NN:** Use FAISS/Annoy for large datasets
4. **Dimensionality reduction:** Use 384-dim models (smaller, faster)

### Caching Pattern

```typescript
private embeddingCache = new Map<string, number[]>();

async generateEmbedding(text: string): Promise<number[]> {
  const cached = this.embeddingCache.get(text);
  if (cached) return cached;

  const embedding = await this.callEmbeddingAPI(text);
  this.embeddingCache.set(text, embedding);
  return embedding;
}
```

## Common Pitfalls

### ❌ Pitfall 1: Throwing Exceptions

**Wrong:**
```typescript
async search(query: string): Promise<Result<SearchResult[], SearchError>> {
  if (!query) throw new Error('Query required'); // DON'T DO THIS
  return { ok: true, value: [] };
}
```

**Correct:**
```typescript
async search(query: string): Promise<Result<SearchResult[], SearchError>> {
  if (!query) {
    return { ok: true, value: [] }; // Empty query = empty results
  }
  // ... search logic
}
```

### ❌ Pitfall 2: Treating No Matches as Error

**Wrong:**
```typescript
const matches = await this.findMatches(query);
if (matches.length === 0) {
  return { ok: false, error: { code: 'SEARCH_NO_RESULTS', message: 'No matches' } };
}
```

**Correct:**
```typescript
const matches = await this.findMatches(query);
return { ok: true, value: matches }; // Empty array is valid result
```

### ❌ Pitfall 3: Not Handling Initialization

**Wrong:**
```typescript
async search(query: string): Promise<Result<SearchResult[], SearchError>> {
  // Directly uses this.index without checking
  const results = this.index.search(query);
  return { ok: true, value: results };
}
```

**Correct:**
```typescript
async search(query: string): Promise<Result<SearchResult[], SearchError>> {
  if (!this.initialized) {
    return {
      ok: false,
      error: {
        code: 'SEARCH_PROVIDER_NOT_INITIALIZED',
        message: 'Call initialize() first'
      }
    };
  }
  // ... search logic
}
```

## Validating Your Provider

### A/B Testing Your Search Provider

Once your provider is implemented, validate it against existing providers using the experiment framework (Story 5.4).

**Configure an experiment:**

```typescript
// In config.yaml
memory:
  experiments:
    semantic-search-trial:
      enabled: true
      variants:
        control: keyword-search      # Current provider
        treatment: my-semantic-search # Your provider
      splitPercent: 50               # 50/50 split
      metrics:
        - query_latency
        - result_relevance
```

**Analyze results:**

```bash
# View experiment results
cat ~/.memstore/experiments/semantic-search-trial/results.json

# Check performance metrics
{
  "control": {
    "avg_latency_ms": 5,
    "relevance_score": 0.72
  },
  "treatment": {
    "avg_latency_ms": 150,
    "relevance_score": 0.89
  }
}
```

**Decision criteria:**
- **Accuracy improvement:** Is semantic search finding more relevant results?
- **Latency acceptable:** Is 150ms query time acceptable for your use case?
- **Resource usage:** Can you afford embedding API costs or local model resources?

**Promotion:** If treatment outperforms control, promote your provider to default:

```yaml
memory:
  providers:
    search: my-semantic-search  # Promoted from experiment
```

For complete A/B testing guide, see [experiments.md](../../docs/experiments.md).

## Related Documentation

- [SearchProvider Interface](./interface.ts) - Complete interface definition
- [Provider Test Harness](../test-harness/search-harness.ts) - Contract tests
- [IMPLEMENTATION_GUIDE.md](../IMPLEMENTATION_GUIDE.md) - General provider guide
- [Experiments Framework](../../docs/experiments.md) - A/B testing guide
- [Project Context](../../../../_bmad-output/project-context.md) - Critical implementation rules
- [Architecture](../../../../_bmad-output/planning-artifacts/architecture.md) - System design

---

**Need help?** Open a GitHub issue or check the troubleshooting section in [IMPLEMENTATION_GUIDE.md](../IMPLEMENTATION_GUIDE.md).
