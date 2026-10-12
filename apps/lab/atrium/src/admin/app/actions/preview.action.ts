import type { ActionDefinition } from '@niscorp/nova';

// Declared so the operator's `admin.*` grant covers it and moss's closure audit
// sees the push aimed at it; its layout is replaced at preview time.
export const previewAction: ActionDefinition = {
  id: 'admin.preview',
  title: 'Preview',
  data: {},
  layout: { component: 'Empty', props: { icon: 'alert', title: 'Nothing to preview', hint: 'This action takes its layout from the app server at preview time.' } },
};
