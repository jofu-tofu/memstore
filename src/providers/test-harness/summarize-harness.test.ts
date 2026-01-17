/**
 * Test the SummarizeProvider test harness itself
 *
 * Validates that the harness can test a real provider implementation.
 */

import { describe } from 'bun:test';
import { runSummarizeProviderTests } from './summarize-harness';
import { SimpleExtractProvider } from '../summarize/simple-extract';

describe('SummarizeProvider Test Harness', () => {
  runSummarizeProviderTests(SimpleExtractProvider);
});
