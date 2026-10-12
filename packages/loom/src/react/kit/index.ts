import { createComponentRegistry, type ComponentRegistry } from '@niscorp/nova';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { Roles } from '@compile/roles';
import { LOOM_COLUMN } from '@editor/default.layout';
import { LoomGroup, LoomField } from './fields.js';
import { LoomText, LoomNumber, LoomCheckbox, LoomSelect, LoomRaw } from './controls.js';
import { LoomBranch, LoomVariant } from './variant.js';
import { LoomArray, LoomArrayItem, LoomBox, LoomColumn, LoomAppend, LoomRowMenu } from './array.js';

export { LoomGroup, LoomField } from './fields.js';
export { LoomText, LoomNumber, LoomCheckbox, LoomSelect, LoomRaw } from './controls.js';
export { LoomBranch, LoomVariant } from './variant.js';
export { LoomArray, LoomArrayItem, LoomBox, LoomColumn, LoomAppend, LoomRowMenu } from './array.js';
export { JsonEditor } from './json-editor.js';
export { ActionMenu, MenuItem, SubMenu } from './menu.js';

export const loomComponents: Record<string, NovaComponent> = {
  [Roles.group]: LoomGroup,
  [Roles.field]: LoomField,
  [Roles.box]: LoomBox,
  [Roles.array]: LoomArray,
  [Roles.arrayItem]: LoomArrayItem,
  [Roles.variant]: LoomVariant,
  [Roles.branch]: LoomBranch,
  [Roles.append]: LoomAppend,
  [Roles.rowMenu]: LoomRowMenu,
  [Roles.text]: LoomText,
  [Roles.number]: LoomNumber,
  [Roles.checkbox]: LoomCheckbox,
  [Roles.select]: LoomSelect,
  [Roles.raw]: LoomRaw,
  [LOOM_COLUMN]: LoomColumn,
};

export const createLoomRegistry = (): ComponentRegistry<NovaComponent> => {
  const registry = createComponentRegistry<NovaComponent>();
  registry.registerAll(loomComponents);
  return registry;
};
