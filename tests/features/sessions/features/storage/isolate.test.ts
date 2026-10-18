import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isolate } from '@get-modular/conformance';
import { cacheModule } from '../../../../../src/features/sessions/features/storage/composition/cache.module.ts';
import { createStoreFake, fileJournal } from './testing.ts';

// Regression: a module test builds the factory outside a real run and misses its scope release.
test('sessions: isolate builds the cache against the store fake and releases it', async () => {
  const journal = fileJournal();
  try {
    {
      await using cache = await isolate(cacheModule, {
        dependencies: { store: createStoreFake(), journal: journal.port, session: { id: 'isolated' } },
      });
      assert.equal(cache.capabilities['test/sessions/cache'].read('missing'), undefined);
    }
    assert.deepEqual(journal.entries(), ['acquire:cache:isolated', 'release:cache:isolated']);
  } finally { journal.dispose(); }
});
