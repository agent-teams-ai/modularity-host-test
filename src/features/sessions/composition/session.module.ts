import { implement } from '@get-modular/assembly';
import { roundTrip } from '../application/use-cases/round-trip.ts';
import type { SessionPort } from '../contracts/session-ports.ts';
import { sessionDeclaration } from './session.declaration.ts';
import type { SessionCapabilities } from './sessions.contracts.ts';

export const sessionModule = implement<SessionCapabilities>()(sessionDeclaration, async deps => {
  const port: SessionPort = {
    id: deps.session.id,
    roundTrip: value => roundTrip({ store: deps.store, cache: deps.cache, counter: deps.counter }, { value }),
    count: key => deps.counter.count(key),
  };
  return { instance: port, capabilities: { 'test/sessions/session': port } };
});
