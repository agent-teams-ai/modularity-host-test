import type { CountStoreForIncrement } from '../ports/count-store.ts';

export type IncrementCountDeps = { readonly counter: CountStoreForIncrement };

export function incrementCount(deps: IncrementCountDeps, input: { readonly key: string }): number {
  return deps.counter.increment(input.key);
}
