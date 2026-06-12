// The widget vocabulary the compiler emits as Nova component names. Each is
// an abstract role; a kit registers a concrete component under the name, so
// swapping the kit swaps the pixels without touching the compiler. Small and
// stable on purpose — sub-variants ride as props, not new roles.
//
// Structural shapes (objects, arrays, unions) are compiled compositions of
// these roles, not roles of their own.

export const Roles = {
  // Layout primitives — arrange other nodes.
  box: 'loom:box', // a flexible cell that grows to fill its row (an array item's editor)
  group: 'loom:group',
  array: 'loom:array',
  arrayItem: 'loom:array-item',
  variant: 'loom:variant',
  // One branch of a variant — shows itself only when it's the active branch
  // (the widget matches the value to a branch in JS and tells it through context).
  branch: 'loom:branch',

  // Field wrapper — label, description, error, and required marker around one control.
  field: 'loom:field',

  // Controls — edit a value; emit `ui:model`.
  text: 'loom:text',
  number: 'loom:number',
  checkbox: 'loom:checkbox',
  select: 'loom:select',
  raw: 'loom:raw',

  // List actions — model writes to the bound array (no triggers). `append` adds
  // a default element to the list it binds. `rowMenu` is the per-row actions menu
  // (move / remove, and wrap / unwrap when the list's items are a recursive union
  // with container variants); it reads `$items` and `$index` and writes the new
  // array. Both work at any depth, since the bound path resolves per render.
  append: 'loom:append',
  rowMenu: 'loom:row-menu',
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];
