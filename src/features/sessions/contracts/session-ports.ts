export type JournalPort = { readonly append: (entry: string) => void };
export type SessionInfo = { readonly id: string };
export type SessionPort = {
  readonly id: string;
  readonly roundTrip: (value: string) => string | undefined;
  readonly count: (key: string) => number;
};
