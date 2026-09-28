import type { Action, Root } from '../graph.ts';
export function create(deps: { actions: readonly Action[] }, owner: { assertReady(): void }): Promise<{ instance: Root; capabilities: Record<string, never> }>;
