// Leader and grandchild of one process group. "stubborn" members ignore SIGTERM; every member that
// receives SIGTERM appends "<role>:term" to the marker file, an oracle independent of the adapter.
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const [role, mode, marker] = [process.argv[2], process.argv[3], process.argv[4]];
process.on('SIGTERM', () => {
  appendFileSync(marker, `${role}:term\n`);
  if (mode === 'stubborn') { if (role === 'leader') process.stdout.write('term\n'); } else process.exit(0);
});
const keepAlive = setInterval(() => {}, 1_000);
if (role === 'grandchild') {
  process.send('ready');
} else {
  const grandchild = spawn(process.execPath, [fileURLToPath(import.meta.url), 'grandchild', mode, marker], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  grandchild.once('message', () => {
    grandchild.disconnect();
    process.stdout.write(`${JSON.stringify({ leader: process.pid, grandchild: grandchild.pid })}\n`);
  });
}
void keepAlive;
