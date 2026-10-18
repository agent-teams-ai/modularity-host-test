import type { WiringOracle } from '@get-modular/conformance';

export const storageWiring: WiringOracle = {
  providers: {
    'test/sessions/cache': 'test/sessions/cache/default',
    'test/sessions/store': 'test/sessions/store/memory',
  },
};
