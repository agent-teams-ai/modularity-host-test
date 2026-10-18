import { implement } from '@get-modular/assembly';
import { scoped } from '@get-modular/resources';
import { createMemoryStore } from '../adapters/outbound/memory-store.ts';
import type { StorePort } from '../contracts/storage-ports.ts';
import { storeDeclaration } from './store.declaration.ts';
import type { StorageCapabilities } from './storage.contracts.ts';

export const storeModule = implement<StorageCapabilities>()(storeDeclaration, async (deps, { resources }) => {
  const values = await resources.setup({
    name: 'values',
    setup: () => { deps.journal.append(`acquire:store:${deps.session.id}`); return new Map<string, string>(); },
    cleanup: held => { held.clear(); deps.journal.append(`release:store:${deps.session.id}`); },
  });
  const port: StorePort = createMemoryStore(values);
  return { instance: port, capabilities: { 'test/sessions/store': port } };
}, scoped);
