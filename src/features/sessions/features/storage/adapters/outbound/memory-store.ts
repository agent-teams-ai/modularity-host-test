import { INVALID_KEY, type StorePort } from '../../contracts/storage-ports.ts';

export function createMemoryStore(values: Map<string, string>): StorePort {
  return {
    put: (key, value) => {
      if (key === '') throw Object.assign(new TypeError('a store key must not be empty'), { code: INVALID_KEY });
      values.set(key, value);
    },
    get: key => values.get(key),
  };
}
