/**
 * Composite Ranking Algorithm
 *
 * Combines multiple scoring factors (term match, recency, importance, access)
 * to produce final relevance scores for memory retrieval.
 *
 * Part of Story 2.4: Result Ranking
 */

import { Result } from '../types/common';
import {
  RankingOptions,
  RankedResult,
  RankingError,
  ScoringComponents
} from '../types/ranking';
import { FilterResult } from '../types/filters';
import { calculateRecencyScore } from '../lib/ranking/recency-scorer';
import { calculateTermMatchScore } from '../lib/ranking/term-match-scorer';
import { calculateImportanceScore } from '../lib/ranking/importance-scorer';
import { calculateAccessScore } from '../lib/ranking/access-scorer';

/**
 * Default weight distribution for scoring components.
 * Empirically validated: term matching dominates (40%), followed by
 * recency (30%), importance (20%), and access count (10%).
 */
const DEFAULT_WEIGHTS = {
  termMatch: 0.40,
  recency: 0.30,
  importance: 0.20,
  access: 0.10
};

const DEFAULT_HALF_LIFE_DAYS = 14;
const DEFAULT_LIMIT = 10;
const DEFAULT_MIN_SCORE = 0;

/**
 * Rank filtered search results by relevance using multi-factor scoring.
 *
 * Combines four scoring components with configurable weights:
 * - Term Match (40%): How many search terms matched
 * - Recency (30%): How recent the segment is (exponential decay)
 * - Importance (20%): Segment quality/value rating
 * - Access Count (10%): Popularity signal
 *
 * @param filterResults - Filtered candidates from Story 2.3
 * @param options - Ranking configuration (limit, weights, decay rate)
 * @returns Result containing ranked results or error
 *
 * @example
 * ```typescript
 * const filterResults: FilterResult[] = [...];
 * const result = await rankResults(filterResults, {
 *   limit: 5,
 *   minScore: 30,
 *   weights: { termMatch: 0.5, recency: 0.3, importance: 0.15, access: 0.05 }
 * });
 *
 * if (result.ok) {
 *   result.value.forEach(ranked => {
 *     console.log(`${ranked.segmentId}: ${ranked.relevanceScore.toFixed(1)}`);
 *   });
 * }
 * ```
 */
export async function rankResults(
  filterResults: FilterResult[],
  options?: RankingOptions
): Promise<Result<RankedResult[], RankingError>> {
  try {
    // Handle empty input
    if (filterResults.length === 0) {
      console.error('[Memory:Ranking] No results to rank, returning empty');
      return { ok: true, value: [] };
    }

    const startTime = Date.now();

    // Extract options with defaults
    const weights = { ...DEFAULT_WEIGHTS, ...options?.weights };
    const halfLifeDays = options?.decayHalfLifeDays || DEFAULT_HALF_LIFE_DAYS;
    const limit = options?.limit || DEFAULT_LIMIT;
    const minScore = options?.minScore || DEFAULT_MIN_SCORE;

    // Validate weights sum to ~1.0
    const weightSum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (Math.abs(weightSum - 1.0) > 0.01) {
      console.error(
        `[Memory:Ranking] Warning: weights sum to ${weightSum.toFixed(3)}, expected 1.0`
      );
    }

    // Pre-calculate current time for consistent recency scoring
    const currentTime = Date.now();

    // Calculate component scores for all results
    const scored = filterResults.map(result => {
      // Calculate normalized component scores (0-1)
      const components: ScoringComponents = {
        termMatchScore: calculateTermMatchScore(
          result.matchCount,
          result.totalQueryTerms
        ),
        // Story 6.3: Pass lastAccessed for dual-recency scoring
        recencyScore: calculateRecencyScore(
          result.metadata.timestamp,
          currentTime,
          halfLifeDays,
          result.metadata.lastAccessed
        ),
        importanceScore: calculateImportanceScore(
          result.metadata.importanceScore
        ),
        accessScore: calculateAccessScore(
          result.metadata.accessCount
        )
      };

      // Combine with weights to get final score (0-1)
      const finalScore =
        weights.termMatch * components.termMatchScore +
        weights.recency * components.recencyScore +
        weights.importance * components.importanceScore +
        weights.access * components.accessScore;

      // Scale to 0-100 for consistency with importance scores
      const relevanceScore = finalScore * 100;

      // Build component scores for debugging (also 0-100 scale)
      const componentScores = {
        termMatch: components.termMatchScore * 100,
        recency: components.recencyScore * 100,
        importance: components.importanceScore * 100,
        access: components.accessScore * 100
      };

      const rankedResult: RankedResult = {
        segmentId: result.segmentId,
        relevanceScore,
        componentScores,
        matchCount: result.matchCount,
        matchedTerms: result.matchedTerms,
        metadata: result.metadata
      };

      return rankedResult;
    });

    // Sort by relevance score descending
    // Break ties by timestamp (newer first)
    scored.sort((a, b) => {
      const scoreDiff = b.relevanceScore - a.relevanceScore;

      // If scores are essentially equal (within 0.001), use timestamp
      if (Math.abs(scoreDiff) < 0.001) {
        return b.metadata.timestamp - a.metadata.timestamp;
      }

      return scoreDiff;
    });

    // Apply minimum score filter
    const filtered = scored.filter(r => r.relevanceScore >= minScore);

    // Apply limit
    const limited = filtered.slice(0, limit);

    const elapsed = Date.now() - startTime;
    console.error(
      `[Memory:Ranking] Ranked ${filterResults.length} results to ${limited.length} in ${elapsed}ms`
    );

    // Warn if exceeding performance budget
    if (elapsed > 20) {
      console.error(
        `[Memory:Ranking] WARNING: Ranking exceeded 20ms budget: ${elapsed}ms`
      );
    }

    return { ok: true, value: limited };

  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'RANKING_FAILED',
        message: `Ranking failed: ${(error as Error).message}`,
        cause: error as Error
      }
    };
  }
}
