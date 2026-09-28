import { appendFileSync } from 'node:fs';
export function mark(event) { appendFileSync(process.env.TEST_MARKERS, `${event}\n`); }
mark('transitive:evaluate');
