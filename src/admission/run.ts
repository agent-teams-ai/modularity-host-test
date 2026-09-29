import { compileComposition, type CompositionProfile, type CompileCompositionResult } from '@get-modular/core';
import { assemblyFor, type AssemblyOutcome, type AnyFactoryHandle } from '@get-modular/assembly';
import { admitTrusted, type Admitted } from './policy.ts';
import { candidates, grants, type Candidate, type Grant } from '../inventory/trusted.ts';
import { declarations, providerA, providerB, writer, reader, root, sentinel, type Contracts, type Root } from '../fixtures/graph.ts';
import { TestHost, type OwnedResource } from '../host/lifetime.ts';

export type LoaderId = 'test/provider/a' | 'test/provider/b' | 'test/writer/main' | 'test/reader/main' | 'test/root/main' | 'test/sentinel/main';
export type LoaderRow = Readonly<{ implementationId: LoaderId; load: () => Promise<unknown> }>;
export type TrustedAuthorities = Readonly<{ inventory: readonly Candidate[]; grants: readonly Grant[] }>;
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
  | { phase: 'construction'; status: string; code?: string; created: number; values?: readonly string[]; identities?: readonly string[]; sharedResource?: boolean; rootReportedSharedResource?: boolean; effects: readonly string[]; digest: string; order: readonly string[] };

import { appendFileSync } from 'node:fs';
const marker = (event: string): void => {
  if (process.env.TEST_MARKERS) appendFileSync(process.env.TEST_MARKERS, `${event}\n`);
};
const isModule = <T extends { create: Function }>(value: unknown): value is T =>
  value !== null && typeof value === 'object' && 'create' in value && typeof value.create === 'function';

export function projectProfile(snapshot: Admitted): CompositionProfile {
  const selections = snapshot.selections;
  return {
    kind: 'get-modular.composition-profile', schemaVersion: 1, profileId: 'test/admission', roots: ['test/root/main'],
    selections: selections.map(({ moduleId, implementationId }) => ({ moduleId, implementationId })),
    bindings: selections.flatMap(selection => {
      const slots = [...new Set(selection.injections.map(edge => edge.slot))];
      return slots.map(slotId => ({ consumerImplementationId: selection.implementationId, slotId,
        providerImplementationIds: selection.injections.filter(edge => edge.slot === slotId).map(edge => edge.providerImplementationId) }));
    }),
  };
}

type RunOutcome = { status: 'succeeded'; roots: { app: Root }; created: readonly unknown[] }
  | { status: 'failed' | 'cancelled'; code?: string; created: readonly unknown[] };
export type PreparedAdmission = Readonly<{ ok: true; owner: TestHost<Root, RunOutcome>; snapshot: Admitted;
  digest: string; order: readonly string[]; run(signal: AbortSignal): Promise<RunOutcome> }>;
export type PreparationRefusal = Extract<RunResult, { phase: 'admission' | 'core' | 'mapping' | 'preparation' }>;
export type PreparationOptions = Readonly<{
  owner?: TestHost<Root, RunOutcome>;
  /** Trusted Host live policy, rechecked around every executable boundary. */
  fresh?: () => boolean;
  /** TEST physical owner adapter, never supplied by candidate metadata. */
  reserve?: (owner: TestHost<Root, RunOutcome>) => (resource: OwnedResource) => void;
  /** Bound callback scope ends at the loader/factory's raw settlement. */
  invoke?: <T>(callback: () => T | Promise<T>) => Promise<T>;
}>;

/** Complete selected graph preparation. No candidate loader is called here. */
export async function prepareAdmission(input: unknown, rows: readonly LoaderRow[] = loaders,
  profileEdit?: (profile: CompositionProfile) => CompositionProfile,
  authorities: TrustedAuthorities = { inventory: candidates, grants },
  options: PreparationOptions = {}): Promise<PreparedAdmission | PreparationRefusal> {
  const decision = admitTrusted(input, authorities.inventory, authorities.grants);
  if (!decision.ok) return { phase: 'admission', reason: decision.reason };
  const selections = decision.snapshot.selections;
  const profile = projectProfile(decision.snapshot);
  let composition: CompileCompositionResult;
  try { composition = await compileComposition({ declarations, profile: profileEdit ? profileEdit(profile) : profile }); }
  catch { return { phase: 'core', diagnostics: ['core-threw'] }; }
  if (!composition.ok) return { phase: 'core', diagnostics: composition.diagnostics.map(item => item.code) };
  // Check all selected IDs before any wrapper can be invoked.
  for (const selected of selections) {
    if (rows.filter(row => row.implementationId === selected.implementationId).length !== 1)
      return { phase: 'mapping', reason: 'selected-loader-cardinality' };
  }
  const owner = options.owner ?? new TestHost<Root, RunOutcome>();
  const fresh = (): boolean => options.fresh?.() ?? true;
  const requireFresh = (): void => { if (!fresh()) throw new Error('live-authority-revoked'); };
  const providerPort = Object.freeze({
    reserve: (): ((resource: OwnedResource) => void) => { requireFresh(); return options.reserve?.(owner) ?? owner.reserve(); },
    effect: (value: string) => { requireFresh(); owner.effect(value); },
    read: <T>(read: () => T): T => { requireFresh(); return owner.read(read); },
    assertReady: () => { requireFresh(); owner.assertOperationReady(); },
  });
  const api = assemblyFor<Contracts>();
  const admitted = (id: string): boolean => selections.some(selection => selection.implementationId === id);
  const assertFactoryOpen = (): void => {
    requireFresh();
    if (!owner.isOpen()) throw new Error('factory-authority-closed');
  };
  const load = async (id: LoaderId): Promise<unknown> => {
    requireFresh();
    if (!admitted(id) || !owner.isOpen()) throw new Error('loader-authority-closed');
    const row = rows.find(item => item.implementationId === id);
    if (!row) throw new Error('missing-loader');
    marker(`${id}:loader`);
    const module = await (options.invoke ? options.invoke(() => row.load()) : row.load());
    requireFresh();
    if (!admitted(id) || !owner.isOpen()) throw new Error('post-import-authority-closed');
    return module;
  };
  let preparedSuccessfully = false;
  try {
    const a = api.bindFactory(providerA, async (deps) => {
      const mod = await load('test/provider/a');
      if (!isModule<{ create: typeof import('../fixtures/candidates/a.mjs').create }>(mod)) throw new Error('bad-export');
      assertFactoryOpen();
      return options.invoke ? options.invoke(() => mod.create(deps, providerPort)) : mod.create(deps, providerPort);
    });
    const b = api.bindFactory(providerB, async (deps) => {
      const mod = await load('test/provider/b');
      if (!isModule<{ create: typeof import('../fixtures/candidates/b.mjs').create }>(mod)) throw new Error('bad-export');
      assertFactoryOpen();
      return options.invoke ? options.invoke(() => mod.create(deps, providerPort)) : mod.create(deps, providerPort);
    });
    const w = api.bindFactory(writer, async deps => {
      const mod = await load('test/writer/main');
      if (!isModule<{ create: typeof import('../fixtures/candidates/writer.mjs').create }>(mod)) throw new Error('bad-export');
      assertFactoryOpen();
      return options.invoke ? options.invoke(() => mod.create(deps)) : mod.create(deps);
    });
    const r = api.bindFactory(reader, async deps => {
      const mod = await load('test/reader/main');
      if (!isModule<{ create: typeof import('../fixtures/candidates/reader.mjs').create }>(mod)) throw new Error('bad-export');
      assertFactoryOpen();
      return options.invoke ? options.invoke(() => mod.create(deps)) : mod.create(deps);
    });
    const app = api.bindFactory(root, async deps => {
      const mod = await load('test/root/main');
      if (!isModule<{ create: typeof import('../fixtures/candidates/root.mjs').create }>(mod)) throw new Error('bad-export');
      assertFactoryOpen();
      return options.invoke ? options.invoke(() => mod.create(deps, providerPort)) : mod.create(deps, providerPort);
    });
    const s = api.bindFactory(sentinel, async () => {
      const mod = await load('test/sentinel/main');
      if (!isModule<{ create: typeof import('../fixtures/candidates/sentinel.mjs').create }>(mod)) throw new Error('bad-export');
      assertFactoryOpen();
      return options.invoke ? options.invoke(() => mod.create()) : mod.create();
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
    preparedSuccessfully = true;
    return { ok: true, owner, snapshot: decision.snapshot, digest: composition.digest,
      order: composition.plan.dependencyOrder, run: (signal: AbortSignal) => prepared.prepared.run({ signal }) };
  } catch {
    return { phase: 'preparation', code: 'bind-or-prepare-threw' };
  } finally {
    if (!preparedSuccessfully && !options.owner) await owner.close();
  }
}

export async function runAdmission(input: unknown, rows: readonly LoaderRow[] = loaders,
  profileEdit?: (profile: CompositionProfile) => CompositionProfile,
  authorities: TrustedAuthorities = { inventory: candidates, grants }): Promise<RunResult> {
  const prepared = await prepareAdmission(input, rows, profileEdit, authorities);
  if (!('ok' in prepared)) return prepared;
  const { owner } = prepared;
  const composition = { digest: prepared.digest, plan: { dependencyOrder: prepared.order } };
  let constructionStarted = false;
  try {
    let construction;
    constructionStarted = true;
    try { construction = await owner.construct(signal => prepared.run(signal),
      outcome => outcome.status === 'succeeded' ? outcome.roots.app : undefined); }
    catch { return { phase: 'construction', status: 'threw', created: 0, effects: owner.effects, digest: composition.digest, order: composition.plan.dependencyOrder }; }
    const outcome = construction.raw;
    if (!outcome || construction.status !== 'published') return { phase: 'construction', status: construction.status === 'cancelled' ? 'cancelled' : outcome?.status ?? 'threw',
      code: outcome?.status === 'failed' ? outcome.code : undefined, created: outcome?.created.length ?? 0,
      effects: owner.effects, digest: composition.digest, order: composition.plan.dependencyOrder };
    const instance: Root = construction.root;
    const values = instance.run();
    const identities = instance.identities();
    const actions = ['test/writer/main', 'test/reader/main'].map(id => {
      const entry = outcome.created.find(item => item !== null && typeof item === 'object' &&
        'implementationId' in item && item.implementationId === id);
      const capabilities = entry !== null && typeof entry === 'object' && 'capabilities' in entry ? entry.capabilities : undefined;
      return capabilities !== null && typeof capabilities === 'object' && 'test/action' in capabilities
        ? capabilities['test/action'] : undefined;
    });
    const identitiesFromAssembly = actions.map(action =>
      action !== null && typeof action === 'object' && 'resourceIdentity' in action ? action.resourceIdentity : undefined);
    const sharedResource = owner.matchesResourceIdentities(identitiesFromAssembly[0], identitiesFromAssembly[1]);
    return { phase: 'construction', status: 'succeeded', created: outcome.created.length,
      values, identities, sharedResource, rootReportedSharedResource: instance.sharedResource(),
      effects: [...owner.effects], digest: composition.digest, order: composition.plan.dependencyOrder };
  } catch {
    if (constructionStarted) return { phase: 'construction', status: 'threw', created: 0, effects: [...owner.effects], digest: composition.digest, order: composition.plan.dependencyOrder };
    return { phase: 'preparation', code: 'bind-or-prepare-threw' };
  }
  finally { await owner.close(); }
}
