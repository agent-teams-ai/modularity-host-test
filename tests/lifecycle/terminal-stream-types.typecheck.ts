import type { TerminalStreamResource } from '../../src/host/lifetime.ts';

const primitiveResult: TerminalStreamResource<number, string> = {
  next: () => ({ done: true, value: undefined }),
  result: () => 'ready',
  close: () => undefined,
};
void primitiveResult;

// The TEST result protocol rejects objects at runtime, so the type must too.
// @ts-expect-error object results are outside the supported TEST protocol
type UnsupportedResult = TerminalStreamResource<number, { value: string }>;
void (0 as unknown as UnsupportedResult);
