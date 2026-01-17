/**
 * Test SearchProvider harness with KeywordSearch
 */

import { describe } from 'bun:test';
import { runSearchProviderTests } from '../search-harness';
import { KeywordSearch } from '../../search/keyword-search';

describe('SearchProvider Contract - KeywordSearch', () => {
  runSearchProviderTests(KeywordSearch);
});
