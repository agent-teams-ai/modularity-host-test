import { group } from '@get-modular/assembly';
import { cacheModule } from './cache.module.ts';
import { storeModule } from './store.module.ts';

export const storageGroup = group('storage', [
  cacheModule,
  storeModule,
]);
