# MemStore - Memory System for Claude Code

A persistent memory system that captures session transcripts and retrieves relevant context for Claude Code.

## Architecture Overview

```
memstore/
├── capture.ts          # Entry point: Session capture (SessionEnd hook)
├── retrieve.ts         # Entry point: Memory retrieval (UserPromptSubmit hook)
├── process-queue.ts    # Entry point: Background queue processor
├── core/               # Core retrieval pipeline
├── lib/                # Shared utilities
├── api/                # Programmatic API for segments
├── providers/          # Storage provider implementations
├── tools/              # CLI diagnostic tools
├── types/              # TypeScript type definitions
└── docs/               # Documentation
```

## Entry Points

### 1. `capture.ts` - Session Capture Hook

**Event:** `SessionEnd`

Captures session transcripts when a Claude Code session ends. Writes raw transcript to a queue for async processing.

```bash
# Invoked by Claude Code hook system
bun run capture.ts < payload.json
```

**Payload:** Receives session metadata including `transcript_path` from Claude Code.

**Output:** Writes queue file to `mem-store/queue/` for background processing.

---

### 2. `retrieve.ts` - Memory Retrieval Hook

**Event:** `UserPromptSubmit`

Retrieves relevant memories based on user query and injects them into context.

```bash
# Invoked by Claude Code hook system
bun run retrieve.ts < payload.json
```

**Payload:** `{ query: "user prompt text" }` (supports multiple field names: `query`, `prompt`, `message`, `text`)

**Output:** Formatted memory context written to stdout (injected into Claude Code context).

**Pipeline:**
1. Query extraction
2. Keyword-based retrieval from index
3. Filtering (recency, importance, access)
4. Ranking (relevance scoring)
5. Context formatting (token-limited)

---

### 3. `process-queue.ts` - Background Processor

Processes queued session transcripts in the background.

```bash
# Run manually or spawned automatically by capture.ts
bun run process-queue.ts
```

**What it does:**
- Reads queue files from `mem-store/queue/`
- Extracts segments from transcripts
- Updates keyword index
- Moves processed files to archive or failed

---

## CLI Tools

### Query Memories
```bash
bun run tools/query-memories.ts "search query"
```

### Interactive Diagnostics
```bash
bun run tools/interactive-diagnostics.ts
```

### Segment Investigator
```bash
bun run tools/segment-investigator.ts <segment-id>
```

### Retrieval Comparator
```bash
bun run tools/retrieval-comparator.ts "query1" "query2"
```

---

## Programmatic API

### Segment API (`api/segment-api.ts`)

```typescript
import { createSegment, searchSegments, getSegment } from './api';

// Create a segment
await createSegment({
  content: "Memory content",
  metadata: { source: "manual" }
});

// Search segments
const results = await searchSegments("query");

// Get segment by ID
const segment = await getSegment("seg_123");
```

---

## Configuration

Memory system is configured via `mem-store/config.yaml`:

```yaml
enabled: true
hooks:
  sessionEnd: true
  userPromptSubmit: true
performance:
  maxRetrievalMs: 1000
debug: false
```

---

## Data Directory Structure

When running, creates `mem-store/` directory:

```
mem-store/
├── queue/           # Pending transcripts for processing
│   └── failed/      # Failed processing attempts
├── segments/        # Processed memory segments (by month)
│   └── 2026-01/     # e.g., seg_1234567890_abc123.md
├── indexes/         # Search indexes
│   └── keyword/     # Keyword-based index
├── structured/      # Structured data (session registry)
├── metrics/         # Performance metrics
└── logs/            # Error and retrieval logs
```

---

## Hook Integration

To integrate with Claude Code, add to `settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "hooks": [{
        "type": "command",
        "command": "bun run /path/to/memstore/retrieve.ts"
      }]
    }],
    "SessionEnd": [{
      "hooks": [{
        "type": "command",
        "command": "bun run /path/to/memstore/capture.ts"
      }]
    }]
  }
}
```

---

## Testing

```bash
# Run all tests
bun test

# Run specific test file
bun test capture.test.ts
bun test core/retrieval.test.ts
```

---

## Graceful Degradation

All hooks follow these principles:
- **Never block Claude Code** - Always exit 0
- **Fail silently** - Errors logged to stderr, stdout empty on failure
- **Performance budgeted** - Retrieval has 1s budget (configurable)

---

## License

MIT
