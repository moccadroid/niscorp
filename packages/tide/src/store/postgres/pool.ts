// THE POOL THIS STORE RUNS ON, as much of one as it uses: a statement with its
// values, and several statements that land together or not at all. Written out
// here, so the store depends on no driver and on nobody else's name for a
// pool: vex's `PgPool`, a PGlite behind a shim and a `pg` pool wrapped to
// check a client out for each transaction are all one of these.
//
// `query` and `transaction` are called ON the object that has them, never
// taken off it first: a driver's own object has them as methods that reach
// for `this`.
export type TidePoolQuery = (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
export type TidePool = {
  query: TidePoolQuery;
  transaction?: <T>(fn: (tx: { query: TidePoolQuery }) => Promise<T>) => Promise<T>;
};

// What a statement is sent on: the pool, or the transaction a store is inside.
export type Client = { query: TidePoolQuery };

// SEVERAL STATEMENTS AS ONE. Over the pool, a transaction is opened for them.
// A store that is already inside a transaction runs them where it stands:
// they are part of the caller's transaction, and end with it.
export type Atomically = <T>(fn: (tx: Client) => Promise<T>) => Promise<T>;
