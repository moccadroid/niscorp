// `query` and `transaction` are called on the object that has them, never taken off it: a driver's methods reach for `this`.
export type TidePoolQuery = (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
export type TidePool = {
  query: TidePoolQuery;
  transaction?: <T>(fn: (tx: { query: TidePoolQuery }) => Promise<T>) => Promise<T>;
};

export type Client = { query: TidePoolQuery };

export type Atomically = <T>(fn: (tx: Client) => Promise<T>) => Promise<T>;
