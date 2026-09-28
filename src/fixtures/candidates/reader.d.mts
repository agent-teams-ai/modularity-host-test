import type { Read, Action } from '../graph.ts';
export function create(deps: { resource: Read }): Promise<{ instance: object; capabilities: { 'test/action': Action } }>;
