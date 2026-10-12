import { defineApp } from '@niscorp/moss';
import type { NiscApp } from '@niscorp/moss';
import type { Seam } from '@atrium/admin/seam';
import { ADMIN_CHARTER, ADMIN_ASSIGNMENTS } from './charter';
import { ADMIN_ACTIONS } from './actions';
import { previewFragment } from './actions/preview.fragment';
import { adminFunctions } from './functions';
import { adminFrame } from './frame.layout';

export const buildAdmin = (seam: Seam): NiscApp =>
  defineApp({
    charter: ADMIN_CHARTER,
    assignments: ADMIN_ASSIGNMENTS,
    actions: ADMIN_ACTIONS,

    functions: (session) => adminFunctions(session, seam),

    shell: {
      canvases: [{ id: 'admin', initial: 'admin.dock' }],
      layout: adminFrame,
      fragments: { preview: previewFragment },
    },
  });
