import type { ActionDefinition } from '@niscorp/nova';
import { validationLayout, VALIDATION } from './validation.layout.js';

export const validationAction: ActionDefinition = {
  id: VALIDATION,
  layout: validationLayout,
  data: { value: {} },
};
