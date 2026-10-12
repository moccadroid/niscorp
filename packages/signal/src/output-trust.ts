// For the no-schema return only. There `T` is `string` by construction (`createSignal()`
// starts as `Signal<string>` and only `.schema()` changes `T`), which a generic body cannot
// prove from a runtime `!schema` check.
export const asOutput = <T>(content: string): T => content as unknown as T;
