import { implement } from '@get-modular/assembly';
import { scoped } from '@get-modular/resources';
import { incrementCount } from '../application/use-cases/increment-count.ts';
import type { CounterPort } from '../contracts/counter-port.ts';
import { counterDeclaration } from './counter.declaration.ts';
import type { CounterCapabilities } from './counter.contracts.ts';

export const counterModule = implement<CounterCapabilities>()(counterDeclaration, async (_deps, { resources }) => {
  const counts = await resources.setup({
    name: 'counts',
    setup: () => new Map<string, number>(),
    cleanup: held => { held.clear(); },
  });
  const counter = {
    increment: (key: string): number => { const next = (counts.get(key) ?? 0) + 1; counts.set(key, next); return next; },
  };
  const port: CounterPort = {
    increment: key => incrementCount({ counter }, { key }),
    count: key => counts.get(key) ?? 0,
  };
  return { instance: port, capabilities: { 'test/counter/counter': port } };
}, scoped);
