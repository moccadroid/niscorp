export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ');
