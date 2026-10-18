import type { WiringOracle } from '@get-modular/conformance';

export const sessionsWiring: WiringOracle = {
  providers: {
    'test/sessions/journal': 'test/sessions/journal/input',
    'test/sessions/session-id': 'test/sessions/session-id/input',
    'test/sessions/session': 'test/sessions/session/default',
  },
  roots: ['test/sessions/session/default'],
};
