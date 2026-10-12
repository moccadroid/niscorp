// trustErased: agents of every <TData, TDeps> are held and called through one
// erased shape, and parameter contravariance makes a typed definition
// unassignable to it.
// trustUndefinedData: an agent without an output schema has TData = undefined,
// which the compiler cannot conclude inside a generic helper.

export const trustErased = <T>(value: unknown): T => value as T;

export const trustUndefinedData = <TData>(): TData => undefined as TData;
