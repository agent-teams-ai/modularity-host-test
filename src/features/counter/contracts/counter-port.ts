export type CounterPort = {
  readonly increment: (key: string) => number;
  readonly count: (key: string) => number;
};
