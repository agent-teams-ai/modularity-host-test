import { declareModule } from '@get-modular/assembly';
import { Journal } from './sessions.contracts.ts';

export const journalDeclaration = declareModule({
  moduleId: 'test/sessions/journal', implementationId: 'test/sessions/journal/input',
  owner: { authority: 'test', path: ['sessions', 'journal'] },
  provides: [Journal.provide()], slots: [],
});
