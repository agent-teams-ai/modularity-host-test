import { TestHost, type Clock, type CloseReceipt, type CloseTerminal } from './lifetime.ts';

const UNRESOLVED_LIMIT = 64;
const RECEIPT_LIMIT = 256;
const observeNativePromise = Promise.prototype.then;
type RetainedHost = TestHost<unknown, { readonly status: string }>;
type Entry = { host: RetainedHost; flight?: Promise<CloseTerminal>; retirementId?: string };
export type RecoveryReceipt = Readonly<{
  status: 'closed'; operationId: string;
  outcomeCode: 'not-started' | 'published' | 'cancelled' | 'failed';
  summary: 'physical cleanup complete';
}>;
export type RecoveryRead = RecoveryReceipt | Readonly<{
  status: 'open' | 'pending' | 'cleanup-incomplete' | 'unknown-or-expired';
}>;
export type RecoveryClose = RecoveryReceipt | CloseTerminal | Readonly<{ status: 'unknown-or-expired' }>;

/** In-memory TEST harness owner, created before any candidate executable work. */
export class TestRecoveryOwner {
  private nextId = 1n;
  private readonly unresolved = new Map<string, Entry>();
  private readonly receipts = new Map<string, RecoveryReceipt>();

  reserve(timer?: Clock): Readonly<{ operationId: string; host: RetainedHost }> {
    if (this.unresolved.size >= UNRESOLVED_LIMIT) throw new Error('recovery-capacity-refused');
    const operationId = `test-operation-${this.nextId++}`;
    const host = new TestHost(timer);
    this.unresolved.set(operationId, { host });
    host.onPhysicalCompletion(() => {
      const entry = this.unresolved.get(operationId);
      if (!entry || entry.host !== host) throw new Error('recovery-owner-mismatch');
      const receipt: RecoveryReceipt = Object.freeze({
        status: 'closed', operationId, outcomeCode: host.safeConstructionCode(),
        summary: 'physical cleanup complete',
      });
      host.compactClosed();
      this.unresolved.delete(operationId);
      this.receipts.set(operationId, receipt);
      if (this.receipts.size > RECEIPT_LIMIT)
        this.receipts.delete(this.receipts.keys().next().value!);
    });
    return Object.freeze({ operationId, host });
  }

  read(operationId: string): RecoveryRead {
    const receipt = this.receipts.get(operationId);
    if (receipt) return receipt;
    const entry = this.unresolved.get(operationId);
    if (!entry) return Object.freeze({ status: 'unknown-or-expired' });
    const status = entry.host.status().state;
    return Object.freeze({ status: status === 'open' ? 'open' :
      status === 'cleanup-incomplete' ? 'cleanup-incomplete' : 'pending' });
  }

  close(operationId: string): Promise<RecoveryClose> {
    const receipt = this.receipts.get(operationId);
    if (receipt) return Promise.resolve(receipt);
    const entry = this.unresolved.get(operationId);
    if (!entry) return Promise.resolve(Object.freeze({ status: 'unknown-or-expired' }));
    if (!entry.flight) {
      // Publish inventory flight before abort listeners or cleanup can reenter.
      let resolve!: (value: CloseTerminal) => void;
      let reject!: (cause: unknown) => void;
      entry.flight = new Promise<CloseTerminal>((yes, no) => { resolve = yes; reject = no; });
      entry.retirementId = entry.host.currentRetirementId();
      try { observeNativePromise.call(entry.host.close(), resolve, reject); }
      catch (cause) { reject(cause); }
    }
    return entry.flight;
  }

  observe(operationId: string, options: { signal?: AbortSignal; deadlineAt?: number } = {}): Promise<RecoveryRead | CloseReceipt> {
    const state = this.read(operationId);
    if (state.status !== 'pending' && state.status !== 'cleanup-incomplete') return Promise.resolve(state);
    const entry = this.unresolved.get(operationId);
    // Completion can move an ID from unresolved to receipts between reads.
    if (!entry) return Promise.resolve(this.read(operationId));
    return entry.host.observeRetirement(entry.retirementId ?? entry.host.currentRetirementId(), options);
  }
}
