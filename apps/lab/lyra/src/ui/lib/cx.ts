export const cx = (...parts: (string | false | undefined | null)[]): string => parts.filter((p): p is string => typeof p === 'string' && p !== '').join(' ');
