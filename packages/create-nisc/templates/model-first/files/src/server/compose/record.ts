export const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export const recordOf = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});
