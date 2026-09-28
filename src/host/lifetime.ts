import { appendFileSync } from 'node:fs';
import { types } from 'node:util';
import { createLifecycleKernel, type CallLease, type CustodyLease, type Generation, type GenerationSnapshot } from '@get-modular/lifecycle-kernel';
const mark = (event: string): void => {
  if (process.env.TEST_MARKERS) appendFileSync(process.env.TEST_MARKERS, `${event}\n`);
};

export type OwnedResource = { readonly resourceIdentity?: symbol; dispose(): void | Promise<void> };
export type CloseTerminal = Readonly<{ status: 'closed' } | { status: 'cleanup-incomplete'; cause: unknown; debt: OwnedResource }>;
export type CloseReceipt = Readonly<{ status: 'closed' | 'cleanup-incomplete' } | { status: 'pending'; reason: 'aborted' | 'deadline' }>;
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
  private resource: OwnedResource | undefined;
  private custody: CustodyLease | undefined;
  private reserved = false;
  private retirement: Promise<CloseTerminal> | undefined;
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
      observers: this.waiters.size });
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
    this.withCall(this.generation, lease => {
      if (!this.kernel.checkCall(lease).ok) throw new Error('host-revoked');
      this.effects.push(value);
      mark(`owner:effect:${value}`);
    });
  }
  read<T>(read: () => T): T {
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
      result = read();
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
    this.assertReady(this.generation);
    const admitted = this.kernel.beginCall(this.generation);
    if (!admitted.ok) throw new Error('host-revoked');
    let resolveTicket!: (value: unknown) => void;
    const ticket: Ticket = { settled: false, promise: new Promise(resolve => { resolveTicket = resolve; }) };
    this.operations.add(ticket);
    let result: Promise<T>;
    try { result = Promise.resolve(work()); }
    catch (cause) { result = Promise.reject(cause); }
    // Both branches observe the result; the caller still receives its original promise.
    result.then(() => settle(), () => settle());
    const settle = () => {
      if (ticket.settled) return;
      this.kernel.release(admitted.value);
      ticket.settled = true;
      this.operations.delete(ticket);
      resolveTicket(undefined);
    };
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
    const tickets = [...(this.construction ? [this.construction] : []), ...this.operations];
    void (async () => {
      await Promise.allSettled(tickets.map(ticket => ticket.promise));
      let terminal: CloseTerminal;
      try {
        await this.resource?.dispose();
        if (this.custody) {
          this.kernel.release(this.custody);
          this.custody = undefined;
        }
        const finished = this.kernel.finishRetirement(this.generation);
        if (!finished.ok) throw new Error(`kernel-finish:${finished.reason}`);
        terminal = Object.freeze({ status: 'closed' });
      } catch (cause) {
        terminal = Object.freeze({ status: 'cleanup-incomplete', cause, debt: this.resource! });
      }
      this.terminal = terminal;
      for (const waiter of [...this.waiters]) waiter.wake();
      this.resolveRetirement!(terminal);
    })();
    return this.retirement;
  }

  observeClose(options: { signal?: AbortSignal; deadlineAt?: number } = {}): Promise<CloseReceipt> {
    if (!this.retirement) return Promise.reject(new Error('close-not-started'));
    const signal = options.signal;
    const deadlineAt = options.deadlineAt;
    if (deadlineAt !== undefined && !Number.isFinite(deadlineAt))
      return Promise.reject(new Error('invalid-deadline'));
    const receipt = (terminal: CloseTerminal): CloseReceipt => Object.freeze({ status: terminal.status });
    if (this.terminal) return Promise.resolve(receipt(this.terminal));
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
