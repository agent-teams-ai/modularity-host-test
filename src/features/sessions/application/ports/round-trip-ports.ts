export type StoreForRoundTrip = {
  readonly put: (key: string, value: string) => void;
};
export type CacheForRoundTrip = {
  readonly read: (key: string) => string | undefined;
};
export type CounterForRoundTrip = {
  readonly increment: (key: string) => number;
  readonly count: (key: string) => number;
};
export type RoundTripPorts = {
  readonly store: StoreForRoundTrip;
  readonly cache: CacheForRoundTrip;
  readonly counter: CounterForRoundTrip;
};
