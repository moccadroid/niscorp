import type { ActionDefinition } from '@niscorp/nova';
import { previewLayout, PREVIEW } from './preview.layout.js';

// The preview action: the preview layout over a `documents` data slot the mount
// keeps in sync. Canvas id equals the action id (PREVIEW).
export const previewAction: ActionDefinition = {
  id: PREVIEW,
  layout: previewLayout,
  data: { documents: {} },
};
