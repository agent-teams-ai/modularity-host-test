import { implement } from '@get-modular/assembly';
import { scoped } from '@get-modular/resources';
import type { CachePort } from '../contracts/storage-ports.ts';
import { cacheDeclaration } from './cache.declaration.ts';
import type { StorageCapabilities } from './storage.contracts.ts';

export const cacheModule = implement<StorageCapabilities>()(cacheDeclaration, async (deps, { resources }) => {
  const seen = await resources.setup({
    name: 'seen',
    setup: () => { deps.journal.append(`acquire:cache:${deps.session.id}`); return new Set<string>(); },
    cleanup: held => { held.clear(); deps.journal.append(`release:cache:${deps.session.id}`); },
  });
  const port: CachePort = { read: key => { seen.add(key); return deps.store.get(key); } };
  return { instance: port, capabilities: { 'test/sessions/cache': port } };
}, scoped);
