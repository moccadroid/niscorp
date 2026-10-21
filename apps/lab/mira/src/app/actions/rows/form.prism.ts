// The write the form names, with each field under its key, trimmed.
export const saveRequest = {
  fingerprint: { $ref: '$.write' },
  context: {
    $fromEntries: {
      $map: {
        over: { $ref: '$.fields' },
        as: 'field',
        body: [{ $get: { from: { $var: 'field' }, path: ['key'] } }, { $trim: { $get: { from: { $var: 'field' }, path: ['value'] } } }],
      },
    },
  },
};
