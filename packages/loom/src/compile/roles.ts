export const Roles = {
  box: 'loom:box',
  group: 'loom:group',
  array: 'loom:array',
  arrayItem: 'loom:array-item',
  variant: 'loom:variant',
  branch: 'loom:branch',

  field: 'loom:field',

  text: 'loom:text',
  number: 'loom:number',
  checkbox: 'loom:checkbox',
  select: 'loom:select',
  raw: 'loom:raw',

  append: 'loom:append',
  rowMenu: 'loom:row-menu',
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];
