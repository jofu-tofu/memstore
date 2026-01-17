/**
 * Segment harness validation test
 *
 * Validates that the segment harness works correctly by testing against
 * the PerMessageSegmentProvider implementation.
 */

import { describe } from 'bun:test';
import { PerMessageSegmentProvider } from '../segment/per-message';
import { runSegmentProviderTests } from './segment-harness';

describe('SegmentProvider Contract Tests', () => {
  runSegmentProviderTests(PerMessageSegmentProvider);
});
