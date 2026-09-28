import { appendFileSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { types } from 'node:util';
import { createLifecycleKernel, type CallLease, type CustodyLease, type Generation, type GenerationSnapshot } from '@get-modular/lifecycle-kernel';
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
const observeNativePromise = Promise.prototype.then;
type Ticket = { settled: boolean; promise: Promise<unknown> };
type Waiter = { wake(): void; remove(): void };
type StreamRecord = { resource: StreamResource; custody: CustodyLease; runs: Set<Ticket>; close?: Promise<void>; settled: boolean };
type StreamNext<T> = () => IteratorResult<T> | Promise<IteratorResult<T>>;
type StreamResult<U> = () => U | Promise<U>;
type StreamReturn<T> = () => IteratorResult<T> | Promise<IteratorResult<T>>;
export type TerminalStreamResource<T, U> = {
  next: StreamNext<T>;
  result?: StreamResult<U>;
  return?: StreamReturn<T>;
  close(): void | Promise<void>;
};
export type TerminalStreamView<T, U> = Readonly<{
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
type CallContext = { kind: 'call'; generation: Generation; lease: CallLease;
  stream?: TerminalStreamRecord; parent?: CallContext };
type CleanupContext = { kind: 'cleanup'; operationId: string; active: boolean };
function hasClosingStream(context: CallContext | CleanupContext | undefined): boolean {
  for (let call = context?.kind === 'call' ? context : undefined; call; call = call.parent)
    if (call.stream?.closing) return true;
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

/** The only lifetime owner in this stand. It never interprets Assembly's journals as disposers. */
export class TestHost<R, O extends { readonly status: string }> {
  readonly effects: string[] = [];
  private readonly kernel = createLifecycleKernel();
  // This attempt owner is created before Assembly may load any executable module.
  private readonly generation: Generation = this.kernel.stage();
  private readonly controller = new AbortController();
  private construction: Ticket | undefined;
  private constructionResult: Promise<Construction<R, O>> | undefined;
  private readonly operations = new Set<Ticket>();
  private readonly streams = new Set<StreamRecord>();
  private readonly terminalStreams = new Set<TerminalStreamRecord>();
  private readonly context = new AsyncLocalStorage<CallContext | CleanupContext>();
  private resource: OwnedResource | undefined;
  private custody: CustodyLease | undefined;
  private reserved = false;
  private retirement: Promise<CloseTerminal> | undefined;
  private readonly retirementId = 'retirement-1';
  private resolveRetirement: ((result: CloseTerminal) => void) | undefined;
  private terminal: CloseTerminal | undefined;
  private readonly waiters = new Set<Waiter>();
  private readonly timer: Clock;

  constructor(timer: Clock = clock) { this.timer = timer; }

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

  private assertReady(generation: Generation): void {
    if (generation !== this.generation || this.lifecycle().phase !== 'active') throw new Error('host-revoked');
  }
  private withCall<T>(generation: Generation, action: (lease: CallLease) => T): T {
    const current = this.context.getStore();
    if (current?.kind === 'cleanup' || hasClosingStream(current)) throw new Error('host-revoked');
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
    if (current?.kind === 'cleanup' || hasClosingStream(current)) throw new Error('host-revoked');
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
    if (parent?.kind === 'cleanup' || hasClosingStream(parent)) throw new Error('host-revoked');
    this.assertReady(this.generation);
    const admitted = this.kernel.beginCall(this.generation);
    if (!admitted.ok) throw new Error('host-revoked');
    let resolveTicket!: (value: unknown) => void;
    const ticket: Ticket = { settled: false, promise: new Promise(resolve => { resolveTicket = resolve; }) };
    this.operations.add(ticket);
    const settle = () => {
      if (ticket.settled) return;
      this.kernel.release(admitted.value);
      ticket.settled = true;
      this.operations.delete(ticket);
      resolveTicket(undefined);
    };
    let result: T;
    try {
      if (!this.kernel.checkCall(admitted.value).ok) throw new Error('host-revoked');
      result = this.context.run({ kind: 'call', generation: this.generation, lease: admitted.value,
        stream: parent?.kind === 'call' ? parent.stream : undefined,
        parent: parent?.kind === 'call' ? parent : undefined }, read);
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
    if (parent?.kind === 'cleanup' || hasClosingStream(parent)) throw new Error('host-revoked');
    this.assertReady(this.generation);
    const admitted = this.kernel.beginCall(this.generation);
    if (!admitted.ok) throw new Error('host-revoked');
    let resolveTicket!: (value: unknown) => void;
    const ticket: Ticket = { settled: false, promise: new Promise(resolve => { resolveTicket = resolve; }) };
    this.operations.add(ticket);
    stream?.runs.add(ticket);
    let result: Promise<T>;
    try {
      const raw = this.context.run({ kind: 'call', generation: this.generation, lease: admitted.value,
        stream: parent?.kind === 'call' ? parent.stream : undefined,
        parent: parent?.kind === 'call' ? parent : undefined }, work);
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
      this.kernel.release(admitted.value);
      ticket.settled = true;
      this.operations.delete(ticket);
      stream?.runs.delete(ticket);
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
    const scope: CleanupContext = { kind: 'cleanup', operationId: this.retirementId, active: true };
    let raw: void | Promise<void>;
    try { raw = this.context.run(scope, cleanup); }
    catch (cause) { scope.active = false; return Promise.reject(cause); }
    if (raw === undefined) { scope.active = false; return Promise.resolve(); }
    if (!types.isPromise(raw)) {
      scope.active = false;
      return Promise.reject(new Error('unsupported-cleanup-result'));
    }
    return new Promise<void>((resolve, reject) => {
      try {
        observeNativePromise.call(raw,
          () => { scope.active = false; resolve(); },
          cause => { scope.active = false; reject(cause); });
      } catch (cause) {
        // The physical action may still be running: retain its custody as debt.
        scope.active = false;
        reject(new Error('cleanup-observer-refused', { cause }));
      }
    });
  }

  /** A TEST-only retained consumer. Custody is independent of invocation authority. */
  retainStream(resource: StreamResource): Readonly<{ run<T>(work: () => T | Promise<T>): Promise<T> }> {
    const context = this.context.getStore();
    if (context?.kind === 'cleanup' || hasClosingStream(context)) throw new Error('stream-admission-refused');
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
  retainTerminalStream<T, U>(resource: TerminalStreamResource<T, U>): TerminalStreamView<T, U> {
    const context = this.context.getStore();
    if (context?.kind === 'cleanup' || hasClosingStream(context)) throw new Error('stream-admission-refused');
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
      if (!callbacks.result) return Promise.reject(new Error('stream-result-unsupported'));
      return this.streamCall(record, callbacks.result, value => {
        if (value !== null && (typeof value === 'object' || typeof value === 'function'))
          throw new Error('unsupported-stream-result');
        return value as U;
      });
    };
    const close = () => this.startTerminalClose(record);
    return Object.freeze({ next, result,
      return: () => close().then(() => ({ done: true as const, value: undefined })),
      cancel: () => close(),
      [Symbol.asyncIterator]: () => Object.freeze({ next, return: () => close().then(() => ({ done: true as const, value: undefined })) }),
    });
  }

  private streamCall<T>(record: TerminalStreamRecord, callback: () => unknown,
      validate: (value: unknown) => T, startsIteration = false): Promise<T> {
    const parent = this.context.getStore();
    if (parent?.kind === 'cleanup' || hasClosingStream(parent)) return Promise.reject(new Error('host-revoked'));
    if (record.closing || record.settled) return Promise.reject(new Error('stream-closed'));
    this.assertReady(this.generation);
    const admitted = this.kernel.beginCall(this.generation);
    if (!admitted.ok) throw new Error('host-revoked');
    let resolveTicket!: (value: unknown) => void;
    const ticket: Ticket = { settled: false, promise: new Promise(resolve => { resolveTicket = resolve; }) };
    this.operations.add(ticket);
    record.tickets.add(ticket);
    const settle = () => {
      if (ticket.settled) return;
      ticket.settled = true;
      this.kernel.release(admitted.value);
      this.operations.delete(ticket);
      record.tickets.delete(ticket);
      resolveTicket(undefined);
    };
    let raw: unknown;
    try {
      if (!this.kernel.checkCall(admitted.value).ok) throw new Error('host-revoked');
      if (startsIteration) record.started = true;
      raw = this.context.run({ kind: 'call', generation: this.generation, lease: admitted.value,
        stream: record, parent: parent?.kind === 'call' ? parent : undefined }, callback);
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
    this.close();
    return Object.freeze({ kind: 'requested', operationId: this.retirementId });
  }

  readRetirement(operationId: string): RetirementReadReceipt {
    if (operationId !== this.retirementId || !this.retirement) return Object.freeze({ status: 'unknown-or-expired' });
    return this.terminal ? Object.freeze({ status: this.terminal.status }) : Object.freeze({ status: 'pending' });
  }

  observeRetirement(operationId: string, options: { signal?: AbortSignal; deadlineAt?: number } = {}): Promise<CloseReceipt | Readonly<{ status: 'unknown-or-expired' }>> {
    if (operationId !== this.retirementId || !this.retirement) return Promise.resolve(Object.freeze({ status: 'unknown-or-expired' }));
    return this.observeClose(options);
  }

  construct(run: (signal: AbortSignal) => Promise<O>, rootOf: (outcome: O) => R | undefined): Promise<Construction<R, O>> {
    if (this.constructionResult) return this.constructionResult;
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
      resolveResult(value);
      ticket.settled = true;
      if (!this.resource && this.custody) {
        this.kernel.release(this.custody);
        this.custody = undefined;
      }
      resolveTicket(undefined);
    };
    let raw: Promise<O>;
    try { raw = Promise.resolve(run(this.controller.signal)); }
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

  close(): Promise<CloseTerminal> {
    if (this.retirement) return this.retirement;
    this.retirement = new Promise(resolve => { this.resolveRetirement = resolve; });
    const revoked = this.kernel.retire(this.generation);
    if (!revoked.ok) throw new Error(`kernel-retire:${revoked.reason}`);
    this.controller.abort();
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
    })();
    return this.retirement;
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
    const currentCall = current?.kind === 'call' && current.generation === this.generation
      ? this.kernel.checkCall(current.lease) : undefined;
    if (current?.kind === 'cleanup' && current.operationId === this.retirementId && current.active ||
        currentCall && !currentCall.ok && currentCall.reason === 'revoked')
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
