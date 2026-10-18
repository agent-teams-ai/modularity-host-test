// Test entrypoint of the Store contract owner. Production code never imports this file.
import { declareModule } from '@get-modular/assembly';
import { contractSuite } from '@get-modular/conformance';
import { strict as assert } from 'node:assert';
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INVALID_KEY, type StorePort } from '../../../../../src/features/sessions/features/storage/contracts/storage-ports.ts';
import { Store } from '../../../../../src/features/sessions/features/storage/composition/storage.contracts.ts';

export const storeFakeDeclaration = declareModule({
  moduleId: 'test/sessions/store', implementationId: 'test/sessions/store/fake',
  owner: { authority: 'test', path: ['sessions', 'store'] }, provides: [Store.provide()], slots: [],
});

export function createStoreFake(): StorePort {
  const values = new Map<string, string>();
  return {
    put: (key, value) => { if (key === '') throw Object.assign(new TypeError('a fake store key must not be empty'), { code: INVALID_KEY }); values.set(key, value); },
    get: key => values.get(key),
  };
}

export type FileJournal = {
  readonly port: { readonly append: (entry: string) => void };
  readonly entries: () => string[];
  readonly dispose: () => void;
};

export function fileJournal(): FileJournal {
  const dir = mkdtempSync(join(tmpdir(), 'storage-journal-'));
  const path = join(dir, 'journal.log');
  const fd = openSync(path, 'a');
  return {
    port: Object.freeze({ append: (entry: string): void => { writeSync(fd, `${entry}\\n`); } }),
    entries: () => readFileSync(path, 'utf8').split('\\n').filter(Boolean),
    dispose: () => { closeSync(fd); rmSync(dir, { recursive: true, force: true }); },
  };
}

// The port is synchronous and in memory, so it has no cancellation case.
export const storeSuite = contractSuite(Store, {
  'round-trips a value': store => { store.put('a', '1'); assert.equal(store.get('a'), '1'); },
  'returns undefined for an unknown key': store => { assert.equal(store.get('missing'), undefined); },
  'refuses an empty key': store => {
    assert.throws(() => { store.put('', 'x'); }, (error: unknown) =>
      error instanceof TypeError && 'code' in error && error.code === INVALID_KEY);
  },
});
