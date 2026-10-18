import { group } from '@get-modular/assembly';
import { storageGroup } from '../features/storage/composition/storage.group.ts';
import { sessionModule } from './session.module.ts';

export const sessionsGroup = group('sessions', [
  sessionModule,
  storageGroup,
]);
