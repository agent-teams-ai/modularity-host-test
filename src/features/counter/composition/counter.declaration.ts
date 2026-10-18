import { declareModule } from '@get-modular/assembly';
import { Counter } from './counter.contracts.ts';

export const counterDeclaration = declareModule({
  moduleId: 'test/counter/counter', implementationId: 'test/counter/counter/default',
  owner: { authority: 'test', path: ['counter'] },
  provides: [Counter.provide()], slots: [],
});
