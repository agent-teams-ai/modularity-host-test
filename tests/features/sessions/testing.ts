// Test entrypoint of the Session contract owner. Production code never imports this file.
import { contractSuite } from '@get-modular/conformance';
import { strict as assert } from 'node:assert';
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session } from '../../../src/features/sessions/composition/sessions.contracts.ts';
import type { JournalPort, SessionPort } from '../../../src/features/sessions/contracts/session-ports.ts';

export function createSessionFake(): SessionPort {
  const values = new Map<string, string>();
  return {
    id: 'fake',
    roundTrip: value => { values.set('value', value); return values.get('value'); },
    count: key => key === 'value' ? 1 : 0,
  };
}

export const sessionSuite = contractSuite(Session, {
  'round-trips a value': session => { assert.equal(session.roundTrip('1'), '1'); },
  'counts round trips': session => { session.roundTrip('1'); assert.equal(session.count('value'), 1); },
});

export type FileJournal = {
  readonly port: JournalPort;
  readonly entries: () => string[];
  readonly dispose: () => void;
};

// An append-only file the library never sees: the oracle for acquisition and release order.
export function fileJournal(): FileJournal {
  const dir = mkdtempSync(join(tmpdir(), 'sessions-journal-'));
  const path = join(dir, 'journal.log');
  const fd = openSync(path, 'a');
  return {
    port: Object.freeze({ append: (entry: string): void => { writeSync(fd, `${entry}\n`); } }),
    entries: () => readFileSync(path, 'utf8').split('\n').filter(Boolean),
    dispose: () => { closeSync(fd); rmSync(dir, { recursive: true, force: true }); },
  };
}
