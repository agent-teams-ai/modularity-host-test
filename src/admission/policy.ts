import { candidates, grants, target, type Candidate, type Grant } from '../inventory/trusted.ts';

export type Injection = Readonly<{
  slot: string;
  providerImplementationId: string;
  capabilityId: string;
  token: string;
}>;
export type Selection = Readonly<{
  moduleId: string;
  implementationId: string;
  ownerLabel: string;
  target: string;
  injections: readonly Injection[];
}>;
export type Request = Readonly<{ selections: readonly Selection[] }>;
export type Admitted = Readonly<{ target: string; selections: readonly Selection[]; inventory: readonly Candidate[] }>;
export type Refusal = Readonly<{ ok: false; phase: 'admission'; reason: string }>;
export type Decision = Readonly<{ ok: true; snapshot: Admitted }> | Refusal;

const refuse = (reason: string): Refusal => Object.freeze({ ok: false, phase: 'admission', reason });
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: readonly string[]): boolean =>
  Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128;
const namespaceContains = (namespace: string, value: string): boolean =>
  value === namespace || value.startsWith(`${namespace}/`);

// Copy every request field before the first await. This parser accepts JSON data,
// not executable object graphs or proxies; its exact keys bound what can be kept.
function parseRequest(input: unknown, maxSelections: number): Request | undefined {
  if (!record(input) || !keys(input, ['selections']) || !Array.isArray(input.selections) ||
      input.selections.length < 1 || input.selections.length > maxSelections) return;
  const selections: Selection[] = [];
  for (const raw of input.selections) {
    if (!record(raw) || !keys(raw, ['moduleId', 'implementationId', 'ownerLabel', 'target', 'injections']) ||
        !id(raw.moduleId) || !id(raw.implementationId) || !id(raw.ownerLabel) || !id(raw.target) ||
        !Array.isArray(raw.injections) || raw.injections.length > 4) return;
    const injections: Injection[] = [];
    for (const edge of raw.injections) {
      if (!record(edge) || !keys(edge, ['slot', 'providerImplementationId', 'capabilityId', 'token']) ||
          !id(edge.slot) || !id(edge.providerImplementationId) || !id(edge.capabilityId) || !id(edge.token)) return;
      injections.push(Object.freeze({ slot: edge.slot, providerImplementationId: edge.providerImplementationId,
        capabilityId: edge.capabilityId, token: edge.token }));
    }
    selections.push(Object.freeze({ moduleId: raw.moduleId, implementationId: raw.implementationId,
      ownerLabel: raw.ownerLabel, target: raw.target, injections: Object.freeze(injections) }));
  }
  return Object.freeze({ selections: Object.freeze(selections) });
}

export function admit(input: unknown): Decision {
  return admitTrusted(input, candidates, grants);
}

// Trusted inputs stay separate from request JSON; tests can audit malformed trust tables.
export function admitTrusted(input: unknown, inventoryRows: readonly Candidate[], grantTable: readonly Grant[]): Decision {
  const request = parseRequest(input, inventoryRows.length);
  if (!request) return refuse('malformed-request');
  const modules = new Set<string>();
  const implementations = new Set<string>();
  for (const selected of request.selections) {
    if (modules.has(selected.moduleId)) return refuse('duplicate-module');
    if (implementations.has(selected.implementationId)) return refuse('duplicate-implementation');
    modules.add(selected.moduleId);
    implementations.add(selected.implementationId);
  }
  // Inspect the arrays before indexing. Map construction would hide ambiguity.
  for (const selected of request.selections) {
    const matches = inventoryRows.filter(candidate => candidate.implementationId === selected.implementationId &&
      candidate.moduleId === selected.moduleId);
    if (matches.length !== 1 || inventoryRows.filter(candidate => candidate.implementationId === selected.implementationId).length !== 1)
      return refuse(matches.length ? 'ambiguous-inventory' : 'unknown-selection');
    const candidate = matches[0]!;
    if (selected.target !== target) return refuse('wrong-target');
    if (selected.ownerLabel !== candidate.subject) return refuse('forged-owner');
    const grantRows = grantTable.filter(grant => grant.subject === candidate.subject && grant.target === target);
    if (grantRows.length !== 1) return refuse('subject-grant');
    const grant = grantRows[0]!;
    if (!namespaceContains(grant.namespace, selected.moduleId) ||
        !namespaceContains(grant.namespace, selected.implementationId)) return refuse('namespace');
    for (const capability of candidate.provides) {
      if (!grant.provisions.includes(`${capability.id}|${capability.token}`)) return refuse('provision-grant');
    }
  }
  for (const selected of request.selections) {
    const consumer = inventoryRows.find(candidate => candidate.implementationId === selected.implementationId)!;
    const grant = grantTable.find(row => row.subject === consumer.subject && row.target === target)!;
    const edges = new Set<string>();
    for (const edge of selected.injections) {
      const edgeKey = `${edge.slot}|${edge.providerImplementationId}`;
      if (edges.has(edgeKey)) return refuse('duplicate-injection');
      edges.add(edgeKey);
      if (!implementations.has(edge.providerImplementationId)) return refuse('unselected-provider');
      const provider = inventoryRows.find(candidate => candidate.implementationId === edge.providerImplementationId)!;
      if (!provider.provides.some(capability => capability.id === edge.capabilityId && capability.token === edge.token))
        return refuse('provider-capability');
      if (!grant.receives.includes(`${provider.subject}|${edge.capabilityId}|${edge.token}`))
        return refuse('injection-grant');
    }
  }
  const inventory = Object.freeze(request.selections.map(selected =>
    inventoryRows.find(candidate => candidate.implementationId === selected.implementationId)!));
  return Object.freeze({ ok: true, snapshot: Object.freeze({ target, selections: request.selections, inventory }) });
}
