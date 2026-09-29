import { AsyncLocalStorage } from 'node:async_hooks';
import { admitTrusted, type Admitted } from '../admission/policy.ts';
import { prepareAdmission, type LoaderRow, type TrustedAuthorities } from '../admission/run.ts';
import type { Root } from '../fixtures/graph.ts';
import { TestRecoveryOwner, type RecoveryClose } from './recovery.ts';
import type { Clock, OwnedResource, TestHost } from './lifetime.ts';
import type { StopReadback, StopReadReceipt } from './exclusive-stop.ts';

const RECEIPT_LIMIT = 256;
type RunOutcome = { status: 'succeeded'; roots: { app: Root }; created: readonly unknown[] }
  | { status: 'failed' | 'cancelled'; code?: string; created: readonly unknown[] };
type Host = TestHost<Root, RunOutcome>;
export type ExactArtifact = Readonly<{ id: string; sha256: string }>;
export type ReplacementSubject = Readonly<{
  candidateId: string; input: unknown; artifact: ExactArtifact; rows: readonly LoaderRow[];
}>;
/** Trusted TEST control plane. Request JSON cannot supply these functions or artifact paths. */
export type ReplacementSource = Readonly<{
  subject(candidateId: string): ReplacementSubject | undefined;
  authorities(): TrustedAuthorities;
  stop(candidateId: string, resource: OwnedResource | undefined, attemptId: string): void | Promise<void>;
  readback(candidateId: string, attemptId: string): StopReadback | Promise<StopReadback>;
}>;
export type ReplacementStart = Readonly<
  { status: 'requested'; operationId: string } | { status: 'busy'; operationId: string } |
  { status: 'capacity-refused' }
>;
export type ReplacementRead = Readonly<
  { status: 'pending'; operationId: string; phase: string } |
  { status: 'activated' | 'kept-old' | 'rolled-back' | 'empty' | 'cleanup-incomplete';
    operationId: string; reason?: string } |
  { status: 'unknown-or-expired' } |
  { status: 'self-wait' } |
  { status: 'pending'; reason: 'aborted' | 'deadline'; operationId: string }
>;
export type InertBlueprint = Readonly<{
  key: string; graph: string; artifact: ExactArtifact; loaderIdentities: readonly string[];
}>;
type Captured = Readonly<{
  candidateId: string; artifact: ExactArtifact; artifactId: string; artifactSha256: string;
  snapshot: Admitted; graph: string; grantBytes: string;
  rows: readonly LoaderRow[]; blueprint: InertBlueprint;
}>;
type Route = { candidateId: string; operationId: string; host: Host; root: Root; captured: Captured };
type Waiter = { wake(): void };
type Operation = {
  id: string; candidateId: string; phase: string; prior?: Route; old?: Route;
  candidateHost?: Host; rollbackHost?: Host;
  flight: Promise<ReplacementRead>; resolve(value: ReplacementRead): void;
  waiters: Set<Waiter>; terminal?: ReplacementRead;
};
type Frame = { operation: Operation; active: boolean; parent?: Frame };
const systemClock: Clock = {
  now: () => performance.now(),
  schedule: (delay, wake) => setTimeout(wake, delay),
  cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
const pending = (operation: Operation): ReplacementRead => Object.freeze({
  status: 'pending', operationId: operation.id, phase: operation.phase,
});
const result = (operation: Operation, status: 'activated' | 'kept-old' | 'rolled-back' | 'empty' | 'cleanup-incomplete', reason?: string): ReplacementRead =>
  Object.freeze({ status, operationId: operation.id, ...(reason ? { reason } : {}) });

/** One route and one exclusive resource in the fixed synthetic TEST Host. */
export class ReplacementSlot {
  private readonly recovery: TestRecoveryOwner;
  private readonly source: ReplacementSource;
  private readonly timer: Clock;
  private readonly context = new AsyncLocalStorage<Frame>();
  private readonly cache = new Map<string, InertBlueprint>();
  private readonly loaderIds = new WeakMap<LoaderRow['load'], number>();
  private nextLoaderId = 1;
  private nextOperationId = 1;
  private readonly receipts = new Map<string, ReplacementRead>();
  private route: Route | undefined;
  private active: Operation | undefined;
  private shutdownFlight: Promise<RecoveryClose | Readonly<{ status: 'empty' }>> | undefined;

  constructor(source: ReplacementSource, recovery = new TestRecoveryOwner(), timer: Clock = systemClock) {
    this.source = source;
    this.recovery = recovery;
    this.timer = timer;
  }

  /** A retained old reference is available only to a trusted TEST observer. */
  currentRoot(): Root | undefined { return this.route?.root; }
  currentCandidateId(): string | undefined { return this.route?.candidateId; }
  currentCache(): InertBlueprint | undefined { return this.route && this.cache.get(this.route.captured.blueprint.key); }
  recoveryOwner(): TestRecoveryOwner { return this.recovery; }

  /** Shutdown is a slot operation: no successor may start before physical release. */
  closeCurrent(): Promise<RecoveryClose | Readonly<{ status: 'empty' }>> {
    if (this.shutdownFlight) return this.shutdownFlight;
    if (this.active) return Promise.reject(Error('replacement-busy'));
    const route = this.route;
    if (!route) return Promise.resolve(Object.freeze({ status: 'empty' }));
    const id = `replacement-${this.nextOperationId++}`;
    let resolveOperation!: (value: ReplacementRead) => void;
    const operationFlight = new Promise<ReplacementRead>(yes => { resolveOperation = yes; });
    const operation: Operation = { id, candidateId: route.candidateId, phase: 'shutdown',
      prior: route, old: route, flight: operationFlight, resolve: resolveOperation, waiters: new Set() };
    let resolveShutdown!: (value: RecoveryClose | Readonly<{ status: 'empty' }>) => void;
    let rejectShutdown!: (reason: unknown) => void;
    const shutdown = new Promise<RecoveryClose | Readonly<{ status: 'empty' }>>((yes, no) => {
      resolveShutdown = yes; rejectShutdown = no;
    });
    // Publish both flights, operation and route removal before stop/abort callbacks.
    this.active = operation;
    this.shutdownFlight = shutdown;
    this.route = undefined;
    const finish = (terminal: RecoveryClose): void => {
      if (terminal.status === 'closed') this.evict(route.captured.blueprint.key, route.captured.blueprint);
      this.complete(operation, result(operation, terminal.status === 'closed' ? 'empty' : 'cleanup-incomplete', 'shutdown'));
      this.shutdownFlight = undefined;
      resolveShutdown(terminal);
    };
    try {
      const close = this.recovery.close(route.operationId);
      void close.then(finish, cause => {
        this.complete(operation, result(operation, 'cleanup-incomplete', 'shutdown-threw'));
        this.shutdownFlight = undefined;
        rejectShutdown(cause);
      });
    } catch (cause) {
      this.complete(operation, result(operation, 'cleanup-incomplete', 'shutdown-threw'));
      this.shutdownFlight = undefined;
      rejectShutdown(cause);
    }
    return shutdown;
  }

  requestReplacement(candidateId: string): ReplacementStart {
    if (this.active) return Object.freeze({ status: 'busy', operationId: this.active.id });
    let permit = (): boolean => false;
    let reservation: { operationId: string; host: Host };
    try {
      reservation = this.recovery.reserve<Root, RunOutcome>(undefined, { canActivate: () => permit() });
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'recovery-capacity-refused')
        return Object.freeze({ status: 'capacity-refused' });
      throw cause;
    }
    const id = `replacement-${this.nextOperationId++}`;
    let resolve!: (value: ReplacementRead) => void;
    const flight = new Promise<ReplacementRead>(yes => { resolve = yes; });
    const operation: Operation = { id, candidateId, phase: 'preflight', flight, resolve,
      waiters: new Set(), prior: this.route, candidateHost: reservation.host };
    this.active = operation;
    // Publish operation and raw flight before any trusted callback can reenter.
    queueMicrotask(() => {
      void this.drive(operation, reservation, check => { permit = check; })
        .then(value => this.complete(operation, value), async () => {
          const closed = await this.closeUnused(reservation.operationId);
          this.complete(operation, result(operation, closed ? (this.route ? 'kept-old' : 'empty')
            : 'cleanup-incomplete', 'operation-threw'));
        });
    });
    return Object.freeze({ status: 'requested', operationId: id });
  }

  readReplacement(operationId: string): ReplacementRead {
    if (this.active?.id === operationId) return this.active.terminal ?? pending(this.active);
    return this.receipts.get(operationId) ?? Object.freeze({ status: 'unknown-or-expired' });
  }

  observeReplacement(operationId: string, options: { signal?: AbortSignal; deadlineAt?: number } = {}): Promise<ReplacementRead> {
    const current = this.readReplacement(operationId);
    if (current.status !== 'pending') return Promise.resolve(current);
    const operation = this.active;
    if (!operation || operation.id !== operationId) return Promise.resolve(this.readReplacement(operationId));
    for (let frame = this.context.getStore(); frame; frame = frame.parent)
      if (frame.operation === operation && frame.active)
        return Promise.resolve(Object.freeze({ status: 'self-wait' }));
    const deadline = options.deadlineAt;
    if (deadline !== undefined && !Number.isFinite(deadline)) return Promise.reject(Error('invalid-deadline'));
    if (options.signal?.aborted) return Promise.resolve(Object.freeze({ status: 'pending', operationId, reason: 'aborted' }));
    if (deadline !== undefined && deadline <= this.timer.now())
      return Promise.resolve(Object.freeze({ status: 'pending', operationId, reason: 'deadline' }));
    return new Promise(resolve => {
      let timer: unknown;
      let settled = false;
      const detach = () => {
        operation.waiters.delete(waiter);
        options.signal?.removeEventListener('abort', abort);
        if (timer !== undefined) this.timer.cancel(timer);
      };
      const finish = (value: ReplacementRead) => {
        if (settled) return;
        settled = true;
        detach();
        resolve(value);
      };
      const wake = (reason?: 'aborted' | 'deadline') => {
        if (operation.terminal) finish(operation.terminal);
        else if (reason) finish(Object.freeze({ status: 'pending', operationId, reason }));
      };
      const waiter: Waiter = { wake: () => wake() };
      const abort = () => wake('aborted');
      operation.waiters.add(waiter);
      options.signal?.addEventListener('abort', abort, { once: true });
      if (deadline !== undefined) timer = this.timer.schedule(Math.max(0, deadline - this.timer.now()), () => wake('deadline'));
      if (operation.terminal) finish(operation.terminal);
      else if (options.signal?.aborted) wake('aborted');
      else if (deadline !== undefined && deadline <= this.timer.now()) wake('deadline');
    });
  }

  private stopHost(operationId: string, role: 'old' | 'candidate' | 'rollback'): Host | undefined {
    const operation = this.active?.id === operationId ? this.active : undefined;
    return role === 'old' ? operation?.old?.host : role === 'candidate' ? operation?.candidateHost : operation?.rollbackHost;
  }
  private invokeCallback<T>(operation: Operation, callback: () => T | Promise<T>): Promise<T> {
    const frame: Frame = { operation, active: true, parent: this.context.getStore() };
    let value: T | Promise<T>;
    try { value = this.context.run(frame, callback); }
    catch (cause) { frame.active = false; return Promise.reject(cause); }
    return Promise.resolve(value).finally(() => { frame.active = false; });
  }

  private invokeSync<T>(callback: () => T): T {
    const operation = this.active;
    if (!operation) return callback();
    const frame: Frame = { operation, active: true, parent: this.context.getStore() };
    try { return this.context.run(frame, callback); }
    finally { frame.active = false; }
  }

  private invokeStopControl(operationId: string, role: 'old' | 'candidate' | 'rollback',
    attemptId: string, action: 'reconcile' | 'retry'): Promise<StopReadReceipt> {
    const operation = this.active?.id === operationId ? this.active : undefined;
    const host = this.stopHost(operationId, role);
    if (!operation || !host) return Promise.resolve(Object.freeze({ status: 'stale-attempt' }));
    return this.invokeCallback(operation, () => action === 'reconcile'
      ? host.reconcileExclusiveStop(attemptId) : host.retryExclusiveStop(attemptId));
  }
  reconcileStop(operationId: string, role: 'old' | 'candidate' | 'rollback', attemptId: string): Promise<StopReadReceipt> {
    return this.invokeStopControl(operationId, role, attemptId, 'reconcile');
  }
  retryStop(operationId: string, role: 'old' | 'candidate' | 'rollback', attemptId: string): Promise<StopReadReceipt> {
    return this.invokeStopControl(operationId, role, attemptId, 'retry');
  }
  stopAttempt(operationId: string, role: 'old' | 'candidate' | 'rollback'): string | undefined {
    return this.stopHost(operationId, role)?.exclusiveStopAttempt();
  }

  private complete(operation: Operation, receipt: ReplacementRead): void {
    if (this.active !== operation) return;
    operation.terminal = receipt;
    operation.resolve(receipt);
    for (const waiter of [...operation.waiters]) waiter.wake();
    this.active = undefined;
    this.receipts.set(operation.id, receipt);
    if (this.receipts.size > RECEIPT_LIMIT) this.receipts.delete(this.receipts.keys().next().value!);
    operation.old = undefined;
    operation.prior = undefined;
    operation.rollbackHost = undefined;
  }

  private loaderIdentity(load: LoaderRow['load']): number {
    let id = this.loaderIds.get(load);
    if (!id) { id = this.nextLoaderId++; this.loaderIds.set(load, id); }
    return id;
  }

  private capture(candidateId: string): Captured | undefined {
    const subject = this.invokeSync(() => this.source.subject(candidateId));
    if (!subject || subject.candidateId !== candidateId || !Object.isFrozen(subject.artifact) ||
        typeof subject.artifact.id !== 'string' || typeof subject.artifact.sha256 !== 'string') return;
    const authorities = this.invokeSync(() => this.source.authorities());
    const decision = admitTrusted(subject.input, authorities.inventory, authorities.grants);
    if (!decision.ok) return;
    const ids = decision.snapshot.selections.map(item => item.implementationId);
    const rows: LoaderRow[] = [];
    for (const id of ids) {
      const matches = subject.rows.filter(row => row.implementationId === id);
      if (matches.length !== 1 || typeof matches[0]!.load !== 'function') return;
      rows.push(Object.freeze({ implementationId: matches[0]!.implementationId, load: matches[0]!.load }));
    }
    const graph = JSON.stringify(decision.snapshot.selections);
    const grantBytes = JSON.stringify(authorities.grants);
    const loaderIdentities = Object.freeze(rows.map(row => `${row.implementationId}:${this.loaderIdentity(row.load)}`));
    const key = JSON.stringify([graph, subject.artifact.id, subject.artifact.sha256, loaderIdentities]);
    const artifact = subject.artifact;
    const blueprint: InertBlueprint = Object.freeze({ key, graph, artifact, loaderIdentities });
    return Object.freeze({ candidateId, artifact, artifactId: artifact.id, artifactSha256: artifact.sha256,
      snapshot: decision.snapshot, graph, grantBytes, rows: Object.freeze(rows), blueprint });
  }

  private fresh(captured: Captured): boolean {
    try {
      const subject = this.invokeSync(() => this.source.subject(captured.candidateId));
      if (!subject || subject.artifact !== captured.artifact ||
          subject.artifact.id !== captured.artifactId ||
          subject.artifact.sha256 !== captured.artifactSha256) return false;
      const authorities = this.invokeSync(() => this.source.authorities());
      // Submit only the frozen selected graph; caller request objects have no authority.
      const admitted = admitTrusted({ selections: captured.snapshot.selections }, authorities.inventory, authorities.grants);
      const currentGraph = admitTrusted(subject.input, authorities.inventory, authorities.grants);
      if (!admitted.ok || !currentGraph.ok ||
          JSON.stringify(currentGraph.snapshot.selections) !== captured.graph ||
          JSON.stringify(admitted.snapshot.selections) !== captured.graph ||
          JSON.stringify(authorities.grants) !== captured.grantBytes) return false;
      return captured.rows.every(row => {
        const matches = subject.rows.filter(item => item.implementationId === row.implementationId);
        return matches.length === 1 && matches[0]!.load === row.load;
      });
    } catch { return false; }
  }

  private reservePhysical(owner: Host, candidateId: string, fresh: () => boolean): (resource: OwnedResource) => void {
    if (!fresh()) throw Error('live-authority-revoked');
    let resource: OwnedResource | undefined;
    const canDeliver = owner.createExclusiveStop({
      stop: attemptId => {
        const operation = this.active;
        return operation ? this.invokeCallback(operation, () => this.source.stop(candidateId, resource, attemptId))
          : this.source.stop(candidateId, resource, attemptId);
      },
      readback: attemptId => {
        const operation = this.active;
        return operation ? this.invokeCallback(operation, () => this.source.readback(candidateId, attemptId))
          : this.source.readback(candidateId, attemptId);
      },
    });
    let registered = false;
    return delivered => {
      if (registered || !canDeliver()) throw Error('registration-refused');
      registered = true;
      resource = delivered;
    };
  }

  private async prepare(captured: Captured, host: Host) {
    const fresh = () => this.fresh(captured);
    const authority = this.invokeSync(() => this.source.authorities());
    return prepareAdmission({ selections: captured.snapshot.selections }, captured.rows, undefined, authority,
      { owner: host, fresh, reserve: owner => this.reservePhysical(owner, captured.candidateId, fresh),
        invoke: callback => this.active ? this.invokeCallback(this.active, callback) : Promise.resolve().then(callback) });
  }

  private async closeUnused(operationId: string): Promise<boolean> {
    const terminal = await this.recovery.close(operationId);
    return terminal.status === 'closed';
  }

  private async drive(operation: Operation, reservation: { operationId: string; host: Host },
    setAuthority: (check: () => boolean) => void): Promise<ReplacementRead> {
    const prior = operation.prior;
    let captured: Captured | undefined;
    try { captured = this.capture(operation.candidateId); } catch { /* inert refusal */ }
    if (!captured) {
      const closed = await this.closeUnused(reservation.operationId);
      return result(operation, closed ? (prior ? 'kept-old' : 'empty') : 'cleanup-incomplete', 'preflight-refused');
    }
    setAuthority(() => this.fresh(captured!));
    let prepared: Awaited<ReturnType<ReplacementSlot['prepare']>>;
    try { prepared = await this.prepare(captured, reservation.host); }
    catch {
      const closed = await this.closeUnused(reservation.operationId);
      return result(operation, closed ? (prior ? 'kept-old' : 'empty') : 'cleanup-incomplete', 'preflight-threw');
    }
    if (!('ok' in prepared) || !this.fresh(captured)) {
      const closed = await this.closeUnused(reservation.operationId);
      return result(operation, closed ? (prior ? 'kept-old' : 'empty') : 'cleanup-incomplete',
        'ok' in prepared ? 'preflight-changed' : `preflight-${prepared.phase}`);
    }
    if (prior) {
      operation.phase = 'old-stop';
      operation.old = prior;
      // Remove the route before close callbacks can synchronously reenter.
      this.route = undefined;
      const oldClose = this.recovery.close(prior.operationId);
      const terminal = await oldClose;
      if (terminal.status !== 'closed') {
        const candidateClosed = await this.closeUnused(reservation.operationId);
        return result(operation, candidateClosed ? 'empty' : 'cleanup-incomplete', 'old-cleanup-incomplete');
      }
      this.evict(prior.captured.blueprint.key, prior.captured.blueprint);
    }
    if (!this.fresh(captured)) return this.failedAfterStop(operation, reservation, 'post-stop-authority-changed');
    operation.phase = 'candidate-stage';
    let staged: Awaited<ReturnType<Host['constructStaged']>>;
    try { staged = await reservation.host.constructStaged(signal => prepared.run(signal),
      outcome => outcome.status === 'succeeded' ? outcome.roots.app : undefined); }
    catch { return this.failedAfterStop(operation, reservation, 'candidate-stage-threw'); }
    if (staged.status !== 'constructed') return this.failedAfterStop(operation, reservation, `candidate-${staged.status}`);
    if (!this.fresh(captured)) return this.failedAfterStop(operation, reservation, 'pre-activation-authority-changed');
    // No await or candidate callback between activation and route/cache pointer commit.
    const activated = reservation.host.activateConstructed(staged.token);
    if (activated.status !== 'published') return this.failedAfterStop(operation, reservation, 'activation-refused');
    const route: Route = { candidateId: operation.candidateId, operationId: reservation.operationId,
      host: reservation.host, root: activated.root, captured };
    this.route = route;
    this.cache.set(captured.blueprint.key, captured.blueprint);
    return result(operation, 'activated');
  }

  private async failedAfterStop(operation: Operation, reservation: { operationId: string; host: Host },
    reason: string): Promise<ReplacementRead> {
    operation.phase = 'candidate-cleanup';
    if (!await this.closeUnused(reservation.operationId))
      return result(operation, 'cleanup-incomplete', reason);
    const prior = operation.prior;
    if (!prior) return result(operation, 'empty', reason);
    operation.phase = 'rollback';
    let current: Captured | undefined;
    try { current = this.capture(prior.candidateId); } catch { /* fail closed */ }
    if (!current || current.blueprint.key !== prior.captured.blueprint.key ||
        current.artifact !== prior.captured.artifact || !this.fresh(current))
      return result(operation, 'empty', `${reason}:rollback-preflight-refused`);
    let permit = () => this.fresh(current);
    let rollback: { operationId: string; host: Host };
    try { rollback = this.recovery.reserve<Root, RunOutcome>(undefined, { canActivate: () => permit() }); }
    catch { return result(operation, 'empty', `${reason}:rollback-capacity-refused`); }
    operation.rollbackHost = rollback.host;
    let prepared: Awaited<ReturnType<ReplacementSlot['prepare']>>;
    try { prepared = await this.prepare(current, rollback.host); }
    catch {
      const closed = await this.closeUnused(rollback.operationId);
      return result(operation, closed ? 'empty' : 'cleanup-incomplete', `${reason}:rollback-preflight-threw`);
    }
    if (!('ok' in prepared) || !this.fresh(current)) {
      const closed = await this.closeUnused(rollback.operationId);
      return result(operation, closed ? 'empty' : 'cleanup-incomplete', `${reason}:rollback-preflight-refused`);
    }
    let staged: Awaited<ReturnType<Host['constructStaged']>>;
    try { staged = await rollback.host.constructStaged(signal => prepared.run(signal),
      outcome => outcome.status === 'succeeded' ? outcome.roots.app : undefined); }
    catch {
      const closed = await this.closeUnused(rollback.operationId);
      return result(operation, closed ? 'empty' : 'cleanup-incomplete', `${reason}:rollback-stage-threw`);
    }
    if (staged.status !== 'constructed' || !this.fresh(current)) {
      const closed = await this.closeUnused(rollback.operationId);
      return result(operation, closed ? 'empty' : 'cleanup-incomplete', `${reason}:rollback-stage-refused`);
    }
    const activated = rollback.host.activateConstructed(staged.token);
    if (activated.status !== 'published') {
      const closed = await this.closeUnused(rollback.operationId);
      return result(operation, closed ? 'empty' : 'cleanup-incomplete', `${reason}:rollback-activation-refused`);
    }
    this.route = { candidateId: prior.candidateId, operationId: rollback.operationId,
      host: rollback.host, root: activated.root, captured: current };
    this.cache.set(current.blueprint.key, current.blueprint);
    return result(operation, 'rolled-back', reason);
  }

  private evict(key: string, expected: InertBlueprint): void {
    if (this.cache.get(key) === expected) this.cache.delete(key);
  }
}
