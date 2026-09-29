import { appendFileSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { types } from 'node:util';
import { createLifecycleKernel, type CallLease, type CustodyLease, type Generation, type GenerationSnapshot } from '@get-modular/lifecycle-kernel';
import { ExclusiveStopRecord, type StopPorts, type StopReadReceipt } from './exclusive-stop.ts';
const mark = (event: string): void => {
  if (process.env.TEST_MARKERS) appendFileSync(process.env.TEST_MARKERS, `${event}\n`);
};

export type OwnedResource = { readonly resourceIdentity?: symbol; dispose(): void | Promise<void> };
export type StreamResource = { close(): void | Promise<void> };
export type CleanupFailure = Readonly<{ debt: OwnedResource | StreamResource; cause: unknown }>;
export type CloseTerminal = Readonly<{ status: 'closed' } | { status: 'cleanup-incomplete'; cause: unknown;
  debt: OwnedResource | StreamResource; failures: readonly CleanupFailure[] }>;
export type CloseReceipt = Readonly<{ status: 'closed' | 'cleanup-incomplete' } | { status: 'pending'; reason: 'aborted' | 'deadline' } | { status: 'self-wait' }>;
export type RetirementReceipt = Readonly<{ kind: 'requested'; operationId: string }>;
export type RetirementReadReceipt = Readonly<{ status: 'pending' | 'closed' | 'cleanup-incomplete' | 'unknown-or-expired' }>;
export type Clock = Readonly<{ now(): number; schedule(delay: number, wake: () => void): unknown; cancel(handle: unknown): void }>;
const clock: Clock = {
  now: () => performance.now(),
  schedule: (delay, wake) => setTimeout(wake, delay),
  cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
const MAX_TIMER_DELAY = 2 ** 31 - 1;
// Default AbortError captures the caller stack and can retain a closed sibling.
const RETIRE_REASON = 'host-retired';
const observeNativePromise = Promise.prototype.then;
type Ticket = { settled: boolean; promise: Promise<unknown> };
type Waiter = { wake(): void; remove(): void };
type StreamRecord = { resource: StreamResource; custody: CustodyLease; runs: Set<Ticket>; close?: Promise<void>; settled: boolean };
type StreamNext<T> = () => IteratorResult<T> | Promise<IteratorResult<T>>;
export type TerminalResultValue = string | number | boolean | bigint | symbol | null | undefined;
type StreamResult<U extends TerminalResultValue> = () => U | Promise<U>;
type StreamReturn<T> = () => IteratorResult<T> | Promise<IteratorResult<T>>;
export type TerminalStreamResource<T, U extends TerminalResultValue> = {
  next: StreamNext<T>;
  result?: StreamResult<U>;
  return?: StreamReturn<T>;
  close(): void | Promise<void>;
};
export type TerminalStreamView<T, U extends TerminalResultValue> = Readonly<{
  next(): Promise<IteratorResult<T>>;
  result(): Promise<U>;
  return(): Promise<IteratorResult<T>>;
  cancel(): Promise<void>;
  [Symbol.asyncIterator](): AsyncIterator<T>;
}>;
type TerminalStreamRecord = Omit<StreamRecord, 'runs'> & {
  callbacks: { next: () => unknown; result?: () => unknown; return?: () => unknown; close: () => unknown };
  started: boolean;
  iterationEnded: boolean;
  closing: boolean;
  tickets: Set<Ticket>;
};
type RetirementOperation = object;
type CallContext = { kind: 'call'; generation: Generation; lease: CallLease; active: boolean;
  stream?: TerminalStreamRecord; ordinaryStream?: StreamRecord; parent?: Context };
type CleanupContext = { kind: 'cleanup'; operation: RetirementOperation; active: boolean; parent?: Context };
type Context = CallContext | CleanupContext;
// A single context links nested calls across distinct TEST generation owners.
const callContext = new AsyncLocalStorage<Context>();
function activeCallIn(context: Context | undefined, generations: ReadonlySet<Generation>): boolean {
  for (let frame = context; frame; frame = frame.parent)
    if (frame.kind === 'call' && frame.active && generations.has(frame.generation)) return true;
  return false;
}
function activeCleanupIn(context: Context | undefined, operation: RetirementOperation): boolean {
  for (let frame = context; frame; frame = frame.parent)
    if (frame.kind === 'cleanup' && frame.active && frame.operation === operation) return true;
  return false;
}
function hasActiveCleanup(context: Context | undefined): boolean {
  for (let frame = context; frame; frame = frame.parent)
    if (frame.kind === 'cleanup' && frame.active) return true;
  return false;
}
type ConsumerTickets = { ordinary: readonly StreamRecord[]; terminal: readonly TerminalStreamRecord[] };
function consumerTickets(context: Context | undefined,
    ordinary?: StreamRecord, terminal?: TerminalStreamRecord): ConsumerTickets {
  const ordinaryOwners = new Set<StreamRecord>(ordinary ? [ordinary] : []);
  const terminalOwners = new Set<TerminalStreamRecord>(terminal ? [terminal] : []);
  for (let frame = context; frame; frame = frame.parent) {
    if (frame.kind !== 'call' || !frame.active) continue;
    if (frame.ordinaryStream) ordinaryOwners.add(frame.ordinaryStream);
    if (frame.stream) terminalOwners.add(frame.stream);
  }
  return { ordinary: [...ordinaryOwners], terminal: [...terminalOwners] };
}
function retainConsumerTicket(owners: ConsumerTickets, ticket: Ticket): void {
  for (const stream of owners.ordinary) stream.runs.add(ticket);
  for (const stream of owners.terminal) stream.tickets.add(ticket);
}
function releaseConsumerTicket(owners: ConsumerTickets, ticket: Ticket): void {
  for (const stream of owners.ordinary) stream.runs.delete(ticket);
  for (const stream of owners.terminal) stream.tickets.delete(ticket);
}
function hasClosingStream(context: Context | undefined): boolean {
  for (let frame = context; frame; frame = frame.parent)
    if (frame.kind === 'call' && frame.active && frame.stream?.closing) return true;
  return false;
}
function ownMethod(resource: object, name: 'next' | 'result' | 'return' | 'close', required: boolean): (() => unknown) | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(resource, name);
  if (!descriptor && !required) return undefined;
  if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'function')
    throw new Error(`unsupported-stream-${name}`);
  return descriptor.value.bind(resource);
}
function iteratorResult<T>(value: unknown, requireDone = false): IteratorResult<T> {
  if (value === null || typeof value !== 'object' || types.isPromise(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null))
    throw new Error('unsupported-iterator-result');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some(descriptor => !('value' in descriptor)) ||
      'then' in descriptors ||
      !('done' in descriptors) || typeof descriptors.done?.value !== 'boolean' ||
      (requireDone && descriptors.done.value !== true))
    throw new Error('unsupported-iterator-result');
  return value as IteratorResult<T>;
}
export type Construction<R, O> = Readonly<
  | { status: 'published'; root: R; raw: O }
  | { status: 'cancelled'; raw: O }
  | { status: 'failed'; raw?: O; cause?: unknown }
>;
declare const stagedTokenBrand: unique symbol;
export type StagedToken = Readonly<{ readonly [stagedTokenBrand]: true }>;
export type StagedConstruction = Readonly<
  | { status: 'constructed'; token: StagedToken }
  | { status: 'cancelled' }
  | { status: 'failed'; code: 'construction-failed' | 'missing-root' }
>;
export type Activation<R> = Readonly<
  | { status: 'published'; root: R }
  | { status: 'activation-refused'; code: 'invalid-token' | 'revoked' }
>;
export type LiveActivationAuthority = Readonly<{ canActivate(): boolean }>;
type CohortBinding = Readonly<{
  operationId: string;
  request(): RetirementReceipt;
  read(operationId: string): RetirementReadReceipt;
  observe(operationId: string, options: { signal?: AbortSignal; deadlineAt?: number }): Promise<CloseReceipt | Readonly<{ status: 'unknown-or-expired' }>>;
}>;

/** The only lifetime owner in this stand. It never interprets Assembly's journals as disposers. */
export class TestHost<R, O extends { readonly status: string }> {
  readonly effects: string[] = [];
  private readonly kernel = createLifecycleKernel();
  // This attempt owner is created before Assembly may load any executable module.
  private readonly generation: Generation = this.kernel.stage();
  private controller: AbortController | undefined = new AbortController();
  private construction: Ticket | undefined;
  private constructionResult: Promise<Construction<R, O>> | undefined;
  private stagedResult: Promise<StagedConstruction> | undefined;
  private stagedToken: StagedToken | undefined;
  private stagedRoot: R | undefined;
  private constructionCode: 'not-started' | 'constructed' | 'published' | 'cancelled' | 'failed' = 'not-started';
  private readonly operations = new Set<Ticket>();
  private readonly streams = new Set<StreamRecord>();
  private readonly terminalStreams = new Set<TerminalStreamRecord>();
  private readonly context = callContext;
  private readonly cleanupScopes = new Set<CleanupContext>();
  private resource: OwnedResource | undefined;
  private exclusiveStop: ExclusiveStopRecord | undefined;
  private custody: CustodyLease | undefined;
  private reserved = false;
  private retirement: Promise<CloseTerminal> | undefined;
  private readonly retirementId = 'retirement-1';
  private readonly ownRetirementOperation: RetirementOperation = {};
  private retirementOperation: RetirementOperation = this.ownRetirementOperation;
  private retirementPrepared = false;
  private retirementAborted = false;
  private retirementCleanupStarted = false;
  private resolveRetirement: ((result: CloseTerminal) => void) | undefined;
  private terminal: CloseTerminal | undefined;
  private readonly waiters = new Set<Waiter>();
  private readonly timer: Clock;
  private activationAuthority: LiveActivationAuthority | undefined;
  private cohortOwner: CohortBinding | undefined;
  private readonly physicalCompletion = new Set<() => void>();

  constructor(timer: Clock = clock, activationAuthority?: LiveActivationAuthority) {
    this.timer = timer;
    this.activationAuthority = activationAuthority;
  }

  /** Opaque generation identity for the fixed TEST cohort owner. */
  cohortGeneration(): Generation { return this.generation; }
  canAttachCohort(): boolean { return !this.cohortOwner && !this.retirementPrepared; }
  attachCohort(binding: CohortBinding): void {
    if (!this.canAttachCohort()) throw new Error('cohort-member-unavailable');
    this.cohortOwner = binding;
  }

  /** Host-owned completion signal; observer timeouts and cleanup debt never fire it. */
  onPhysicalCompletion(notify: () => void): void {
    if (this.terminal?.status === 'closed') { notify(); return; }
    this.physicalCompletion.add(notify);
  }
  safeConstructionCode(): 'not-started' | 'constructed' | 'published' | 'cancelled' | 'failed' {
    return this.constructionCode;
  }
  currentRetirementId(): string { return this.cohortOwner?.operationId ?? this.retirementId; }

  /** Called only by a retaining owner after a closed terminal has been recorded. */
  compactClosed(): void {
    if (this.terminal?.status !== 'closed') throw new Error('physical-completion-unproven');
    this.resource = undefined;
    this.exclusiveStop = undefined;
    this.stagedToken = undefined;
    this.stagedRoot = undefined;
    this.stagedResult = undefined;
    this.activationAuthority = undefined;
    this.controller = undefined;
    this.construction = undefined;
    this.constructionResult = undefined;
    this.custody = undefined;
    this.resolveRetirement = undefined;
    this.retirement = Promise.resolve(Object.freeze({ status: 'closed' }));
    this.operations.clear();
    this.streams.clear();
    this.terminalStreams.clear();
    this.cleanupScopes.clear();
    this.physicalCompletion.clear();
  }

  private lifecycle(): GenerationSnapshot {
    const result = this.kernel.snapshot(this.generation);
    if (!result.ok) throw new Error(`kernel-snapshot:${result.reason}`);
    return result.value;
  }
  isOpen(): boolean { return this.lifecycle().phase === 'staged' || this.lifecycle().phase === 'active'; }
  matchesResourceIdentities(first: unknown, second: unknown): boolean {
    return typeof this.resource?.resourceIdentity === 'symbol' &&
      first === this.resource.resourceIdentity && second === this.resource.resourceIdentity;
  }
  status() {
    const lifecycle = this.lifecycle();
    const state = this.terminal?.status ?? (lifecycle.phase === 'retiring' || lifecycle.phase === 'retired' ? 'draining' : 'open');
    return Object.freeze({ state, ready: lifecycle.phase === 'active', lifecycle, hasResource: !!this.resource,
      debt: this.terminal?.status === 'cleanup-incomplete' ? this.terminal.debt : undefined,
      cause: this.terminal?.status === 'cleanup-incomplete' ? this.terminal.cause : undefined,
      failures: this.terminal?.status === 'cleanup-incomplete' ? this.terminal.failures : undefined,
      streams: this.streams.size + this.terminalStreams.size, observers: this.waiters.size });
  }

  /** Reservation happens before allocation; the returned registration remains valid after seal. */
  reserve(): (resource: OwnedResource) => void {
    if (!this.isOpen() || !this.construction || this.construction.settled || !this.custody || this.reserved)
      throw new Error('reservation-refused');
    this.reserved = true;
    const ticket = this.construction;
    const generation = this.generation;
    let delivered = false;
    return resource => {
      if (generation !== this.generation || ticket !== this.construction || ticket.settled || delivered || this.resource)
        throw new Error('registration-refused');
      delivered = true;
      this.resource = resource;
      mark('owner:acquire');
    };
  }

  /** Trusted Host control plane. No stop proof is accepted from a caller. */
  createExclusiveStop(ports: StopPorts): () => boolean {
    if (!this.construction || this.construction.settled || this.exclusiveStop)
      throw new Error('exclusive-stop-refused');
    const ticket = this.construction;
    const register = this.reserve();
    const record = new ExclusiveStopRecord(ports, callback => this.invokeStopPort(callback),
      () => activeCleanupIn(this.context.getStore(), this.retirementOperation));
    this.exclusiveStop = record;
    try { register(record); }
    catch (cause) {
      // A TEST marker may fail after physical ownership has transferred.
      if (this.resource !== record) this.exclusiveStop = undefined;
      throw cause;
    }
    // Delivery after settlement is detached from the construction ticket.
    return () => this.construction === ticket && !ticket.settled && this.resource === record;
  }
  exclusiveStopAttempt(): string | undefined { return this.exclusiveStop?.attemptId(); }
  reconcileExclusiveStop(attemptId: string): Promise<StopReadReceipt> {
    return this.exclusiveStop?.reconcile(attemptId) ?? Promise.resolve(Object.freeze({ status: 'stale-attempt' }));
  }
  retryExclusiveStop(attemptId: string): Promise<StopReadReceipt> {
    return this.exclusiveStop?.retry(attemptId) ?? Promise.resolve(Object.freeze({ status: 'stale-attempt' }));
  }

  private invokeStopPort<T>(callback: () => T | Promise<T>): Promise<T> {
    const scope: CleanupContext = { kind: 'cleanup', operation: this.retirementOperation,
      active: true, parent: this.context.getStore() };
    this.cleanupScopes.add(scope);
    let result: T | Promise<T>;
    try { result = this.context.run(scope, callback); }
    catch (cause) { scope.active = false; this.cleanupScopes.delete(scope); return Promise.reject(cause); }
    return Promise.resolve(result).finally(() => { scope.active = false; this.cleanupScopes.delete(scope); });
  }

  private assertReady(generation: Generation): void {
    if (generation !== this.generation || this.lifecycle().phase !== 'active') throw new Error('host-revoked');
  }
  private withCall<T>(generation: Generation, action: (lease: CallLease) => T): T {
    const current = this.context.getStore();
    if (hasActiveCleanup(current) || hasClosingStream(current)) throw new Error('host-revoked');
    this.assertReady(generation);
    const admitted = this.kernel.beginCall(generation);
    if (!admitted.ok) throw new Error('host-revoked');
    try {
      if (!this.kernel.checkCall(admitted.value).ok) throw new Error('host-revoked');
      return action(admitted.value);
    } finally { this.kernel.release(admitted.value); }
  }
  assertOperationReady(): void { this.withCall(this.generation, () => undefined); }
  /** The check and sink write are one synchronous block. */
  effect(value: string): void {
    const current = this.context.getStore();
    if (hasActiveCleanup(current) || hasClosingStream(current)) throw new Error('host-revoked');
    if (current?.kind === 'call' && current.generation === this.generation) {
      if (!this.kernel.checkCall(current.lease).ok) throw new Error('host-revoked');
      this.effects.push(value);
      mark(`owner:effect:${value}`);
      return;
    }
    this.withCall(this.generation, lease => {
      if (!this.kernel.checkCall(lease).ok) throw new Error('host-revoked');
      this.effects.push(value);
      mark(`owner:effect:${value}`);
    });
  }
  read<T>(read: () => T): T {
    const parent = this.context.getStore();
    if (hasActiveCleanup(parent) || hasClosingStream(parent)) throw new Error('host-revoked');
    const consumers = consumerTickets(parent);
    this.assertReady(this.generation);
    const admitted = this.kernel.beginCall(this.generation);
    if (!admitted.ok) throw new Error('host-revoked');
    let resolveTicket!: (value: unknown) => void;
    const ticket: Ticket = { settled: false, promise: new Promise(resolve => { resolveTicket = resolve; }) };
    const frame: CallContext = { kind: 'call', generation: this.generation, lease: admitted.value,
      active: true, stream: parent?.kind === 'call' && parent.active ? parent.stream : undefined, parent };
    this.operations.add(ticket);
    retainConsumerTicket(consumers, ticket);
    const settle = () => {
      if (ticket.settled) return;
      frame.active = false;
      this.kernel.release(admitted.value);
      ticket.settled = true;
      this.operations.delete(ticket);
      releaseConsumerTicket(consumers, ticket);
      resolveTicket(undefined);
    };
    let result: T;
    try {
      if (!this.kernel.checkCall(admitted.value).ok) throw new Error('host-revoked');
      result = this.context.run(frame, read);
    } catch (cause) {
      settle();
      throw cause;
    }
    // Only native Promises retain the lease. Never inspect a user result's `then` getter.
    if (types.isPromise(result)) {
      try {
        observeNativePromise.call(result, settle, settle);
      } catch (cause) {
        // The raw Promise may still settle. Without an installed observer its work
        // cannot be proven complete, so retain the ticket and cleanup custody.
        throw new Error('read-observer-refused', { cause });
      }
      return result;
    }
    settle();
    return result;
  }
  /** Publishes an operation ticket before calling the supplied operation. */
  operate<T>(work: () => T | Promise<T>): Promise<T> {
    return this.operateTracked(work);
  }
  private operateTracked<T>(work: () => T | Promise<T>, stream?: StreamRecord): Promise<T> {
    const parent = this.context.getStore();
    if (hasActiveCleanup(parent) || hasClosingStream(parent)) throw new Error('host-revoked');
    const consumers = consumerTickets(parent, stream);
    this.assertReady(this.generation);
    const admitted = this.kernel.beginCall(this.generation);
    if (!admitted.ok) throw new Error('host-revoked');
    let resolveTicket!: (value: unknown) => void;
    const ticket: Ticket = { settled: false, promise: new Promise(resolve => { resolveTicket = resolve; }) };
    const frame: CallContext = { kind: 'call', generation: this.generation, lease: admitted.value,
      active: true, stream: parent?.kind === 'call' && parent.active ? parent.stream : undefined,
      ordinaryStream: stream, parent };
    this.operations.add(ticket);
    retainConsumerTicket(consumers, ticket);
    let result: Promise<T>;
    try {
      const raw = this.context.run(frame, work);
      // Keep a native Promise as the raw work: Promise.resolve would consult a
      // hostile constructor and could turn a still-running call into a rejection.
      if (types.isPromise(raw)) result = raw as Promise<T>;
      else if (raw !== null && (typeof raw === 'object' || typeof raw === 'function'))
        throw new Error('unsupported-operation-result');
      else result = Promise.resolve(raw);
    }
    catch (cause) { result = Promise.reject(cause); }
    const settle = () => {
      if (ticket.settled) return;
      frame.active = false;
      this.kernel.release(admitted.value);
      ticket.settled = true;
      this.operations.delete(ticket);
      releaseConsumerTicket(consumers, ticket);
      resolveTicket(undefined);
    };
    // Both branches observe the result; the caller still receives its original promise.
    try { observeNativePromise.call(result, settle, settle); }
    catch (cause) {
      // The raw work may still be running. An unobservable result keeps its lease.
      throw new Error('operation-observer-refused', { cause });
    }
    return result;
  }
  /** Captures this generation for extracted methods and fences post-await writes. */
  operation<T>(work: () => T | Promise<T>) {
    const generation = this.generation;
    return () => {
      this.assertReady(generation);
      return this.operate(work);
    };
  }
  commit(value: string): void { this.effect(value); }

  /** Observe only a native raw cleanup result, bypassing a replaceable `.then`. */
  private invokeCleanup(cleanup: () => void | Promise<void>): Promise<void> {
    const scope: CleanupContext = { kind: 'cleanup', operation: this.retirementOperation,
      active: true, parent: this.context.getStore() };
    this.cleanupScopes.add(scope);
    const finishScope = () => { scope.active = false; this.cleanupScopes.delete(scope); };
    let raw: void | Promise<void>;
    try { raw = this.context.run(scope, cleanup); }
    catch (cause) { finishScope(); return Promise.reject(cause); }
    if (raw === undefined) { finishScope(); return Promise.resolve(); }
    if (!types.isPromise(raw)) {
      finishScope();
      return Promise.reject(new Error('unsupported-cleanup-result'));
    }
    return new Promise<void>((resolve, reject) => {
      try {
        observeNativePromise.call(raw,
          () => { finishScope(); resolve(); },
          cause => { finishScope(); reject(cause); });
      } catch (cause) {
        // The physical action may still be running: retain its custody as debt.
        finishScope();
        reject(new Error('cleanup-observer-refused', { cause }));
      }
    });
  }

  /** A TEST-only retained consumer. Custody is independent of invocation authority. */
  retainStream(resource: StreamResource): Readonly<{ run<T>(work: () => T | Promise<T>): Promise<T> }> {
    const context = this.context.getStore();
    if (hasActiveCleanup(context) || hasClosingStream(context)) throw new Error('stream-admission-refused');
    if (!this.isOpen() || this.lifecycle().phase !== 'active') throw new Error('stream-admission-refused');
    const custody = this.kernel.retainCustody(this.generation);
    if (!custody.ok) throw new Error(`stream-custody:${custody.reason}`);
    const record: StreamRecord = { resource, custody: custody.value, runs: new Set(), settled: false };
    this.streams.add(record);
    return Object.freeze({ run: <T>(work: () => T | Promise<T>): Promise<T> => {
      if (record.settled) throw new Error('stream-closed');
      return this.operateTracked(work, record);
    } });
  }

  /** Fixed TEST stream protocol. Callback references are captured before publication. */
  retainTerminalStream<T, U extends TerminalResultValue>(resource: TerminalStreamResource<T, U>): TerminalStreamView<T, U> {
    const context = this.context.getStore();
    if (hasActiveCleanup(context) || hasClosingStream(context)) throw new Error('stream-admission-refused');
    if (!this.isOpen() || this.lifecycle().phase !== 'active') throw new Error('stream-admission-refused');
    if (resource === null || typeof resource !== 'object') throw new Error('unsupported-stream-resource');
    const callbacks = {
      next: ownMethod(resource, 'next', true)!, result: ownMethod(resource, 'result', false),
      return: ownMethod(resource, 'return', false), close: ownMethod(resource, 'close', true)!,
    };
    const custody = this.kernel.retainCustody(this.generation);
    if (!custody.ok) throw new Error(`stream-custody:${custody.reason}`);
    const record: TerminalStreamRecord = { resource, custody: custody.value, callbacks,
      started: false, iterationEnded: false, closing: false, tickets: new Set(), settled: false };
    this.terminalStreams.add(record);
    const next = (): Promise<IteratorResult<T>> => {
      if (record.closing || record.settled || this.lifecycle().phase !== 'active')
        return Promise.reject(new Error('host-revoked'));
      if (record.iterationEnded && !record.closing) return Promise.resolve({ done: true, value: undefined });
      return this.streamCall(record, callbacks.next, value => {
        const chunk = iteratorResult<T>(value);
        if (chunk.done) record.iterationEnded = true;
        return chunk;
      }, true);
    };
    const result = (): Promise<U> => {
      if (record.closing || record.settled || this.lifecycle().phase !== 'active')
        return Promise.reject(new Error('host-revoked'));
      if (!callbacks.result) return Promise.reject(new Error('stream-result-unsupported'));
      return this.streamCall(record, callbacks.result, value => {
        if (value !== null && (typeof value === 'object' || typeof value === 'function'))
          throw new Error('unsupported-stream-result');
        return value as U;
      });
    };
    const close = () => this.startTerminalClose(record);
    const returned = (): Promise<IteratorResult<T>> => {
      const flight = observeNativePromise.call(close(),
        () => ({ done: true as const, value: undefined })) as Promise<IteratorResult<T>>;
      // A public fire-and-forget return must not leave its derived flight unobserved.
      void observeNativePromise.call(flight, undefined, () => undefined);
      return flight;
    };
    return Object.freeze({ next, result,
      return: returned,
      cancel: () => close(),
      [Symbol.asyncIterator]: () => Object.freeze({ next, return: returned }),
    });
  }

  private streamCall<T>(record: TerminalStreamRecord, callback: () => unknown,
      validate: (value: unknown) => T, startsIteration = false): Promise<T> {
    const parent = this.context.getStore();
    if (hasActiveCleanup(parent) || hasClosingStream(parent)) return Promise.reject(new Error('host-revoked'));
    const consumers = consumerTickets(parent, undefined, record);
    if (record.closing || record.settled) return Promise.reject(new Error('stream-closed'));
    this.assertReady(this.generation);
    const admitted = this.kernel.beginCall(this.generation);
    if (!admitted.ok) throw new Error('host-revoked');
    let resolveTicket!: (value: unknown) => void;
    const ticket: Ticket = { settled: false, promise: new Promise(resolve => { resolveTicket = resolve; }) };
    const frame: CallContext = { kind: 'call', generation: this.generation, lease: admitted.value,
      active: true, stream: record, parent };
    this.operations.add(ticket);
    retainConsumerTicket(consumers, ticket);
    const settle = () => {
      if (ticket.settled) return;
      frame.active = false;
      ticket.settled = true;
      this.kernel.release(admitted.value);
      this.operations.delete(ticket);
      releaseConsumerTicket(consumers, ticket);
      resolveTicket(undefined);
    };
    let raw: unknown;
    try {
      if (!this.kernel.checkCall(admitted.value).ok) throw new Error('host-revoked');
      if (startsIteration) record.started = true;
      raw = this.context.run(frame, callback);
      if (raw !== null && (typeof raw === 'object' || typeof raw === 'function') &&
          !types.isPromise(raw) && Object.getPrototypeOf(raw) !== Object.prototype && Object.getPrototypeOf(raw) !== null)
        throw new Error('unsupported-stream-output');
    } catch (cause) { settle(); return Promise.reject(cause); }
    return new Promise<T>((resolve, reject) => {
      const success = (value: unknown) => {
        settle();
        if (this.lifecycle().phase !== 'active' || record.closing || hasClosingStream(parent)) {
          reject(new Error('host-revoked'));
          return;
        }
        try { resolve(validate(value)); } catch (cause) { reject(cause); }
      };
      const failure = (cause: unknown) => { settle(); reject(cause); };
      if (!types.isPromise(raw)) { success(raw); return; }
      try { observeNativePromise.call(raw, success, failure); }
      catch (cause) { reject(new Error('stream-observer-refused', { cause })); }
    });
  }

  private startTerminalClose(record: TerminalStreamRecord): Promise<void> {
    if (record.close) return record.close;
    record.closing = true;
    let resolveClose!: () => void;
    let rejectClose!: (cause: unknown) => void;
    record.close = new Promise<void>((resolve, reject) => { resolveClose = resolve; rejectClose = reject; });
    // The Host retains this flight even if a caller does not await cancel().
    void observeNativePromise.call(record.close, undefined, () => undefined);
    const actions = [this.invokeCleanup(() => record.callbacks.close() as void | Promise<void>)];
    if (record.started && !record.iterationEnded && record.callbacks.return) {
      actions.push(this.invokeCleanup(async () => {
        const raw = record.callbacks.return!();
        if (types.isPromise(raw)) {
          await new Promise<void>((resolve, reject) => {
            try { observeNativePromise.call(raw, value => {
              try { iteratorResult(value, true); resolve(); }
              catch (cause) { reject(cause); }
            }, reject); }
            catch (cause) { reject(new Error('stream-return-observer-refused', { cause })); }
          });
        } else iteratorResult(raw, true);
      }));
    }
    const pending = [...record.tickets].map(ticket => ticket.promise);
    void Promise.allSettled([...actions, ...pending]).then(outcomes => {
      const failed = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
      if (failed) { rejectClose(failed.reason); return; }
      this.kernel.release(record.custody);
      record.settled = true;
      this.terminalStreams.delete(record);
      resolveClose();
    });
    return record.close;
  }

  requestRetirement(): RetirementReceipt {
    if (this.cohortOwner) return this.cohortOwner.request();
    this.close();
    return Object.freeze({ kind: 'requested', operationId: this.retirementId });
  }

  readRetirement(operationId: string): RetirementReadReceipt {
    if (this.cohortOwner) return this.cohortOwner.read(operationId);
    if (operationId !== this.retirementId || !this.retirement) return Object.freeze({ status: 'unknown-or-expired' });
    return this.terminal ? Object.freeze({ status: this.terminal.status }) : Object.freeze({ status: 'pending' });
  }

  observeRetirement(operationId: string, options: { signal?: AbortSignal; deadlineAt?: number } = {}): Promise<CloseReceipt | Readonly<{ status: 'unknown-or-expired' }>> {
    if (this.cohortOwner) return this.cohortOwner.observe(operationId, options);
    if (operationId !== this.retirementId || !this.retirement) return Promise.resolve(Object.freeze({ status: 'unknown-or-expired' }));
    return this.observeClose(options);
  }

  construct(run: (signal: AbortSignal) => Promise<O>, rootOf: (outcome: O) => R | undefined): Promise<Construction<R, O>> {
    if (this.constructionResult) return this.constructionResult;
    if (this.stagedResult) return Promise.reject(new Error('construction-refused'));
    if (this.lifecycle().phase !== 'staged') return Promise.reject(new Error('construction-refused'));
    const custody = this.kernel.retainCustody(this.generation);
    if (!custody.ok) return Promise.reject(new Error(`construction-custody:${custody.reason}`));
    this.custody = custody.value;
    let resolveTicket!: (value: unknown) => void;
    const ticket: Ticket = { settled: false, promise: new Promise(resolve => { resolveTicket = resolve; }) };
    this.construction = ticket;
    let resolveResult!: (result: Construction<R, O>) => void;
    const result = new Promise<Construction<R, O>>(resolve => { resolveResult = resolve; });
    this.constructionResult = result;
    const settle = (value: Construction<R, O>) => {
      this.constructionCode = value.status;
      resolveResult(value);
      ticket.settled = true;
      if (!this.resource && this.custody) {
        this.kernel.release(this.custody);
        this.custody = undefined;
      }
      resolveTicket(undefined);
    };
    let raw: Promise<O>;
    try { raw = Promise.resolve(run(this.controller!.signal)); }
    catch (cause) { raw = Promise.reject(cause); }
    raw.then(outcome => {
      if (outcome.status === 'cancelled') return settle({ status: 'cancelled', raw: outcome });
      if (outcome.status !== 'succeeded') return settle({ status: 'failed', raw: outcome });
      if (!this.isOpen()) return settle({ status: 'cancelled', raw: outcome });
      let root: R | undefined;
      try { root = rootOf(outcome); }
      catch (cause) { return settle({ status: 'failed', raw: outcome, cause }); }
      if (root === undefined) return settle({ status: 'failed', raw: outcome, cause: new Error('missing-root') });
      // No await or user callback between the final authority check and publication.
      if (!this.isOpen()) return settle({ status: 'cancelled', raw: outcome });
      const activated = this.kernel.activate(this.generation);
      if (!activated.ok) return settle({ status: 'failed', raw: outcome, cause: new Error(`kernel-activate:${activated.reason}`) });
      settle({ status: 'published', raw: outcome, root });
    }, cause => settle({ status: 'failed', cause }));
    return result;
  }

  /** Construction stays private until the exact token commits live authority. */
  constructStaged(run: (signal: AbortSignal) => Promise<O>, rootOf: (outcome: O) => R | undefined): Promise<StagedConstruction> {
    if (this.stagedResult) return this.stagedResult;
    if (this.constructionResult || this.lifecycle().phase !== 'staged' || !this.activationAuthority)
      return Promise.reject(new Error('construction-refused'));
    const custody = this.kernel.retainCustody(this.generation);
    if (!custody.ok) return Promise.reject(new Error(`construction-custody:${custody.reason}`));
    this.custody = custody.value;
    let resolveTicket!: (value: unknown) => void;
    const ticket: Ticket = { settled: false, promise: new Promise(resolve => { resolveTicket = resolve; }) };
    this.construction = ticket;
    let resolveResult!: (value: StagedConstruction) => void;
    const result = new Promise<StagedConstruction>(resolve => { resolveResult = resolve; });
    this.stagedResult = result;
    const settle = (value: StagedConstruction) => {
      this.constructionCode = value.status;
      resolveResult(value);
      ticket.settled = true;
      if (!this.resource && this.custody) {
        this.kernel.release(this.custody);
        this.custody = undefined;
      }
      resolveTicket(undefined);
    };
    let raw: Promise<O>;
    try { raw = Promise.resolve(run(this.controller!.signal)); }
    catch (cause) { raw = Promise.reject(cause); }
    raw.then(outcome => {
      if (outcome.status === 'cancelled' || !this.isOpen()) return settle(Object.freeze({ status: 'cancelled' }));
      if (outcome.status !== 'succeeded') return settle(Object.freeze({ status: 'failed', code: 'construction-failed' }));
      let root: R | undefined;
      try { root = rootOf(outcome); }
      catch { return settle(Object.freeze({ status: 'failed', code: 'construction-failed' })); }
      if (root === undefined) return settle(Object.freeze({ status: 'failed', code: 'missing-root' }));
      if (!this.isOpen()) return settle(Object.freeze({ status: 'cancelled' }));
      this.stagedRoot = root;
      const token = Object.freeze({}) as StagedToken;
      this.stagedToken = token;
      settle(Object.freeze({ status: 'constructed', token }));
    }, () => settle(Object.freeze({ status: 'failed', code: 'construction-failed' })));
    return result;
  }

  activateConstructed(token: StagedToken): Activation<R> {
    if (!this.stagedToken || token !== this.stagedToken || this.stagedRoot === undefined)
      return Object.freeze({ status: 'activation-refused', code: 'invalid-token' });
    if (this.lifecycle().phase !== 'staged')
      return Object.freeze({ status: 'activation-refused', code: 'revoked' });
    try {
      if (this.activationAuthority?.canActivate() !== true)
        return Object.freeze({ status: 'activation-refused', code: 'revoked' });
    } catch { return Object.freeze({ status: 'activation-refused', code: 'revoked' }); }
    const activated = this.kernel.activate(this.generation);
    if (!activated.ok) return Object.freeze({ status: 'activation-refused', code: 'revoked' });
    const root = this.stagedRoot;
    this.stagedRoot = undefined;
    this.stagedToken = undefined;
    this.constructionCode = 'published';
    return Object.freeze({ status: 'published', root });
  }

  close(): Promise<CloseTerminal> {
    if (this.cohortOwner && !this.retirementPrepared) {
      this.cohortOwner.request();
      return this.retirement!;
    }
    if (!this.retirementPrepared) this.revokeForCohort(this.ownRetirementOperation);
    this.signalRetirement();
    this.driveRetirement();
    return this.retirement!;
  }

  /** Cohort owner calls this for every member before any abort callback. */
  revokeForCohort(operation: RetirementOperation): Promise<CloseTerminal> {
    if (this.retirementPrepared) {
      if (this.retirementOperation !== operation) throw new Error('retirement-operation-mismatch');
      return this.retirement!;
    }
    this.retirementOperation = operation;
    for (const scope of this.cleanupScopes) scope.operation = operation;
    this.retirement = new Promise(resolve => { this.resolveRetirement = resolve; });
    this.retirementPrepared = true;
    this.stagedToken = undefined;
    this.stagedRoot = undefined;
    const revoked = this.kernel.retire(this.generation);
    if (!revoked.ok) throw new Error(`kernel-retire:${revoked.reason}`);
    return this.retirement;
  }

  signalRetirement(): void {
    if (!this.retirementPrepared) throw new Error('retirement-not-prepared');
    if (this.retirementAborted) return;
    this.retirementAborted = true;
    this.controller?.abort(RETIRE_REASON);
  }

  driveRetirement(): void {
    if (!this.retirementPrepared || !this.retirementAborted) throw new Error('retirement-not-signalled');
    if (this.retirementCleanupStarted) return;
    this.retirementCleanupStarted = true;
    // Idle consumer cleanup starts now. Busy consumers retain their physical
    // resource until their own accepted raw runs have settled.
    for (const stream of this.streams) {
      const runs = [...stream.runs];
      stream.close = runs.length === 0
        ? this.invokeCleanup(() => stream.resource.close())
        : Promise.allSettled(runs.map(ticket => ticket.promise))
          .then(() => this.invokeCleanup(() => stream.resource.close()));
    }
    for (const stream of this.terminalStreams) this.startTerminalClose(stream);
    const tickets = [...(this.construction ? [this.construction] : []), ...this.operations];
    void (async () => {
      const streamRecords = [...this.streams];
      const terminalRecords = [...this.terminalStreams];
      const allStreamRecords = [...streamRecords, ...terminalRecords];
      const closedStreams = await Promise.allSettled([...streamRecords.map(stream => stream.close!),
        ...terminalRecords.map(stream => stream.close!)]);
      await Promise.allSettled(tickets.map(ticket => ticket.promise));
      const streamFailures: CleanupFailure[] = closedStreams.flatMap((result, index) =>
        result.status === 'rejected' ? [{ debt: allStreamRecords[index]!.resource, cause: result.reason }] : []);
      let terminal: CloseTerminal;
      try {
        streamRecords.forEach((stream, index) => {
          if (closedStreams[index]?.status === 'fulfilled') {
            this.kernel.release(stream.custody);
            stream.settled = true;
            this.streams.delete(stream);
          }
        });
        if (streamFailures.length)
          throw new Error('stream-close-incomplete', { cause: streamFailures[0]!.cause });
        await this.invokeCleanup(() => this.resource?.dispose());
        if (this.custody) {
          this.kernel.release(this.custody);
          this.custody = undefined;
        }
        const finished = this.kernel.finishRetirement(this.generation);
        if (!finished.ok) throw new Error(`kernel-finish:${finished.reason}`);
        terminal = Object.freeze({ status: 'closed' });
      } catch (cause) {
        const debt = streamFailures[0]?.debt ?? this.resource!;
        const failures = streamFailures.length ? streamFailures : [{ debt, cause }];
        terminal = Object.freeze({ status: 'cleanup-incomplete', cause, debt,
          failures: Object.freeze(failures.map(failure => Object.freeze(failure))) });
      }
      this.terminal = terminal;
      for (const waiter of [...this.waiters]) waiter.wake();
      this.resolveRetirement!(terminal);
      if (terminal.status === 'closed') {
        for (const notify of [...this.physicalCompletion]) notify();
        this.physicalCompletion.clear();
      }
    })();
  }

  observeClose(options: { signal?: AbortSignal; deadlineAt?: number } = {}): Promise<CloseReceipt> {
    if (!this.retirement) return Promise.reject(new Error('close-not-started'));
    const receipt = (terminal: CloseTerminal): CloseReceipt => Object.freeze({ status: terminal.status });
    if (this.terminal) return Promise.resolve(receipt(this.terminal));
    const signal = options.signal;
    const deadlineAt = options.deadlineAt;
    if (deadlineAt !== undefined && !Number.isFinite(deadlineAt))
      return Promise.reject(new Error('invalid-deadline'));
    const current = this.context.getStore();
    if (activeCleanupIn(current, this.retirementOperation) ||
        activeCallIn(current, new Set([this.generation])))
      return Promise.resolve(Object.freeze({ status: 'self-wait' }));
    if (signal?.aborted) return Promise.resolve(Object.freeze({ status: 'pending', reason: 'aborted' }));
    if (deadlineAt !== undefined && deadlineAt <= this.timer.now())
      return Promise.resolve(Object.freeze({ status: 'pending', reason: 'deadline' }));
    return new Promise(resolve => {
      let handle: unknown;
      let done = false;
      const finish = (reason?: 'aborted' | 'deadline') => {
        if (done) return;
        done = true;
        waiter.remove();
        resolve(this.terminal ? receipt(this.terminal) : Object.freeze({ status: 'pending', reason: reason ?? (signal?.aborted ? 'aborted' : 'deadline') }));
      };
      const abort = () => finish('aborted');
      const timeout = () => {
        handle = undefined;
        if (this.terminal) return finish();
        if (signal?.aborted) return finish('aborted');
        if (deadlineAt !== undefined && deadlineAt > this.timer.now()) return schedule();
        finish('deadline');
      };
      const schedule = () => {
        if (deadlineAt !== undefined) handle = this.timer.schedule(Math.min(MAX_TIMER_DELAY, Math.max(0, deadlineAt - this.timer.now())), timeout);
      };
      const waiter: Waiter = {
        wake: () => finish(),
        remove: () => {
          this.waiters.delete(waiter);
          signal?.removeEventListener('abort', abort);
          if (handle !== undefined) this.timer.cancel(handle);
        },
      };
      this.waiters.add(waiter);
      signal?.addEventListener('abort', abort, { once: true });
      if (!done) schedule();
      if (this.terminal) finish();
      else if (signal?.aborted) finish('aborted');
      else if (deadlineAt !== undefined && deadlineAt <= this.timer.now()) finish('deadline');
    });
  }
}

export type CohortTerminal = Readonly<{ status: 'closed' | 'cleanup-incomplete' }>;
export type ObservationCohortView = Readonly<{
  observe(options?: { signal?: AbortSignal }): Promise<CloseReceipt>;
}>;
type ObserverBudget = { deadlineAt: number; expired: boolean; view: ObservationCohortView };
type CohortMember = TestHost<any, any>;

/** One fixed set of TEST generation owners; no replacement or dynamic membership. */
export class TestCohortRetirement {
  private readonly members: (CohortMember | undefined)[];
  private readonly generations: ReadonlySet<Generation>;
  private readonly operation: RetirementOperation = {};
  private readonly operationId: string;
  private readonly waiters = new Set<Waiter>();
  private readonly timer: Clock;
  private flight: Promise<CohortTerminal> | undefined;
  private terminal: CohortTerminal | undefined;
  private observerBudget: ObserverBudget | undefined;

  constructor(members: readonly CohortMember[], timer: Clock = clock, operationId = 'cohort-retirement-1') {
    if (members.length < 2 || new Set(members).size !== members.length)
      throw new Error('invalid-fixed-cohort');
    if (members.some(member => !member.canAttachCohort())) throw new Error('cohort-member-unavailable');
    this.members = [...members];
    this.generations = new Set(members.map(member => member.cohortGeneration()));
    this.timer = timer;
    this.operationId = operationId;
    const binding: CohortBinding = Object.freeze({
      operationId,
      request: () => this.requestRetirement(),
      read: operationId => this.readRetirement(operationId),
      observe: (operationId, options) => this.observeRetirement(operationId, options),
    });
    for (const [index, member] of members.entries()) {
      member.attachCohort(binding);
      member.onPhysicalCompletion(() => { this.members[index] = undefined; });
    }
  }

  /** The plugin receives only this request surface. Observe/read remain trusted Host APIs. */
  pluginView(member: CohortMember): Readonly<{ requestRetirement(): RetirementReceipt }> {
    if (!this.members.includes(member)) throw new Error('foreign-cohort-member');
    return Object.freeze({ requestRetirement: () => {
      if (!activeCallIn(callContext.getStore(), this.generations)) throw new Error('retirement-request-refused');
      return this.requestRetirement();
    } });
  }

  requestRetirement(): RetirementReceipt {
    this.close();
    return Object.freeze({ kind: 'requested', operationId: this.operationId });
  }

  close(): Promise<CohortTerminal> {
    if (this.flight) return this.flight;
    let resolveFlight!: (value: CohortTerminal) => void;
    this.flight = new Promise(resolve => { resolveFlight = resolve; });
    // Publish the exact raw flight, then revoke every route before notifying
    // any abort listener. Reentrant callbacks can only join the same flight.
    const members = this.members.filter((member): member is CohortMember => member !== undefined);
    const flights = members.map(member => member.revokeForCohort(this.operation));
    for (const member of members) member.signalRetirement();
    for (const member of members) member.driveRetirement();
    void Promise.all(flights).then(results => {
      const terminal: CohortTerminal = Object.freeze({
        status: results.every(result => result.status === 'closed') ? 'closed' : 'cleanup-incomplete',
      });
      this.terminal = terminal;
      for (const waiter of [...this.waiters]) waiter.wake();
      resolveFlight(terminal);
    });
    return this.flight;
  }

  readRetirement(operationId: string): RetirementReadReceipt {
    if (operationId !== this.operationId || !this.flight)
      return Object.freeze({ status: 'unknown-or-expired' });
    return Object.freeze({ status: this.terminal?.status ?? 'pending' });
  }

  /** A new explicit budget is available only after the prior cohort expires. */
  beginObservationCohort(operationId: string, deadlineAt: number): ObservationCohortView {
    if (operationId !== this.operationId || !this.flight) throw new Error('unknown-retirement');
    if (!Number.isFinite(deadlineAt)) throw new Error('invalid-deadline');
    const active = this.observerBudget;
    if (active && !active.expired && (active.deadlineAt > this.timer.now() || this.terminal))
      return active.view;
    if (active && !this.terminal) active.expired = true;
    let budget!: ObserverBudget;
    const view: ObservationCohortView = Object.freeze({ observe: (options: { signal?: AbortSignal } = {}) =>
      this.observeRetirementWithin(options.signal, budget) });
    budget = { deadlineAt, expired: false, view };
    this.observerBudget = budget;
    return view;
  }

  observeRetirement(operationId: string, options: { signal?: AbortSignal; deadlineAt?: number } = {}): Promise<CloseReceipt | Readonly<{ status: 'unknown-or-expired' }>> {
    if (operationId !== this.operationId || !this.flight)
      return Promise.resolve(Object.freeze({ status: 'unknown-or-expired' }));
    if (options.deadlineAt !== undefined && !Number.isFinite(options.deadlineAt))
      return Promise.reject(new Error('invalid-deadline'));
    if (activeCallIn(callContext.getStore(), this.generations) ||
        activeCleanupIn(callContext.getStore(), this.operation))
      return Promise.resolve(Object.freeze({ status: 'self-wait' }));
    if (options.deadlineAt !== undefined) this.beginObservationCohort(operationId, options.deadlineAt);
    return this.observeRetirementWithin(options.signal, this.observerBudget);
  }

  private observeRetirementWithin(signal: AbortSignal | undefined,
      budget: ObserverBudget | undefined): Promise<CloseReceipt> {
    const context = callContext.getStore();
    if (activeCallIn(context, this.generations) || activeCleanupIn(context, this.operation))
      return Promise.resolve(Object.freeze({ status: 'self-wait' }));
    const receipt = (): CloseReceipt => Object.freeze({ status: this.terminal!.status });
    if (this.terminal) return Promise.resolve(receipt());
    const deadlineAt = budget?.deadlineAt;
    if (signal?.aborted) return Promise.resolve(Object.freeze({ status: 'pending', reason: 'aborted' }));
    if (deadlineAt !== undefined && deadlineAt <= this.timer.now()) {
      if (budget) budget.expired = true;
      return Promise.resolve(Object.freeze({ status: 'pending', reason: 'deadline' }));
    }
    return new Promise(resolve => {
      let handle: unknown;
      let done = false;
      const finish = (reason?: 'aborted' | 'deadline') => {
        if (done) return;
        done = true;
        waiter.remove();
        if (!this.terminal && reason === 'deadline' && budget) budget.expired = true;
        resolve(this.terminal ? receipt() : Object.freeze({ status: 'pending', reason: reason ?? (signal?.aborted ? 'aborted' : 'deadline') }));
      };
      const abort = () => finish('aborted');
      const timeout = () => {
        handle = undefined;
        if (this.terminal) return finish();
        if (signal?.aborted) return finish('aborted');
        if (deadlineAt !== undefined && deadlineAt > this.timer.now()) return schedule();
        finish('deadline');
      };
      const schedule = () => {
        if (deadlineAt !== undefined)
          handle = this.timer.schedule(Math.min(MAX_TIMER_DELAY, Math.max(0, deadlineAt - this.timer.now())), timeout);
      };
      const waiter: Waiter = {
        wake: () => finish(),
        remove: () => {
          this.waiters.delete(waiter);
          signal?.removeEventListener('abort', abort);
          if (handle !== undefined) this.timer.cancel(handle);
        },
      };
      this.waiters.add(waiter);
      signal?.addEventListener('abort', abort, { once: true });
      if (!done) schedule();
      if (this.terminal) finish();
      else if (signal?.aborted) finish('aborted');
      else if (deadlineAt !== undefined && deadlineAt <= this.timer.now()) finish('deadline');
    });
  }
}
