// Inert TEST data. Candidate modules are never imported by this inventory.
export const target = 'test-host/local';

export type Capability = Readonly<{ id: string; token: string }>;
export type Candidate = Readonly<{
  moduleId: string;
  implementationId: string;
  subject: string;
  provides: readonly Capability[];
}>;

export const candidates: readonly Candidate[] = Object.freeze([
  { moduleId: 'test/provider', implementationId: 'test/provider/a', subject: 'fixture/provider', provides: [
    { id: 'test/resource/read', token: 'test/resource/read/v1' },
    { id: 'test/resource/write', token: 'test/resource/write/v1' },
  ] },
  { moduleId: 'test/provider', implementationId: 'test/provider/b', subject: 'fixture/provider', provides: [
    { id: 'test/resource/read', token: 'test/resource/read/v1' },
    { id: 'test/resource/write', token: 'test/resource/write/v1' },
  ] },
  { moduleId: 'test/writer', implementationId: 'test/writer/main', subject: 'fixture/writer', provides: [
    { id: 'test/action', token: 'test/action/v1' },
  ] },
  { moduleId: 'test/reader', implementationId: 'test/reader/main', subject: 'fixture/reader', provides: [
    { id: 'test/action', token: 'test/action/v1' },
  ] },
  { moduleId: 'test/root/main', implementationId: 'test/root/main', subject: 'fixture/root', provides: [] },
  { moduleId: 'test/sentinel', implementationId: 'test/sentinel/main', subject: 'fixture/sentinel', provides: [] },
].map(candidate => Object.freeze({ ...candidate, provides: Object.freeze(candidate.provides.map(capability => Object.freeze(capability))) })));

export type Grant = Readonly<{
  subject: string;
  target: string;
  namespace: string;
  provisions: readonly string[];
  receives: readonly string[];
}>;

// The provision list contains exact ID/token pairs, never wildcard grants.
export const grants: readonly Grant[] = Object.freeze([
  { subject: 'fixture/provider', target, namespace: 'test/provider', provisions: [
    'test/resource/read|test/resource/read/v1', 'test/resource/write|test/resource/write/v1',
  ], receives: [] },
  { subject: 'fixture/writer', target, namespace: 'test/writer', provisions: [
    'test/action|test/action/v1',
  ], receives: ['fixture/provider|test/resource/write|test/resource/write/v1'] },
  { subject: 'fixture/reader', target, namespace: 'test/reader', provisions: [
    'test/action|test/action/v1',
  ], receives: ['fixture/provider|test/resource/read|test/resource/read/v1'] },
  { subject: 'fixture/root', target, namespace: 'test/root', provisions: [], receives: [
    'fixture/writer|test/action|test/action/v1', 'fixture/reader|test/action|test/action/v1',
  ] },
  { subject: 'fixture/sentinel', target, namespace: 'test/sentinel', provisions: [], receives: [] },
].map(grant => Object.freeze({ ...grant, provisions: Object.freeze(grant.provisions), receives: Object.freeze(grant.receives) })));
