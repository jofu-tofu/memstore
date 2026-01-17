# A/B Testing Framework

**Story 5.4 | Epic 5: Platform Extensibility**

The MemStore A/B testing framework enables data-driven experimentation for comparing different provider implementations. Run controlled experiments, collect comparative metrics, and make evidence-based decisions about which approaches work best.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Configuration Guide](#configuration-guide)
4. [Running Experiments](#running-experiments)
5. [Analyzing Results](#analyzing-results)
6. [Statistical Significance](#statistical-significance)
7. [Examples](#examples)
8. [Best Practices](#best-practices)
9. [API Reference](#api-reference)
10. [Troubleshooting](#troubleshooting)

---

## Overview

### What is A/B Testing?

A/B testing (also called split testing) compares two or more variants of an implementation to determine which performs better. The framework:

- **Randomly assigns** each request to a variant (e.g., 50% to control, 50% to treatment)
- **Collects metrics** for each variant (latency, result count, token usage, errors)
- **Calculates statistics** to determine which variant performs better
- **Validates significance** using statistical tests to ensure results aren't due to chance

### Why Use This Framework?

✅ **Evidence-Based Decisions**: Know which provider performs better, not just which seems better
✅ **Risk Mitigation**: Test new providers with subset of traffic before full rollout
✅ **Continuous Improvement**: Measure and optimize system performance over time
✅ **Contributor Confidence**: Data validates that improvements actually improve things

### Key Features

- **Deterministic Variant Assignment**: Same request always gets same variant (consistent UX)
- **Multi-Variant Support**: Test 2+ variants simultaneously
- **Statistical Analysis**: Automatic significance testing, percentile distributions
- **Graceful Degradation**: Experiment failures don't break Claude Code
- **Performance Optimized**: <10ms overhead per request
- **Privacy-Preserving**: Stores query hashes, not full query text
- **Export Friendly**: JSON and CSV export for external analysis

---

## Quick Start

### 1. Configure an Experiment

Add to your `.claude/settings.json`:

```json
{
  "memory": {
    "experiments": {
      "search-comparison": {
        "enabled": true,
        "variants": {
          "control": "keyword-search",
          "treatment": "semantic-search"
        },
        "splitPercent": 50
      }
    }
  }
}
```

### 2. Run Retrievals

Use Claude Code normally. The framework automatically:
- Assigns each retrieval to a variant
- Logs performance data
- Stores results in `$MEMSTORE_DIR/mem-store/metrics/experiments/search-comparison.jsonl`

### 3. Analyze Results

```typescript
import { aggregateExperimentData } from './lib/experiment-analyzer';

const result = await aggregateExperimentData('search-comparison');

if (result.ok) {
  const { variants, comparison } = result.value;

  console.log(`Control: ${variants.control.avgLatencyMs}ms avg latency`);
  console.log(`Treatment: ${variants.treatment.avgLatencyMs}ms avg latency`);

  if (comparison?.significantLatencyDifference) {
    console.log(`Winner: ${comparison.fasterVariant} (${comparison.latencyImprovementPercent.toFixed(1)}% faster)`);
  }
}
```

---

## Configuration Guide

### Simple Two-Variant Experiment

**50/50 split** between control and treatment:

```json
{
  "memory": {
    "experiments": {
      "search-comparison": {
        "enabled": true,
        "variants": {
          "control": "keyword-search",
          "treatment": "semantic-search"
        },
        "splitPercent": 50
      }
    }
  }
}
```

### Multi-Variant Experiment

**Custom percentages** for 3+ variants:

```json
{
  "memory": {
    "experiments": {
      "ranking-test": {
        "enabled": true,
        "variants": {
          "control": "default-ranking",
          "treatment-a": "importance-boost",
          "treatment-b": "recency-boost",
          "treatment-c": "access-count-boost"
        },
        "splitPercent": {
          "control": 40,
          "treatment-a": 20,
          "treatment-b": 20,
          "treatment-c": 20
        }
      }
    }
  }
}
```

**Requirements:**
- Percentages must sum to exactly 100
- All variants must reference valid provider names
- Provider names are validated against registry at runtime

### Multiple Concurrent Experiments

Run experiments on **different provider types** simultaneously:

```json
{
  "memory": {
    "experiments": {
      "search-comparison": {
        "enabled": true,
        "variants": {
          "control": "keyword-search",
          "treatment": "semantic-search"
        },
        "splitPercent": 50
      },
      "ranking-comparison": {
        "enabled": true,
        "variants": {
          "control": "default-ranking",
          "treatment": "ml-ranking"
        },
        "splitPercent": 50
      }
    }
  }
}
```

**Note:** Experiment ID must contain provider type name (e.g., `search-*`, `ranking-*`) for automatic detection.

### Disabling Experiments

Set `enabled: false` to disable without deleting historical data:

```json
{
  "search-comparison": {
    "enabled": false,
    "variants": { ... },
    "splitPercent": 50
  }
}
```

When disabled:
- No experiment overhead incurred
- Default provider used for all requests
- Historical data preserved for later analysis

---

## Running Experiments

### How Variant Selection Works

The framework uses **deterministic hash-based assignment**:

1. **Hash Generation**: `hash = hashCode(experimentId + requestId)`
2. **Normalization**: `bucket = Math.abs(hash) % 100` (0-99)
3. **Assignment**: If `bucket < splitPercent`, use first variant, else second

**Key Properties:**
- Same request always gets same variant (deterministic)
- Distribution is ~50/50 over many requests
- No state tracking required (stateless)
- Privacy-preserving (uses query hash, not full query)

### Data Collection

Each retrieval logs an **ExperimentDataPoint**:

```typescript
{
  experimentId: "search-comparison",
  variant: "control",
  timestamp: 1704912345000,
  latencyMs: 180,                    // Provider execution time
  resultCount: 3,                    // Number of results returned
  injectedTokens: 920,               // Estimated tokens injected
  queryHash: "abc123def456",         // Hash of query (privacy)
  success: true,                     // Whether provider succeeded
  errorCode?: "SEARCH_INDEX_CORRUPT" // If failed, error code
}
```

Data is stored in **append-only JSONL** format:
- File: `$MEMSTORE_DIR/mem-store/metrics/experiments/{experiment-id}.jsonl`
- Format: One JSON object per line
- Performance: Fire-and-forget async append (<5ms overhead)

### Lifecycle Management

Start, stop, and list experiments programmatically:

```typescript
import { startExperiment, stopExperiment, listExperiments } from './lib/experiment-lifecycle';

// Start experiment
const startResult = await startExperiment('search-comparison');

// Stop experiment (preserves historical data)
const stopResult = await stopExperiment('search-comparison');

// List all experiments
const listResult = await listExperiments();
if (listResult.ok) {
  for (const exp of listResult.value) {
    console.log(`${exp.id}: ${exp.status} (${exp.dataPointCount} data points)`);
  }
}
```

---

## Analyzing Results

### Aggregate Statistics

Calculate aggregated metrics for all variants:

```typescript
import { aggregateExperimentData } from './lib/experiment-analyzer';

const result = await aggregateExperimentData('search-comparison');

if (result.ok) {
  const { variants } = result.value;

  for (const [name, stats] of Object.entries(variants)) {
    console.log(`\nVariant: ${name}`);
    console.log(`  Requests: ${stats.count}`);
    console.log(`  Avg Latency: ${stats.avgLatencyMs}ms`);
    console.log(`  Avg Results: ${stats.avgResultCount}`);
    console.log(`  Avg Tokens: ${stats.avgInjectedTokens}`);
    console.log(`  Error Rate: ${(stats.errorRate * 100).toFixed(2)}%`);
    console.log(`  Latency Distribution:`);
    console.log(`    p50: ${stats.latencyDistribution.p50}ms`);
    console.log(`    p90: ${stats.latencyDistribution.p90}ms`);
    console.log(`    p95: ${stats.latencyDistribution.p95}ms`);
    console.log(`    p99: ${stats.latencyDistribution.p99}ms`);
  }
}
```

### Comparative Analysis (2 Variants)

For two-variant experiments, automatic comparison is calculated:

```typescript
const result = await aggregateExperimentData('search-comparison');

if (result.ok && result.value.comparison) {
  const { comparison } = result.value;

  console.log(`\nStatistical Comparison:`);
  console.log(`  Significant? ${comparison.significantLatencyDifference ? 'YES' : 'NO'}`);
  console.log(`  P-Value: ${comparison.pValue.toFixed(4)}`);
  console.log(`  Faster Variant: ${comparison.fasterVariant || 'N/A'}`);
  console.log(`  Improvement: ${comparison.latencyImprovementPercent.toFixed(1)}%`);
}
```

### Export Results

Export for external analysis (spreadsheets, statistical tools):

```typescript
import { exportExperimentResults } from './lib/experiment-analyzer';

// Export as JSON (full detail)
const jsonResult = await exportExperimentResults('search-comparison', 'json');
if (jsonResult.ok) {
  await writeFile('results.json', jsonResult.value);
}

// Export as CSV (spreadsheet-compatible)
const csvResult = await exportExperimentResults('search-comparison', 'csv');
if (csvResult.ok) {
  await writeFile('results.csv', csvResult.value);
}
```

**CSV Format:**
```csv
experimentId,variant,timestamp,latencyMs,resultCount,injectedTokens,queryHash,success,errorCode
"search-comparison","control","1704912345000","180","3","920","abc123","true",""
"search-comparison","treatment","1704912346000","320","4","1150","def456","true",""
```

---

## Statistical Significance

### What is Statistical Significance?

A result is **statistically significant** when the observed difference is unlikely to have occurred by random chance alone.

- **P-Value < 0.05**: Significant (95% confidence the difference is real)
- **P-Value ≥ 0.05**: Not significant (difference could be random chance)

### Welch's T-Test

The framework uses **Welch's t-test** to compare variant latencies:

- **Null Hypothesis**: The two variants have the same mean latency
- **Alternative Hypothesis**: The variants have different mean latencies
- **Result**: P-value indicating probability null hypothesis is true

**Interpretation:**
```typescript
if (comparison.pValue < 0.05) {
  // Difference is statistically significant
  console.log(`${comparison.fasterVariant} is significantly faster`);
} else {
  // Difference might be random chance
  console.log('No significant difference detected');
}
```

### Sample Size Requirements

**Minimum Sample Size:**
- **Small Experiments**: 30+ requests per variant (basic validity)
- **Reliable Results**: 100+ requests per variant (recommended)
- **High Confidence**: 500+ requests per variant (production decisions)

**Why Sample Size Matters:**
- Small samples: High variance, unreliable statistics
- Large samples: Low variance, reliable detection of small differences

### Effect Size

**Latency Improvement Percentage:**
```typescript
const improvement = comparison.latencyImprovementPercent;

if (improvement > 20) {
  console.log('Large improvement (>20%)');
} else if (improvement > 10) {
  console.log('Moderate improvement (10-20%)');
} else if (improvement > 5) {
  console.log('Small improvement (5-10%)');
} else {
  console.log('Negligible improvement (<5%)');
}
```

**Consider Both:**
- **Statistical Significance**: Is difference real?
- **Effect Size**: Is difference meaningful?

A result can be statistically significant but have negligible effect size (or vice versa).

### Multi-Variant Analysis

For 3+ variants, the framework calculates statistics for all variants but **does not perform pairwise comparisons**. You must:

1. Export data to CSV
2. Use external statistical tools (R, Python, Excel)
3. Perform ANOVA or pairwise t-tests with Bonferroni correction

---

## Examples

### Example 1: Comparing Search Providers

**Scenario:** Test whether semantic search performs better than keyword search.

**Configuration:**
```json
{
  "memory": {
    "experiments": {
      "search-semantic-vs-keyword": {
        "enabled": true,
        "variants": {
          "control": "keyword-search",
          "treatment": "semantic-search"
        },
        "splitPercent": 50
      }
    }
  }
}
```

**Run Experiment:**
```typescript
// Use Claude Code normally for 100+ retrievals
// Framework automatically logs data
```

**Analyze Results:**
```typescript
import { aggregateExperimentData } from './lib/experiment-analyzer';

const result = await aggregateExperimentData('search-semantic-vs-keyword');

if (result.ok) {
  const { variants, comparison } = result.value;

  console.log('=== Search Provider Comparison ===\n');

  // Control (keyword search)
  console.log('Keyword Search:');
  console.log(`  Avg Latency: ${variants.control.avgLatencyMs}ms`);
  console.log(`  Avg Results: ${variants.control.avgResultCount}`);
  console.log(`  Error Rate: ${(variants.control.errorRate * 100).toFixed(2)}%`);

  // Treatment (semantic search)
  console.log('\nSemantic Search:');
  console.log(`  Avg Latency: ${variants.treatment.avgLatencyMs}ms`);
  console.log(`  Avg Results: ${variants.treatment.avgResultCount}`);
  console.log(`  Error Rate: ${(variants.treatment.errorRate * 100).toFixed(2)}%`);

  // Statistical comparison
  if (comparison) {
    console.log('\nStatistical Comparison:');
    console.log(`  P-Value: ${comparison.pValue.toFixed(4)}`);
    console.log(`  Significant? ${comparison.significantLatencyDifference ? 'YES' : 'NO'}`);

    if (comparison.significantLatencyDifference) {
      console.log(`  Winner: ${comparison.fasterVariant}`);
      console.log(`  Improvement: ${comparison.latencyImprovementPercent.toFixed(1)}%`);
    }
  }
}
```

**Expected Output:**
```
=== Search Provider Comparison ===

Keyword Search:
  Avg Latency: 180ms
  Avg Results: 3.2
  Error Rate: 0.80%

Semantic Search:
  Avg Latency: 320ms
  Avg Results: 4.1
  Error Rate: 2.01%

Statistical Comparison:
  P-Value: 0.0001
  Significant? YES
  Winner: control
  Improvement: 43.8%
```

**Decision:** Keyword search is significantly faster (43.8% improvement) but semantic search returns more results (4.1 vs 3.2 avg). Choose based on priority: speed vs. result count.

---

### Example 2: Comparing Ranking Algorithms

**Scenario:** Test three different ranking algorithms to find the best balance of latency and quality.

**Configuration:**
```json
{
  "memory": {
    "experiments": {
      "ranking-algorithm-test": {
        "enabled": true,
        "variants": {
          "control": "default-ranking",
          "boost-importance": "importance-boost-ranking",
          "boost-recency": "recency-boost-ranking",
          "boost-access": "access-count-boost-ranking"
        },
        "splitPercent": {
          "control": 40,
          "boost-importance": 20,
          "boost-recency": 20,
          "boost-access": 20
        }
      }
    }
  }
}
```

**Run Experiment:**
```typescript
// Use Claude Code normally for 500+ retrievals
// Ensures ~200 control, ~100 each treatment
```

**Analyze Results:**
```typescript
import { aggregateExperimentData } from './lib/experiment-analyzer';

const result = await aggregateExperimentData('ranking-algorithm-test');

if (result.ok) {
  const { variants } = result.value;

  console.log('=== Ranking Algorithm Comparison ===\n');

  // Sort by average latency
  const sorted = Object.entries(variants).sort(
    ([, a], [, b]) => a.avgLatencyMs - b.avgLatencyMs
  );

  for (const [name, stats] of sorted) {
    console.log(`${name}:`);
    console.log(`  Requests: ${stats.count}`);
    console.log(`  Avg Latency: ${stats.avgLatencyMs.toFixed(1)}ms`);
    console.log(`  p95 Latency: ${stats.latencyDistribution.p95.toFixed(1)}ms`);
    console.log(`  Avg Results: ${stats.avgResultCount.toFixed(1)}`);
    console.log(`  Error Rate: ${(stats.errorRate * 100).toFixed(2)}%`);
    console.log('');
  }
}
```

**Expected Output:**
```
=== Ranking Algorithm Comparison ===

default-ranking:
  Requests: 198
  Avg Latency: 45.2ms
  p95 Latency: 78.3ms
  Avg Results: 3.8
  Error Rate: 0.00%

importance-boost-ranking:
  Requests: 102
  Avg Latency: 52.1ms
  p95 Latency: 89.4ms
  Avg Results: 4.2
  Error Rate: 0.00%

access-count-boost-ranking:
  Requests: 98
  Avg Latency: 56.8ms
  p95 Latency: 95.1ms
  Avg Results: 3.9
  Error Rate: 0.00%

recency-boost-ranking:
  Requests: 101
  Avg Latency: 61.3ms
  p95 Latency: 102.7ms
  Avg Results: 4.1
  Error Rate: 0.00%
```

**Decision:** Default ranking is fastest (45.2ms avg) with good result count (3.8). Importance-boost returns slightly more results (4.2) with acceptable latency increase (52.1ms). Choose importance-boost if quality > speed, or default if speed > quality.

**Next Steps:** Run pairwise comparison between default and importance-boost with larger sample size to confirm.

---

## Best Practices

### 1. Experiment Design

✅ **Start with Two Variants**: Simpler to analyze, clearer results
✅ **Define Success Metrics**: Know what "better" means before starting
✅ **Test One Thing at a Time**: Change one variable per experiment
✅ **Use Control Baseline**: Always include current production implementation
✅ **Plan Sample Size**: Collect enough data for statistical validity (100+ per variant)

❌ **Don't Change Multiple Things**: Hard to attribute improvements
❌ **Don't Skip Control**: Can't measure improvement without baseline
❌ **Don't Stop Too Early**: Small samples = unreliable results

### 2. Configuration

✅ **Validate Provider Names**: Ensure all variants reference valid providers
✅ **Check Split Percentages**: Must sum to exactly 100
✅ **Use Descriptive IDs**: `search-semantic-vs-keyword` not `experiment-1`
✅ **Include Provider Type**: ID should contain `search`, `ranking`, etc. for auto-detection

❌ **Don't Use Unvalidated Providers**: Validate with Story 5.3 harness first
❌ **Don't Use Unbalanced Splits for Small Samples**: 10/90 split needs 10x more data

### 3. Data Collection

✅ **Run During Normal Usage**: Real user queries, not synthetic tests
✅ **Collect Sufficient Data**: 100+ requests minimum, 500+ recommended
✅ **Monitor Error Rates**: High errors invalidate experiment
✅ **Preserve Historical Data**: Keep data even after experiment ends

❌ **Don't Run Multiple Search Experiments**: Variants interfere with each other
❌ **Don't Ignore Failed Requests**: High error rate = invalid results
❌ **Don't Delete Data**: Historical comparisons show long-term trends

### 4. Analysis

✅ **Check Sample Size**: Ensure both variants have 30+ requests
✅ **Look at Distributions**: Percentiles reveal outliers/variance
✅ **Consider Error Rates**: Low error rate = reliable provider
✅ **Balance Significance and Effect Size**: Both matter
✅ **Export for Deep Analysis**: Use R/Python for advanced statistics

❌ **Don't Trust Small Samples**: <30 requests = unreliable statistics
❌ **Don't Ignore P-Values**: p > 0.05 = difference might be random
❌ **Don't Ignore Effect Size**: Significant but <5% improvement may not matter
❌ **Don't Cherry-Pick Metrics**: Look at full picture (latency + quality + errors)

### 5. Decision Making

✅ **Require Statistical Significance**: p < 0.05 for production rollout
✅ **Require Meaningful Effect Size**: >10% improvement for major changes
✅ **Consider Trade-offs**: Faster but lower quality? Speed vs. accuracy
✅ **Run Follow-up Experiments**: Validate surprising results
✅ **Document Decisions**: Record why you chose winner

❌ **Don't Roll Out Unvalidated Winners**: Confirm with larger sample
❌ **Don't Ignore User Experience**: Latency isn't everything
❌ **Don't Assume Permanence**: Re-test after code changes

### 6. Performance

✅ **Monitor Overhead**: Should be <10ms per request
✅ **Use Fire-and-Forget Logging**: Don't block retrievals
✅ **Cache Config in Memory**: Don't re-read per request
✅ **Clean Up Old Data**: Archive experiments >6 months old

❌ **Don't Use Blocking I/O**: Kills performance
❌ **Don't Re-read Config**: Use cached config

### 7. Privacy

✅ **Store Query Hashes**: NOT full query text
✅ **Use Anonymous Request IDs**: Don't log user identifiers
✅ **Rotate Experiment Data**: Delete/archive old experiments

❌ **Don't Log Sensitive Data**: PII, credentials, secrets
❌ **Don't Share Raw Data**: Privacy violation

---

## API Reference

### Core Functions

#### `selectVariant(experimentId, requestId, config): string`

Select variant for a request using deterministic hash-based assignment.

**Parameters:**
- `experimentId` (string): Experiment identifier
- `requestId` (string): Request identifier (session ID, query hash, etc.)
- `config` (ExperimentConfig): Experiment configuration

**Returns:** Variant name assigned to this request

**Example:**
```typescript
const variant = selectVariant('search-test', 'session-123', {
  enabled: true,
  variants: { control: 'keyword', treatment: 'semantic' },
  splitPercent: 50
});
// Returns 'control' or 'treatment' consistently for same requestId
```

---

#### `getActiveExperiment(config, providerType): ActiveExperiment | null`

Get active experiment for a provider type.

**Parameters:**
- `config` (MemoryConfig): Memory system configuration
- `providerType` (string): Provider type ('search', 'ranking', etc.)

**Returns:** Active experiment or null if none found

**Example:**
```typescript
const experiment = getActiveExperiment(config, 'search');
if (experiment) {
  const variant = selectVariant(experiment.id, requestId, experiment.config);
}
```

---

#### `validateSplitPercentages(config): Result<void, ExperimentError>`

Validate experiment split percentages.

**Parameters:**
- `config` (ExperimentConfig): Experiment configuration

**Returns:** Success or validation error

**Example:**
```typescript
const result = validateSplitPercentages(config);
if (!result.ok) {
  console.error(result.error.message);
}
```

---

### Analysis Functions

#### `aggregateExperimentData(experimentId): Promise<Result<ExperimentResults, ExperimentAnalysisError>>`

Aggregate experiment data and calculate statistics.

**Parameters:**
- `experimentId` (string): Experiment to analyze

**Returns:** Aggregated results with statistics and comparison

**Example:**
```typescript
const result = await aggregateExperimentData('search-test');
if (result.ok) {
  const { variants, comparison } = result.value;
  console.log(`Control: ${variants.control.avgLatencyMs}ms`);
}
```

---

#### `exportExperimentResults(experimentId, format): Promise<Result<string, ExperimentAnalysisError>>`

Export experiment results to JSON or CSV.

**Parameters:**
- `experimentId` (string): Experiment to export
- `format` ('json' | 'csv'): Export format

**Returns:** Formatted export string

**Example:**
```typescript
const result = await exportExperimentResults('search-test', 'csv');
if (result.ok) {
  await writeFile('results.csv', result.value);
}
```

---

### Lifecycle Functions

#### `startExperiment(experimentId): Promise<Result<void, ExperimentLifecycleError>>`

Start an experiment (marks startedAt timestamp).

**Parameters:**
- `experimentId` (string): Experiment to start

**Returns:** Success or error

**Example:**
```typescript
const result = await startExperiment('search-test');
if (!result.ok) {
  console.error(result.error.message);
}
```

---

#### `stopExperiment(experimentId): Promise<Result<void, ExperimentLifecycleError>>`

Stop an experiment (marks stoppedAt timestamp, preserves data).

**Parameters:**
- `experimentId` (string): Experiment to stop

**Returns:** Success or error

**Example:**
```typescript
const result = await stopExperiment('search-test');
```

---

#### `listExperiments(): Promise<Result<ExperimentSummary[], ExperimentLifecycleError>>`

List all experiments (active, stopped, never-started).

**Returns:** Array of experiment summaries

**Example:**
```typescript
const result = await listExperiments();
if (result.ok) {
  for (const exp of result.value) {
    console.log(`${exp.id}: ${exp.status}`);
  }
}
```

---

## Troubleshooting

### Experiment Not Running

**Symptom:** Retrievals don't use experiment variants

**Checks:**
1. Is `enabled: true` in config?
2. Does experiment ID contain provider type (`search`, `ranking`)?
3. Are provider names valid? Check registry.
4. Is config cached? Restart Claude Code to reload.

**Solution:**
```typescript
// Verify config
const config = await getMemoryConfig();
console.log(config.experiments);

// Clear cache if needed
import { clearConfigCache } from './core/config';
clearConfigCache();
```

---

### No Data Collected

**Symptom:** JSONL file empty or missing

**Checks:**
1. Is experiment running? (enabled: true)
2. Have any retrievals occurred?
3. Is MEMSTORE_DIR correct? Check `$MEMSTORE_DIR/mem-store/metrics/experiments/`
4. Are there file permission issues?

**Solution:**
```bash
# Check data directory
ls "$MEMSTORE_DIR/mem-store/metrics/experiments/"

# Check file permissions
ls -la "$MEMSTORE_DIR/mem-store/metrics/experiments/*.jsonl"
```

---

### Invalid Provider Error

**Symptom:** `[Memory:Experiment] Provider 'xyz' not found or invalid`

**Checks:**
1. Is provider name spelled correctly?
2. Is provider registered? Check `provider-registry.ts`
3. Did provider pass contract tests? Run Story 5.3 harness.

**Solution:**
```typescript
// Validate provider
import { validateExperimentProvider } from './core/experiment-validation';

const result = await validateExperimentProvider('semantic-search', 'search');
if (!result.ok) {
  console.error(result.error.message);
}
```

---

### Split Percentages Don't Sum to 100

**Symptom:** `split percentages must sum to 100 (got 95)`

**Checks:**
1. Add up all percentages in `splitPercent` object
2. Check for typos in percentage values

**Solution:**
```json
// WRONG
{
  "splitPercent": {
    "control": 40,
    "treatment-a": 20,
    "treatment-b": 20
    // Missing 20!
  }
}

// CORRECT
{
  "splitPercent": {
    "control": 40,
    "treatment-a": 20,
    "treatment-b": 20,
    "treatment-c": 20
  }
}
```

---

### Uneven Variant Distribution

**Symptom:** 70/30 split instead of expected 50/50

**Checks:**
1. Is sample size large enough? (Need 100+ for ~50/50)
2. Are request IDs truly random/diverse?
3. Is hash function working correctly?

**Solution:**
```typescript
// Test distribution over 1000 requests
const counts = { control: 0, treatment: 0 };

for (let i = 0; i < 1000; i++) {
  const variant = selectVariant('test', `request-${i}`, config);
  counts[variant]++;
}

console.log(`Control: ${counts.control} (${counts.control / 10}%)`);
console.log(`Treatment: ${counts.treatment} (${counts.treatment / 10}%)`);
// Should be ~500/500 (50%/50%)
```

---

### High Error Rate

**Symptom:** Variant has 20% error rate

**Checks:**
1. Is provider implementation buggy?
2. Is provider missing dependencies?
3. Are test queries appropriate for provider?

**Solution:**
1. Check error codes in JSONL file
2. Fix provider implementation
3. Re-run experiment with fixed provider

**Note:** High error rates invalidate experiment results. Fix errors before analyzing.

---

### Can't Read Experiment Data

**Symptom:** `EXPERIMENT_NOT_FOUND` or `EXPERIMENT_DATA_READ_FAILED`

**Checks:**
1. Does JSONL file exist? `$MEMSTORE_DIR/mem-store/metrics/experiments/{id}.jsonl`
2. Is file readable? Check permissions
3. Is file corrupted? Try opening in text editor

**Solution:**
```bash
# Check file exists
ls "$MEMSTORE_DIR/mem-store/metrics/experiments/search-test.jsonl"

# Check file contents
cat "$MEMSTORE_DIR/mem-store/metrics/experiments/search-test.jsonl" | head -5
```

---

## Advanced Topics

### Custom Statistical Tests

For advanced analysis, export data and use R or Python:

**R Example:**
```r
# Load data
data <- read.csv('results.csv')

# Filter by variant
control <- subset(data, variant == 'control')
treatment <- subset(data, variant == 'treatment')

# Welch's t-test
t.test(control$latencyMs, treatment$latencyMs)

# Effect size (Cohen's d)
library(effsize)
cohen.d(control$latencyMs, treatment$latencyMs)

# Visualize distributions
boxplot(latencyMs ~ variant, data = data)
```

**Python Example:**
```python
import pandas as pd
from scipy import stats

# Load data
df = pd.read_csv('results.csv')

# Filter by variant
control = df[df['variant'] == 'control']['latencyMs']
treatment = df[df['variant'] == 'treatment']['latencyMs']

# Welch's t-test
t_stat, p_value = stats.ttest_ind(control, treatment, equal_var=False)

# Effect size (Cohen's d)
mean_diff = control.mean() - treatment.mean()
pooled_std = np.sqrt((control.std()**2 + treatment.std()**2) / 2)
cohens_d = mean_diff / pooled_std

# Visualize
import matplotlib.pyplot as plt
df.boxplot(column='latencyMs', by='variant')
plt.show()
```

---

### Time-Series Analysis

Track how variants perform over time:

```typescript
// Group by day
const byDay = {};

for (const point of dataPoints) {
  const day = new Date(point.timestamp).toISOString().split('T')[0];
  if (!byDay[day]) byDay[day] = { control: [], treatment: [] };
  byDay[day][point.variant].push(point.latencyMs);
}

// Calculate daily averages
for (const [day, variants] of Object.entries(byDay)) {
  const controlAvg = mean(variants.control);
  const treatmentAvg = mean(variants.treatment);
  console.log(`${day}: control=${controlAvg}ms, treatment=${treatmentAvg}ms`);
}
```

---

## Conclusion

The A/B testing framework enables **data-driven experimentation** for MemStore. Use it to:

✅ Compare provider implementations objectively
✅ Measure real-world performance, not guesses
✅ Make evidence-based decisions about rollouts
✅ Continuously improve system performance

**Next Steps:**
1. Design your first experiment (start simple: 2 variants)
2. Configure in `.claude/settings.json`
3. Run Claude Code normally to collect data (100+ requests)
4. Analyze results and make decision
5. Roll out winner to production

**Questions?** Check [Troubleshooting](#troubleshooting) or review [Examples](#examples).

---

**Related Documentation:**
- [Provider Test Harness (Story 5.3)](../providers/test-harness/README.md) - Validate providers before experiments
- [Provider Interface Contracts (Story 5.2)](../providers/IMPLEMENTATION_GUIDE.md) - Provider API reference
- [Retrieval Pipeline](../core/retrieval.ts) - How experiments integrate with retrieval

**Story 5.4 Implementation:** All code in `hooks/memory/core/experiment*.ts`, `hooks/memory/lib/experiment-*.ts`
