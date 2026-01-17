/**
 * Context formatting for memory injection.
 *
 * Transforms ranked search results into XML-formatted context for Claude Code.
 */

import { Result } from '../types/common';
import { RankedResult } from '../types/ranking';
import { loadSegmentContent } from './content-loader';
import { formatAge } from '../lib/formatting/age-formatter';
import { estimateTokens, truncateToTokenLimit, sumTokens } from '../lib/formatting/token-counter';

export interface FormattingOptions {
  maxTokens?: number;           // Default: 2000
  maxMemories?: number;          // Default: 10
  includeRelevance?: boolean;    // Default: true
  truncateContent?: boolean;     // Default: true
}

export interface InjectionError {
  code: string;
  message: string;
  cause?: Error;
}

const DEFAULT_MAX_TOKENS = 2000;
const DEFAULT_MAX_MEMORIES = 10;

/**
 * Format ranked results into XML-formatted context for injection.
 *
 * @param rankedResults - Ranked search results to format
 * @param options - Formatting options (token budget, etc.)
 * @returns Formatted XML string ready for stdout
 */
export async function formatMemoryContext(
  rankedResults: RankedResult[],
  options?: FormattingOptions
): Promise<Result<string, InjectionError>> {
  try {
    if (rankedResults.length === 0) {
      console.error('[Memory:ContextFormatter] No results to format, returning empty');
      return { ok: true, value: '' };
    }

    const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;
    const maxMemories = options?.maxMemories ?? DEFAULT_MAX_MEMORIES;
    const includeRelevance = options?.includeRelevance ?? true;
    const truncateContent = options?.truncateContent ?? true;

    // Limit to top N memories
    const topResults = rankedResults.slice(0, maxMemories);

    console.error(
      `[Memory:ContextFormatter] Formatting ${topResults.length} memories (budget: ${maxTokens} tokens)`
    );

    const formattedMemories: string[] = [];
    let currentTokens = 0;

    // Reserve tokens for wrapper structure
    const wrapperOverhead = estimateTokens(
      `<retrieved-memories count="${topResults.length}"></retrieved-memories>`
    );
    let remainingBudget = maxTokens - wrapperOverhead;

    const currentTime = Date.now();

    for (const result of topResults) {
      // Load full content from storage
      const contentResult = await loadSegmentContent(result.segmentId);

      if (!contentResult.ok) {
        console.error(
          `[Memory:ContextFormatter] Failed to load ${result.segmentId}: ${contentResult.error.message}`
        );
        continue;  // Skip this segment
      }

      if (!contentResult.value) {
        console.error(
          `[Memory:ContextFormatter] Segment ${result.segmentId} not found, skipping`
        );
        continue;
      }

      const segment = contentResult.value;

      // Calculate age
      const age = formatAge(result.metadata.timestamp, currentTime);

      // Format tags
      const tagsStr = result.metadata.tags.join(',');

      // Build memory attributes
      const attrs: string[] = [];
      if (includeRelevance) {
        attrs.push(`relevance="${Math.round(result.relevanceScore)}"`);
      }
      attrs.push(`age="${age}"`);
      if (tagsStr) {
        attrs.push(`tags="${tagsStr}"`);
      }
      attrs.push(`importance="${result.metadata.importanceScore}"`);
      attrs.push(`access-count="${result.metadata.accessCount}"`);

      const attrsStr = attrs.join(' ');

      // Format content
      let content = segment.content || '';

      // Calculate tokens for this memory (including tags)
      const memoryOverhead = estimateTokens(`<memory ${attrsStr}></memory>`);
      const contentBudget = remainingBudget - memoryOverhead;

      if (contentBudget <= 0) {
        console.error(
          `[Memory:ContextFormatter] Token budget exhausted after ${formattedMemories.length} memories`
        );
        break;  // Stop processing, budget exhausted
      }

      // Truncate content if needed
      if (truncateContent) {
        content = truncateToTokenLimit(content, contentBudget);
      }

      const formattedMemory = `<memory ${attrsStr}>\n${content}\n</memory>`;
      const memoryTokens = estimateTokens(formattedMemory);

      // Check if adding this memory exceeds budget
      if (currentTokens + memoryTokens > remainingBudget) {
        console.error(
          `[Memory:ContextFormatter] Memory ${result.segmentId} would exceed budget, stopping`
        );
        break;
      }

      formattedMemories.push(formattedMemory);
      currentTokens += memoryTokens;
      remainingBudget -= memoryTokens;
    }

    if (formattedMemories.length === 0) {
      console.error('[Memory:ContextFormatter] No memories formatted (all failed or budget too small)');
      return { ok: true, value: '' };
    }

    // Wrap all memories
    const wrapped = `<retrieved-memories count="${formattedMemories.length}">
${formattedMemories.join('\n\n')}
</retrieved-memories>`;

    const totalTokens = estimateTokens(wrapped);
    console.error(
      `[Memory:ContextFormatter] Formatted ${formattedMemories.length} memories (${totalTokens} tokens)`
    );

    if (totalTokens > maxTokens) {
      console.error(
        `[Memory:ContextFormatter] WARNING: Output (${totalTokens} tokens) exceeds budget (${maxTokens})`
      );
    }

    return { ok: true, value: wrapped };

  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'FORMATTING_FAILED',
        message: `Context formatting failed: ${(error as Error).message}`,
        cause: error as Error
      }
    };
  }
}
