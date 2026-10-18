/** `put` throws a TypeError whose `code` is INVALID_KEY for an empty key. */
export type StorePort = {
  readonly put: (key: string, value: string) => void;
  readonly get: (key: string) => string | undefined;
};
export type CachePort = { readonly read: (key: string) => string | undefined };

export const INVALID_KEY = 'test.sessions.invalid-key';
