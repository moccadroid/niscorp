import type { ActionDefinition } from '@niscorp/nova';
import { previewLayout, PREVIEW } from './preview.layout.js';

// The preview canvas's action: the preview layout over a `config` slot the mount
// keeps in sync with the live config document. Canvas id equals the action id.
export const previewAction: ActionDefinition = {
  id: PREVIEW,
  layout: previewLayout,
  data: { config: null },
};
