import { compileComposition, type CompositionProfile, type CompileCompositionResult } from '@get-modular/core';
import { assemblyFor, type AssemblyOutcome, type AnyFactoryHandle } from '@get-modular/assembly';
import { admit } from './policy.ts';
import { declarations, providerA, providerB, writer, reader, root, sentinel, type Contracts, type Root } from '../fixtures/graph.ts';
import { OneShotOwner, type OwnedResource } from '../host/one-shot.ts';

export type LoaderId = 'test/provider/a' | 'test/provider/b' | 'test/writer/main' | 'test/reader/main' | 'test/root/main' | 'test/sentinel/main';
export type LoaderRow = Readonly<{ implementationId: LoaderId; load: () => Promise<unknown> }>;
// Literal executable paths are fixed in this TEST repository; request data cannot supply paths.
export const loaders: readonly LoaderRow[] = Object.freeze([
  { implementationId: 'test/provider/a', load: () => import('../fixtures/candidates/a.mjs') },
  { implementationId: 'test/provider/b', load: () => import('../fixtures/candidates/b.mjs') },
  { implementationId: 'test/writer/main', load: () => import('../fixtures/candidates/writer.mjs') },
  { implementationId: 'test/reader/main', load: () => import('../fixtures/candidates/reader.mjs') },
  { implementationId: 'test/root/main', load: () => import('../fixtures/candidates/root.mjs') },
  { implementationId: 'test/sentinel/main', load: () => import('../fixtures/candidates/sentinel.mjs') },
]);
export type RunResult =
  | { phase: 'admission'; reason: string }
  | { phase: 'core'; diagnostics: readonly string[] }
  | { phase: 'mapping'; reason: string }
  | { phase: 'preparation'; code: string }
  | { phase: 'construction'; status: string; code?: string; created: number; values?: readonly string[]; identities?: readonly string[]; sharedResource?: boolean; effects: readonly string[]; digest: string; order: readonly string[] };

import { appendFileSync } from 'node:fs';
const marker = (event: string): void => {
  if (process.env.TEST_MARKERS) appendFileSync(process.env.TEST_MARKERS, `${event}\n`);
};
const isModule = <T extends { create: Function }>(value: unknown): value is T =>
  value !== null && typeof value === 'object' && 'create' in value && typeof value.create === 'function';

export async function runAdmission(input: unknown, rows: readonly LoaderRow[] = loaders,
  profileEdit?: (profile: CompositionProfile) => CompositionProfile): Promise<RunResult> {
  const decision = admit(input);
  if (!decision.ok) return { phase: 'admission', reason: decision.reason };
  const selections = decision.snapshot.selections;
  const profile: CompositionProfile = {
    kind: 'get-modular.composition-profile', schemaVersion: 1, profileId: 'test/admission', roots: ['test/root/main'],
    selections: selections.map(({ moduleId, implementationId }) => ({ moduleId, implementationId })),
    bindings: selections.flatMap(selection => {
      const slots = [...new Set(selection.injections.map(edge => edge.slot))];
      return slots.map(slotId => ({ consumerImplementationId: selection.implementationId, slotId,
        providerImplementationIds: selection.injections.filter(edge => edge.slot === slotId).map(edge => edge.providerImplementationId) }));
    }),
  };
  let composition: CompileCompositionResult;
  try { composition = await compileComposition({ declarations, profile: profileEdit ? profileEdit(profile) : profile }); }
  catch { return { phase: 'core', diagnostics: ['core-threw'] }; }
  if (!composition.ok) return { phase: 'core', diagnostics: composition.diagnostics.map(item => item.code) };
  // Check all selected IDs before any wrapper can be invoked.
  for (const selected of selections) {
    if (rows.filter(row => row.implementationId === selected.implementationId).length !== 1)
      return { phase: 'mapping', reason: 'selected-loader-cardinality' };
  }
  const owner = new OneShotOwner();
  const providerPort = Object.freeze({
    acquire: (resource: OwnedResource) => owner.acquire(resource),
    effect: (value: string) => owner.effect(value),
  });
  const api = assemblyFor<Contracts>();
  const admitted = (id: string): boolean => selections.some(selection => selection.implementationId === id);
  const load = async (id: LoaderId): Promise<unknown> => {
    if (!admitted(id) || !owner.isOpen()) throw new Error('loader-authority-closed');
    const row = rows.find(item => item.implementationId === id);
    if (!row) throw new Error('missing-loader');
    marker(`${id}:loader`);
    const module = await row.load();
    if (!admitted(id) || !owner.isOpen()) throw new Error('post-import-authority-closed');
    return module;
  };
  let constructionStarted = false;
  try {
    const a = api.bindFactory(providerA, async (deps) => {
      const mod = await load('test/provider/a');
      if (!isModule<{ create: typeof import('../fixtures/candidates/a.mjs').create }>(mod)) throw new Error('bad-export');
      return mod.create(deps, providerPort);
    });
    const b = api.bindFactory(providerB, async (deps) => {
      const mod = await load('test/provider/b');
      if (!isModule<{ create: typeof import('../fixtures/candidates/b.mjs').create }>(mod)) throw new Error('bad-export');
      return mod.create(deps, providerPort);
    });
    const w = api.bindFactory(writer, async deps => {
      const mod = await load('test/writer/main');
      if (!isModule<{ create: typeof import('../fixtures/candidates/writer.mjs').create }>(mod)) throw new Error('bad-export');
      return mod.create(deps);
    });
    const r = api.bindFactory(reader, async deps => {
      const mod = await load('test/reader/main');
      if (!isModule<{ create: typeof import('../fixtures/candidates/reader.mjs').create }>(mod)) throw new Error('bad-export');
      return mod.create(deps);
    });
    const app = api.bindFactory(root, async deps => {
      const mod = await load('test/root/main');
      if (!isModule<{ create: typeof import('../fixtures/candidates/root.mjs').create }>(mod)) throw new Error('bad-export');
      return mod.create(deps);
    });
    const s = api.bindFactory(sentinel, async () => {
      const mod = await load('test/sentinel/main');
      if (!isModule<{ create: typeof import('../fixtures/candidates/sentinel.mjs').create }>(mod)) throw new Error('bad-export');
      return mod.create();
    });
    const selectedHandles: AnyFactoryHandle<Contracts>[] = [];
    if (admitted('test/provider/a')) selectedHandles.push(a);
    if (admitted('test/provider/b')) selectedHandles.push(b);
    if (admitted('test/writer/main')) selectedHandles.push(w);
    if (admitted('test/reader/main')) selectedHandles.push(r);
    if (admitted('test/root/main')) selectedHandles.push(app);
    if (admitted('test/sentinel/main')) selectedHandles.push(s);
    const prepared = await api.prepare({ composition, factories: selectedHandles, roots: { app } });
    if (prepared.status !== 'prepared') return { phase: 'preparation', code: prepared.error.code };
    let outcome: AssemblyOutcome<{ app: typeof app }>;
    constructionStarted = true;
    try { outcome = await prepared.prepared.run(); }
    catch { return { phase: 'construction', status: 'threw', created: 0, effects: owner.effects, digest: composition.digest, order: composition.plan.dependencyOrder }; }
    if (outcome.status !== 'succeeded') return { phase: 'construction', status: outcome.status,
      code: outcome.status === 'failed' ? outcome.code : undefined, created: outcome.created.length,
      effects: owner.effects, digest: composition.digest, order: composition.plan.dependencyOrder };
    const instance: Root = outcome.roots.app;
    const values = instance.run();
    const identities = instance.identities();
    const sharedResource = instance.sharedResource();
    return { phase: 'construction', status: 'succeeded', created: outcome.created.length,
      values, identities, sharedResource, effects: [...owner.effects], digest: composition.digest, order: composition.plan.dependencyOrder };
  } catch {
    if (constructionStarted) return { phase: 'construction', status: 'threw', created: 0, effects: [...owner.effects], digest: composition.digest, order: composition.plan.dependencyOrder };
    return { phase: 'preparation', code: 'bind-or-prepare-threw' };
  }
  finally { owner.close(); }
}
