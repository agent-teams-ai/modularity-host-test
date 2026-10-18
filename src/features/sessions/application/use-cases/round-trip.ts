import type { RoundTripPorts } from '../ports/round-trip-ports.ts';

export function roundTrip(deps: RoundTripPorts, input: { readonly value: string }): string | undefined {
  deps.counter.increment('value');
  deps.store.put('value', input.value);
  return deps.cache.read('value');
}
