import { declareModule } from '@get-modular/assembly';
import { Journal, SessionId } from './contracts.ts';

export const journalInput = declareModule({
  moduleId: 'test/sessions/journal', implementationId: 'test/sessions/journal/input',
  owner: { authority: 'test', path: ['sessions', 'journal'] }, provides: [Journal.provide()], slots: [],
});
export const sessionInput = declareModule({
  moduleId: 'test/sessions/session-id', implementationId: 'test/sessions/session-id/input',
  owner: { authority: 'test', path: ['sessions', 'session-id'] }, provides: [SessionId.provide()], slots: [],
});
