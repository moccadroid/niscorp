import type { ActionDefinition } from '@niscorp/nova';
import { previewLayout, PREVIEW } from './preview.layout.js';

export const previewAction: ActionDefinition = {
  id: PREVIEW,
  layout: previewLayout,
  data: { config: null },
};
