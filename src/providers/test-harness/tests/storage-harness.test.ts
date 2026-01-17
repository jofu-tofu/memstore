/**
 * Test StorageProvider harness with FileBackend
 */

import { describe } from 'bun:test';
import { runStorageProviderTests } from '../storage-harness';
import { FileBackend } from '../../storage/file-backend';

describe('StorageProvider Contract - FileBackend', () => {
  runStorageProviderTests(FileBackend, {
    cleanupBeforeEach: true,
  });
});
