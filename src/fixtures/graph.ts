import { defineModule, required, many } from '@get-modular/core';

export type Read = { readonly resourceId: string; readonly resourceIdentity: symbol; read(): string };
export type Write = { readonly resourceId: string; readonly resourceIdentity: symbol; write(value: string): string };
export type Action = { readonly resourceId: string; readonly resourceIdentity: symbol; run(): string };
export type Root = { run(): readonly string[]; identities(): readonly string[]; sharedResource(): boolean };
export type Contracts = {
  'test/resource/read': { value: Read; compatibility: { family: 'exact'; familyVersion: 1; token: 'test/resource/read/v1' } };
  'test/resource/write': { value: Write; compatibility: { family: 'exact'; familyVersion: 1; token: 'test/resource/write/v1' } };
  'test/action': { value: Action; compatibility: { family: 'exact'; familyVersion: 1; token: 'test/action/v1' } };
};
const read = { capabilityId: 'test/resource/read', compatibility: { family: 'exact', familyVersion: 1, token: 'test/resource/read/v1' } } as const;
const write = { capabilityId: 'test/resource/write', compatibility: { family: 'exact', familyVersion: 1, token: 'test/resource/write/v1' } } as const;
const action = { capabilityId: 'test/action', compatibility: { family: 'exact', familyVersion: 1, token: 'test/action/v1' } } as const;
export const providerA = defineModule({ kind: 'get-modular.module-declaration', schemaVersion: 1,
  moduleId: 'test/provider', implementationId: 'test/provider/a', owner: { authority: 'fixture-provider', path: ['test', 'provider'] },
  provides: [read, write], slots: [] } as const);
export const providerB = defineModule({ ...providerA, implementationId: 'test/provider/b' } as const);
export const writer = defineModule({ kind: 'get-modular.module-declaration', schemaVersion: 1,
  moduleId: 'test/writer', implementationId: 'test/writer/main', owner: { authority: 'fixture-writer', path: ['test', 'writer'] },
  provides: [action], slots: [{ slotId: 'resource', ...write, cardinality: required() }] } as const);
export const reader = defineModule({ kind: 'get-modular.module-declaration', schemaVersion: 1,
  moduleId: 'test/reader', implementationId: 'test/reader/main', owner: { authority: 'fixture-reader', path: ['test', 'reader'] },
  provides: [action], slots: [{ slotId: 'resource', ...read, cardinality: required() }] } as const);
export const root = defineModule({ kind: 'get-modular.module-declaration', schemaVersion: 1,
  moduleId: 'test/root/main', implementationId: 'test/root/main', owner: { authority: 'fixture-root', path: ['test', 'root'] },
  provides: [], slots: [{ slotId: 'actions', ...action, cardinality: many({ min: 2, max: 2 }) }] } as const);
export const sentinel = defineModule({ kind: 'get-modular.module-declaration', schemaVersion: 1,
  moduleId: 'test/sentinel', implementationId: 'test/sentinel/main', owner: { authority: 'fixture-sentinel', path: ['test', 'sentinel'] },
  provides: [], slots: [] } as const);
export const declarations = [providerA, providerB, writer, reader, root, sentinel] as const;
