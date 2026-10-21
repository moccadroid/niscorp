const fieldOf = (key: string): unknown => ({ $get: { from: { $var: 'field' }, path: [key] } });

// The write the form names, with each field under its key, trimmed.
export const saveRequest = {
  fingerprint: { $ref: '$.write' },
  context: { $fromEntries: { $map: { over: { $ref: '$.fields' }, as: 'field', body: [fieldOf('key'), { $trim: fieldOf('value') }] } } },
};
