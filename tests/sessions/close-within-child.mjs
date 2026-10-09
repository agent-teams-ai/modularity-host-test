// Host process for the close deadline: prints one JSON report line and exits 1 unless the close completed.
import { createScope } from '@get-modular/resources';
import { closeWithin } from '../../src/sessions/host.ts';

const [mode, grace, abandon] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4])];
const host = createScope({ name: 'host' });
let escalated = false;
await host.resources.setup({ name: 'stuck', setup: () => 'held', cleanup: (_value, { escalate }) => new Promise(resolve => {
  escalate.addEventListener('abort', () => { escalated = true; if (mode === 'honors-escalate') resolve(); }, { once: true });
}) });
const started = performance.now();
const report = await closeWithin(host.control, grace, abandon);
console.log(JSON.stringify({ report, escalated, elapsedMs: performance.now() - started }));
process.exitCode = report.complete ? 0 : 1;
