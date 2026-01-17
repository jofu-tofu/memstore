/**
 * Organize harness validation test
 *
 * Validates that the organize harness works correctly by testing against
 * the FlatByDateOrganizeProvider implementation.
 */

import { describe } from 'bun:test';
import { FlatByDateOrganizeProvider } from '../organize/flat-by-date';
import { runOrganizeProviderTests } from './organize-harness';

describe('OrganizeProvider Contract Tests', () => {
  runOrganizeProviderTests(FlatByDateOrganizeProvider);
});
