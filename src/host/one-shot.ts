import { appendFileSync } from 'node:fs';

const mark = (event: string): void => {
  if (process.env.TEST_MARKERS) appendFileSync(process.env.TEST_MARKERS, `${event}\n`);
};

export type OwnedResource = { readonly resourceIdentity: symbol; dispose(): void };

// The checkpoint-2 owner retains the actual fixture resource and in-memory sink.
// Concurrent construction and revocation semantics belong to checkpoint 3.
export class OneShotOwner {
  readonly effects: string[] = [];
  private resource: OwnedResource | undefined;
  private closed = false;
  isOpen(): boolean { return !this.closed; }
  matchesResourceIdentities(first: unknown, second: unknown): boolean {
    return typeof this.resource?.resourceIdentity === 'symbol' &&
      first === this.resource.resourceIdentity && second === this.resource.resourceIdentity;
  }
  acquire(resource: OwnedResource): void {
    if (this.closed || this.resource) throw new Error('owner-unavailable');
    this.resource = resource;
    mark('owner:acquire');
  }
  effect(value: string): void {
    if (this.closed) throw new Error('owner-closed');
    this.effects.push(value);
    mark(`owner:effect:${value}`);
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.resource?.dispose();
  }
}
