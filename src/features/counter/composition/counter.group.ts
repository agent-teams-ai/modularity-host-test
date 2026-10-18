import { group } from '@get-modular/assembly';
import { counterModule } from './counter.module.ts';

export const counterGroup = group('counter', [
  counterModule,
]);
