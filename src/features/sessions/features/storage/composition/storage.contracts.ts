import { defineContract, type CapabilitiesOf } from '@get-modular/assembly';
import type { Journal, SessionId } from '../../../composition/sessions.contracts.ts';
import type { CachePort, StorePort } from '../contracts/storage-ports.ts';

export const Store = defineContract<StorePort>()({ id: 'test/sessions/store', revision: 1 });
export const Cache = defineContract<CachePort>()({ id: 'test/sessions/cache', revision: 1 });

export interface StorageCapabilities extends CapabilitiesOf<
  typeof Journal | typeof SessionId | typeof Store | typeof Cache> {}
