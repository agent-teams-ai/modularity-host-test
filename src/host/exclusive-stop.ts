import type { OwnedResource } from './lifetime.ts';

export type StopReadback = 'released' | 'retry-safe' | 'unknown';
export type StopPorts = Readonly<{
  stop(attemptId: string): void | Promise<void>;
  readback(attemptId: string): StopReadback | Promise<StopReadback>;
}>;
export type StopReadReceipt = Readonly<{
  status: 'pending' | 'released' | 'retry-safe' | 'unknown' | 'stale-attempt' | 'self-wait';
}>;
type Attempt = {
  id: string;
  state: 'pending' | 'failed' | 'retry-safe' | 'released';
  failure?: unknown;
  stopFlight: Promise<StopReadReceipt>;
  readFlight?: Promise<StopReadReceipt>;
};
const receipt = (status: StopReadReceipt['status']): StopReadReceipt => Object.freeze({ status });

/** One physical completion owner. A rejected raw stop never settles dispose. */
export class ExclusiveStopRecord implements OwnedResource {
  private readonly ports: StopPorts;
  private readonly invoke: <T>(callback: () => T | Promise<T>) => Promise<T>;
  private readonly selfWait: () => boolean;
  private current: Attempt | undefined;
  private physical: Promise<void> | undefined;
  private releasePhysical: (() => void) | undefined;
  private count = 0;
  private retryFrom: string | undefined;
  private retryFlight: Promise<StopReadReceipt> | undefined;

  constructor(ports: StopPorts,
    invoke: <T>(callback: () => T | Promise<T>) => Promise<T>,
    selfWait: () => boolean = () => false) {
    this.ports = ports;
    this.invoke = invoke;
    this.selfWait = selfWait;
  }

  attemptId(): string | undefined { return this.current?.id; }

  dispose(): Promise<void> {
    if (this.physical) return this.physical;
    this.physical = new Promise<void>(resolve => { this.releasePhysical = resolve; });
    // Publish physical completion and attempt before invoking the trusted port.
    this.startStop();
    return this.physical;
  }

  reconcile(attemptId: string): Promise<StopReadReceipt> {
    const attempt = this.current;
    if (!attempt || attempt.id !== attemptId) return Promise.resolve(receipt('stale-attempt'));
    if (attempt.state === 'released') return Promise.resolve(receipt('released'));
    if (this.selfWait()) return Promise.resolve(receipt('self-wait'));
    if (attempt.readFlight) return attempt.readFlight;
    if (attempt.state === 'pending') return Promise.resolve(receipt('pending'));
    let settle!: (value: StopReadReceipt) => void;
    const flight = new Promise<StopReadReceipt>(resolve => { settle = resolve; });
    attempt.readFlight = flight;
    const finish = (value: StopReadReceipt) => {
      if (attempt.readFlight === flight) attempt.readFlight = undefined;
      settle(value);
    };
    // This callback may reenter. The exact readback flight is already visible.
    void this.invoke(() => this.ports.readback(attempt.id)).then(answer => {
      if (this.current !== attempt) { finish(receipt('stale-attempt')); return; }
      if (answer === 'released') {
        attempt.state = 'released';
        this.releasePhysical?.();
        finish(receipt('released'));
      } else if (answer === 'retry-safe' && this.count === 1) {
        attempt.state = 'retry-safe';
        finish(receipt('retry-safe'));
      } else {
        attempt.state = 'failed';
        finish(receipt('unknown'));
      }
    }, () => {
      if (this.current === attempt) attempt.state = 'failed';
      finish(receipt('unknown'));
    });
    return flight;
  }

  retry(attemptId: string): Promise<StopReadReceipt> {
    if (this.selfWait()) return Promise.resolve(receipt('self-wait'));
    if (this.retryFrom === attemptId && this.retryFlight) return this.retryFlight;
    const attempt = this.current;
    if (!attempt || attempt.id !== attemptId) return Promise.resolve(receipt('stale-attempt'));
    if (attempt.state === 'released') return Promise.resolve(receipt('released'));
    if (attempt.state === 'pending') return attempt.stopFlight;
    if (attempt.readFlight) return attempt.readFlight;
    if (attempt.state !== 'retry-safe' || this.count !== 1) return Promise.resolve(receipt('unknown'));
    let settle!: (value: StopReadReceipt) => void;
    const flight = new Promise<StopReadReceipt>(resolve => { settle = resolve; });
    this.retryFrom = attemptId;
    this.retryFlight = flight;
    void this.startStop().then(value => {
      this.retryFrom = undefined;
      this.retryFlight = undefined;
      settle(value);
    });
    return flight;
  }

  private startStop(): Promise<StopReadReceipt> {
    const id = `exclusive-stop-${++this.count}`;
    let settle!: (value: StopReadReceipt) => void;
    const flight = new Promise<StopReadReceipt>(resolve => { settle = resolve; });
    const attempt: Attempt = { id, state: 'pending', stopFlight: flight };
    this.current = attempt;
    void this.invoke(() => this.ports.stop(id)).then(() => {
      if (this.current !== attempt) { settle(receipt('stale-attempt')); return; }
      attempt.state = 'released';
      this.releasePhysical?.();
      settle(receipt('released'));
    }, cause => {
      if (this.current !== attempt) { settle(receipt('stale-attempt')); return; }
      attempt.failure = cause;
      attempt.state = 'failed';
      settle(receipt('unknown'));
    });
    return flight;
  }
}
