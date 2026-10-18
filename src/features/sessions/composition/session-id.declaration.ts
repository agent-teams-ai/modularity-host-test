import { declareModule } from '@get-modular/assembly';
import { SessionId } from './sessions.contracts.ts';

export const sessionIdDeclaration = declareModule({
  moduleId: 'test/sessions/session-id', implementationId: 'test/sessions/session-id/input',
  owner: { authority: 'test', path: ['sessions', 'session-id'] },
  provides: [SessionId.provide()], slots: [],
});
