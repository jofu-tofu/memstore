/**
 * Extract harness validation test
 *
 * Validates that the extract harness works correctly by testing against
 * the KeywordTaggerProvider implementation.
 */

import { describe } from 'bun:test';
import { KeywordTaggerProvider } from '../extract/keyword-tagger';
import { runExtractProviderTests } from './extract-harness';

describe('ExtractProvider Contract Tests', () => {
  runExtractProviderTests(KeywordTaggerProvider);
});
