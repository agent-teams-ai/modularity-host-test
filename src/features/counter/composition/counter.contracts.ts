import { defineContract, type CapabilitiesOf } from '@get-modular/assembly';
import type { CounterPort } from '../contracts/counter-port.ts';

export const Counter = defineContract<CounterPort>()({ id: 'test/counter/counter', revision: 1 });
export interface CounterCapabilities extends CapabilitiesOf<typeof Counter> {}
