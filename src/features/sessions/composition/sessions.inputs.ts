import { input } from '@get-modular/assembly';
import { journalDeclaration } from './journal.declaration.ts';
import { sessionIdDeclaration } from './session-id.declaration.ts';
import type { SessionCapabilities } from './sessions.contracts.ts';

export const journalInput = input<SessionCapabilities>()(journalDeclaration);
export const sessionInput = input<SessionCapabilities>()(sessionIdDeclaration);
