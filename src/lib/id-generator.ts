import { randomBytes } from 'crypto';
import type { Result } from '../types/common';

/**
 * Generates a unique session ID in format: mem_{timestamp}_{random8hex}
 * @returns Result containing session ID string or error
 */
export function generateSessionId(): Result<string, Error> {
  try {
    const timestamp = Date.now();
    const random = randomBytes(4).toString('hex');
    return { ok: true, value: `mem_${timestamp}_${random}` };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

/**
 * Generates a unique segment ID in format: seg_{timestamp}_{random8hex}
 * @returns Result containing segment ID string or error
 */
export function generateSegmentId(): Result<string, Error> {
  try {
    const timestamp = Date.now();
    const random = randomBytes(4).toString('hex');
    return { ok: true, value: `seg_${timestamp}_${random}` };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}
