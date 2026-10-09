import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// An append-only file the library never sees: the oracle for acquisition and release order.
export function fileJournal() {
  const dir = mkdtempSync(join(tmpdir(), 'sessions-journal-'));
  const path = join(dir, 'journal.log');
  const fd = openSync(path, 'a');
  return {
    port: Object.freeze({ append: entry => { writeSync(fd, `${entry}\n`); } }),
    entries: () => readFileSync(path, 'utf8').split('\n').filter(Boolean),
    dispose: () => { closeSync(fd); rmSync(dir, { recursive: true, force: true }); },
  };
}
