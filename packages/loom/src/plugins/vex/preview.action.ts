import type { ActionDefinition } from '@niscorp/nova';
import { previewLayout, PREVIEW } from './preview.layout.js';

// The preview canvas's action: the layout over a `query` slot the mount keeps
// synced with the live query document. Canvas id equals the action id (PREVIEW).
export const previewAction: ActionDefinition = {
  id: PREVIEW,
  layout: previewLayout,
  data: { query: null },
};
