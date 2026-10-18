import type { WiringOracle } from '@get-modular/conformance';

export const counterWiring: WiringOracle = {
  providers: { 'test/counter/counter': 'test/counter/counter/default' },
};
