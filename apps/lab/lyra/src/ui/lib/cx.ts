/** Class names, skipping anything falsy. The whole of the kit's class logic. */
export const cx = (...parts: (string | false | undefined | null)[]): string => parts.filter((p): p is string => typeof p === 'string' && p !== '').join(' ');
