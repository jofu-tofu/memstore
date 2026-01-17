/**
 * Ranking Types and Interfaces
 *
 * Defines types for relevance scoring and result ranking in MemStore.
 * Part of Story 2.4: Result Ranking
 */

import { SegmentMetadata } from './filters';

/**
 * Options for configuring result ranking behavior
 */
export interface RankingOptions {
  /** Maximum number of results to return (default: 10) */
  limit?: number;

  /** Minimum relevance score threshold 0-100 (default: 0) */
  minScore?: number;

  /** Custom weight distribution for scoring components */
  weights?: {
    /** Term match weight (default: 0.40) */
    termMatch?: number;
    /** Recency weight (default: 0.30) */
    recency?: number;
    /** Importance weight (default: 0.20) */
    importance?: number;
    /** Access count weight (default: 0.10) */
    access?: number;
  };

  /** Recency decay half-life in days (default: 14) */
  decayHalfLifeDays?: number;
}

/**
 * Ranked search result with relevance score and component breakdown
 */
export interface RankedResult {
  /** Unique segment identifier */
  segmentId: string;

  /** Final relevance score 0-100 */
  relevanceScore: number;

  /** Component score breakdown for debugging */
  componentScores: {
    /** Term match component score 0-100 */
    termMatch: number;
    /** Recency component score 0-100 */
    recency: number;
    /** Importance component score 0-100 */
    importance: number;
    /** Access count component score 0-100 */
    access: number;
  };

  /** Number of search terms that matched */
  matchCount: number;

  /** Array of matched search terms */
  matchedTerms: string[];

  /** Full segment metadata */
  metadata: SegmentMetadata;
}

/**
 * Error information for ranking failures
 */
export interface RankingError {
  /** Error code (e.g., 'RANKING_FAILED') */
  code: string;

  /** Human-readable error message */
  message: string;

  /** Original error that caused the failure */
  cause?: Error;
}

/**
 * Internal helper type for normalized scoring components (0-1 scale)
 */
export interface ScoringComponents {
  /** Normalized term match score 0-1 */
  termMatchScore: number;

  /** Normalized recency score 0-1 */
  recencyScore: number;

  /** Normalized importance score 0-1 */
  importanceScore: number;

  /** Normalized access score 0-1 */
  accessScore: number;
}
