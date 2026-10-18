import { defineContract, type CapabilitiesOf } from '@get-modular/assembly';
import type { CounterCapabilities } from '../../counter/composition/counter.contracts.ts';
import type { StorageCapabilities } from '../features/storage/composition/storage.contracts.ts';
import type { JournalPort, SessionInfo, SessionPort } from '../contracts/session-ports.ts';

export const Journal = defineContract<JournalPort>()({ id: 'test/sessions/journal', revision: 1 });
export const SessionId = defineContract<SessionInfo>()({ id: 'test/sessions/session-id', revision: 1 });
export const Session = defineContract<SessionPort>()({ id: 'test/sessions/session', revision: 2 });

export interface SessionCapabilities extends StorageCapabilities, CounterCapabilities, CapabilitiesOf<typeof Session> {}
