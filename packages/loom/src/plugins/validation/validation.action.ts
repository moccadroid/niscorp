import type { ActionDefinition } from '@niscorp/nova';
import { validationLayout, VALIDATION } from './validation.layout.js';

// The validation canvas's action: the layout over a `value` slot the mount keeps
// synced. Canvas id equals the action id (VALIDATION).
export const validationAction: ActionDefinition = {
  id: VALIDATION,
  layout: validationLayout,
  data: { value: {} },
};
