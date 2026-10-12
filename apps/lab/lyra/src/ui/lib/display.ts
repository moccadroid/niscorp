export const displayText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (typeof value === 'object' && 'message' in value) {
    const message = (value as { message: unknown }).message;
    if (typeof message === 'string' && message !== '') return message;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
};
