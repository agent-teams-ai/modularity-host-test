import { defineContract, type CapabilitiesOf } from '@get-modular/assembly';

export type JournalPort = { readonly append: (entry: string) => void };
export type SessionInfo = { readonly id: string };
/** `put` throws a TypeError whose `code` is INVALID_KEY for an empty key. */
export type StorePort = {
  readonly put: (key: string, value: string) => void;
  readonly get: (key: string) => string | undefined;
};
export type CachePort = { readonly read: (key: string) => string | undefined };
export type SessionPort = { readonly id: string; readonly roundTrip: (value: string) => string | undefined };

export const INVALID_KEY = 'test.sessions.invalid-key';

export const Journal = defineContract<JournalPort>()({ id: 'test/sessions/journal', revision: 1 });
export const SessionId = defineContract<SessionInfo>()({ id: 'test/sessions/session-id', revision: 1 });
export const Store = defineContract<StorePort>()({ id: 'test/sessions/store', revision: 1 });
export const Cache = defineContract<CachePort>()({ id: 'test/sessions/cache', revision: 1 });
export const Session = defineContract<SessionPort>()({ id: 'test/sessions/session', revision: 1 });

export interface SessionCapabilities extends CapabilitiesOf<
  typeof Journal | typeof SessionId | typeof Store | typeof Cache | typeof Session> {}
