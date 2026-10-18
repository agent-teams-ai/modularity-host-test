import type { Assembly } from '@get-modular/assembly';
import { counterGroup } from '../features/counter/composition/counter.group.ts';
import { journalInput, sessionInput } from '../features/sessions/composition/sessions.inputs.ts';
import { sessionsGroup } from '../features/sessions/composition/sessions.group.ts';
import { sessionModule } from '../features/sessions/composition/session.module.ts';
import type { SessionCapabilities } from '../features/sessions/composition/sessions.contracts.ts';

export const templateModules = [counterGroup, sessionsGroup] as const;

export async function composeTemplate(api: Assembly<SessionCapabilities>) {
  return api.prepare({
    profileId: 'test/sessions/template',
    modules: templateModules,
    roots: { session: sessionModule },
    inputs: { journal: journalInput, session: sessionInput },
  });
}
