// Class-name join. The only place kit classes are combined.
export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ');
