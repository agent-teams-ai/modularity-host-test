import type { AssemblyOutcome } from '@get-modular/assembly';
import type { CloseReport, Resources, ScopeControl } from '@get-modular/resources';
import type { composeSessions } from './compose.ts';
import type { JournalPort, SessionPort } from './contracts.ts';

type Preparation = Awaited<ReturnType<typeof composeSessions>>;
export type SessionTemplate = Extract<Preparation, { readonly status: 'prepared' }>['prepared'];

/** Host deadline policy from the Consumer Module Standard: escalate, then abandon, with referenced timers. */
export async function closeWithin(control: ScopeControl, graceMs: number, abandonMs: number): Promise<CloseReport> {
  const escalate = new AbortController();
  const abandon = new AbortController();
  const toEscalate = setTimeout(() => { escalate.abort(); }, graceMs);
  const toAbandon = setTimeout(() => { abandon.abort(); }, graceMs + abandonMs);
  try {
    return await control.close({ escalate: escalate.signal, abandon: abandon.signal });
  } finally {
    clearTimeout(toEscalate);
    clearTimeout(toAbandon);
  }
}

export type OpenedSession =
  | { readonly ok: true; readonly session: SessionPort; readonly lifetime: ScopeControl }
  | { readonly ok: false; readonly outcome: Exclude<AssemblyOutcome<unknown>, { readonly status: 'succeeded' }>; readonly report: CloseReport };

/** One instance per run: reserve its scope before the first await, publish only after success. */
export async function openSession(template: SessionTemplate, sessions: Resources,
  input: { readonly id: string; readonly journal: JournalPort }, signal?: AbortSignal): Promise<OpenedSession> {
  const instance = sessions.child({ name: `session:${input.id}` });
  const outcome = await template.run({ signal, scope: instance.resources, inputs: {
    journal: { 'test/sessions/journal': input.journal },
    session: { 'test/sessions/session-id': { id: input.id } },
  } });
  if (outcome.status !== 'succeeded') {
    return { ok: false, outcome, report: await closeWithin(instance.control, 1_000, 1_000) };
  }
  return { ok: true, session: outcome.roots.session, lifetime: instance.control };
}
