import type { Write, Action } from '../graph.ts';
export function create(deps: { resource: Write }): Promise<{ instance: object; capabilities: { 'test/action': Action } }>;
