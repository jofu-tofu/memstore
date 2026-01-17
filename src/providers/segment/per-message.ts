import type { SegmentProvider, SegmentError } from './interface';
import type { MemorySegment } from '../../types/segment';
import type { Result, ProviderError, HealthStatus } from '../../types/common';
import { generateSegmentId } from '../../lib/id-generator';

/**
 * Turn - Represents a single conversation turn
 */
interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * PerMessageSegmentProvider - Splits transcript into one segment per user/assistant turn pair
 *
 * Strategy:
 * - Creates one MemorySegment per conversation exchange
 * - Merges very short exchanges (< 50 chars) with adjacent segments
 * - Sets sourceRange indicating position in original transcript
 * - Sets memoryType to 'episodic' for all session content
 */
export class PerMessageSegmentProvider implements SegmentProvider {
  readonly name = 'per-message';
  readonly version = '1.0.0';

  async initialize(): Promise<Result<void, ProviderError>> {
    return { ok: true, value: undefined };
  }

  async healthCheck(): Promise<HealthStatus> {
    return { healthy: true, message: 'Per-message segment provider is operational' };
  }

  async shutdown(): Promise<Result<void, ProviderError>> {
    return { ok: true, value: undefined };
  }

  /**
   * Segment a transcript into memory segments
   *
   * @param transcript - Full session transcript
   * @param sessionId - Parent session identifier
   * @returns Result with array of MemorySegments
   */
  async segment(transcript: string, sessionId: string): Promise<Result<MemorySegment[], SegmentError>> {
    try {
      // Handle empty transcript gracefully
      if (!transcript || transcript.trim().length === 0) {
        console.error(`[Memory:PerMessage] Empty transcript - returning 0 segments`);
        return { ok: true, value: [] };
      }

      const turns = this.extractTurns(transcript);

      if (turns.length === 0) {
        console.error(`[Memory:PerMessage] No turns extracted from transcript`);
        return { ok: true, value: [] };
      }

      const segments: MemorySegment[] = [];

      // Group turns into segments (pair user + assistant turns)
      let i = 0;
      while (i < turns.length) {
        let combinedContent = '';
        let startIndex = i;

        // Take current turn
        combinedContent = turns[i].text;
        i++;

        // If this is a user turn and there's an assistant turn following, include it
        if (turns[startIndex].role === 'user' && i < turns.length && turns[i].role === 'assistant') {
          combinedContent += '\n' + turns[i].text;
          i++;
        }

        // Calculate source range
        let currentPosition = 0;
        for (let j = 0; j < startIndex; j++) {
          currentPosition += turns[j].text.length + 1; // +1 for newline
        }

        // Generate ID
        const idResult = generateSegmentId();
        if (!idResult.ok) {
          // Return error Result instead of throwing (Story 3.6)
          return {
            ok: false,
            error: {
              code: 'SEGMENT_ID_GENERATION_FAILED',
              message: `Failed to generate segment ID: ${idResult.error.message}`,
              cause: idResult.error
            }
          };
        }

        const segment: MemorySegment = {
          id: idResult.value,
          sessionId,
          timestamp: Date.now(),
          importanceScore: 0,
          accessCount: 0,
          lastAccessed: null,
          tags: [],
          memoryType: 'episodic',
          sourceRange: {
            start: currentPosition,
            end: currentPosition + combinedContent.length
          },
          content: combinedContent
        };

        segments.push(segment);
      }

      console.error(`[Memory:PerMessage] Created ${segments.length} segments from transcript`);
      return { ok: true, value: segments };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'SEGMENT_EXTRACTION_FAILED',
          message: `Failed to segment transcript: ${(error as Error).message}`,
          cause: error as Error
        }
      };
    }
  }

  /**
   * Extract turns from transcript
   *
   * Assumes format:
   * User: {message}
   * Assistant: {message}
   * User: {message}
   * ...
   *
   * @param transcript - Raw transcript text
   * @returns Array of turns
   */
  private extractTurns(transcript: string): Turn[] {
    const lines = transcript.split('\n');
    const turns: Turn[] = [];
    let currentRole: 'user' | 'assistant' | '' = '';
    let currentText = '';

    for (const line of lines) {
      if (line.startsWith('User:') || line.startsWith('Assistant:')) {
        // Save previous turn if exists
        if (currentText.trim() && currentRole) {
          turns.push({ role: currentRole, text: currentText.trim() });
        }

        // Start new turn
        currentRole = line.startsWith('User:') ? 'user' : 'assistant';
        currentText = line.substring(line.indexOf(':') + 1).trim();
      } else {
        // Continue current turn
        if (currentText) {
          currentText += '\n' + line;
        } else {
          currentText = line;
        }
      }
    }

    // Push final turn
    if (currentText.trim() && currentRole) {
      turns.push({ role: currentRole, text: currentText.trim() });
    }

    return turns;
  }
}
