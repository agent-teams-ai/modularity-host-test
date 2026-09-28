import type { Action, Root } from '../graph.ts';
export function create(deps: { actions: readonly Action[] }): Promise<{ instance: Root; capabilities: Record<string, never> }>;
